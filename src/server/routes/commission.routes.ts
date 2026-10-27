import { Router } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { CommissionLedgerService } from '../commissions/commissionLedgerService.js';
import {
  LEDGER_ENTRY_TYPE,
  LEDGER_CATEGORY,
} from '../commissions/types.js';
import {
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from '../errors/AppError.js';
import type { ApiResponse } from '../types/index.js';

export const commissionRouter = Router();

// Protect ALL commission endpoints with authentication
commissionRouter.use(authenticate);

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

const postTransactionSchema = z.object({
  organizationId: z.string().min(2, 'Organization ID is required'),
  entryType: z.enum([LEDGER_ENTRY_TYPE.CREDIT, LEDGER_ENTRY_TYPE.DEBIT]),
  category: z.enum([
    LEDGER_CATEGORY.COMMISSION_EARNED,
    LEDGER_CATEGORY.MANUAL_ADJUSTMENT_CREDIT,
    LEDGER_CATEGORY.MANUAL_ADJUSTMENT_DEBIT,
    LEDGER_CATEGORY.PAYOUT_TRANSFER,
    LEDGER_CATEGORY.CORRECTION_REVERSAL,
    LEDGER_CATEGORY.CAMPAIGN_DAILY_CHARGE,
  ]),
  amount: z.number().positive('Amount must be a positive number'),
  referenceId: z.string().min(3, 'Transaction reference ID is required'),
  externalReference: z.string().optional().nullable(),
  description: z.string().min(3, 'Description is required'),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const adminAdjustmentSchema = z.object({
  organizationId: z.string().min(2, 'Organization ID is required'),
  adjustmentType: z.enum(['credit', 'debit']),
  amount: z.number().positive('Adjustment amount must be a positive number'),
  reason: z.string().min(3, 'Adjustment reason is required'),
  referenceId: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const listLedgerQuerySchema = z.object({
  organizationId: z.string().optional(),
  entryType: z.enum([LEDGER_ENTRY_TYPE.CREDIT, LEDGER_ENTRY_TYPE.DEBIT]).optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ==========================================
// FRANCHISE BALANCE & LEDGER APIS
// ==========================================

/**
 * GET /api/v1/commissions/balance
 * Returns balance and account summary for the authenticated franchise user's organization.
 * Admins can pass ?organizationId=... to view any franchise balance.
 */
commissionRouter.get(
  '/balance',
  asyncHandler(async (req, res) => {
    const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
    let targetOrgId = req.user?.organizationId;

    if (isSuperAdmin && req.query.organizationId) {
      targetOrgId = req.query.organizationId as string;
    }

    if (!targetOrgId) {
      throw new BadRequestError('Organization ID is required to retrieve commission balance');
    }

    const account = await CommissionLedgerService.getAccountDetail(targetOrgId);
    if (!account) {
      throw new NotFoundError('Commission account not found');
    }

    const response: ApiResponse<typeof account> = {
      success: true,
      data: account,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * GET /api/v1/commissions/settlement-statement
 * Franchise settlement statement.
 * Access:
 * - Super Admin: any franchise (must pass organizationId or franchiseId)
 * - Franchise Owner: own account only (strictly scoped to req.user.organizationId)
 */
commissionRouter.get(
  '/settlement-statement',
  asyncHandler(async (req, res) => {
    const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
    let targetOrgId = req.user?.organizationId;

    if (isSuperAdmin) {
      const queryOrg = (req.query.organizationId || req.query.franchiseId) as string;
      if (queryOrg && queryOrg.trim().length > 0) {
        targetOrgId = queryOrg.trim();
      } else if (!targetOrgId) {
        // Fallback to first available franchise commission account if super admin didn't specify one
        const db = getDatabase();
        const firstAccount = await db.query<any>(
          `SELECT organization_id FROM franchise_commission_accounts ORDER BY created_at ASC LIMIT 1`
        );
        if (firstAccount.length > 0 && firstAccount[0].organization_id) {
          targetOrgId = firstAccount[0].organization_id;
        } else {
          throw new BadRequestError(
            'organizationId or franchiseId query parameter is required for Super Admin to generate settlement statement'
          );
        }
      }
    } else {
      // Franchise user - strict tenant isolation
      if (!targetOrgId) {
        throw new ForbiddenError('You are not associated with a franchise organization');
      }

      const queryOrg = (req.query.organizationId || req.query.franchiseId) as string;
      if (queryOrg && queryOrg.trim() !== targetOrgId) {
        throw new ForbiddenError(
          'You do not have permission to view settlement statements for another franchise'
        );
      }
    }

    if (!targetOrgId) {
      throw new BadRequestError('Target franchise organization is required to generate settlement statement');
    }

    const filter = {
      startDate:
        typeof req.query.startDate === 'string' && req.query.startDate
          ? req.query.startDate
          : undefined,
      endDate:
        typeof req.query.endDate === 'string' && req.query.endDate
          ? req.query.endDate
          : undefined,
    };

    const statement = await CommissionLedgerService.getSettlementStatement(
      targetOrgId,
      filter,
      {
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    const response: ApiResponse<typeof statement> = {
      success: true,
      data: statement,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * GET /api/v1/commissions/ledger
 * Returns immutable ledger entries with running balance for the authenticated franchise or admin.
 * Franchise users are scoped strictly to their own organization.
 */
commissionRouter.get(
  '/ledger',
  validate({ query: listLedgerQuerySchema }),
  asyncHandler(async (req, res) => {
    const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
    let targetOrgId = req.user?.organizationId;

    if (isSuperAdmin) {
      targetOrgId = (req.query.organizationId as string) || undefined;
    } else {
      // Franchise user cannot view another franchise's ledger
      if (!targetOrgId) {
        throw new ForbiddenError('You are not associated with a franchise organization');
      }
      if (req.query.organizationId && req.query.organizationId !== targetOrgId) {
        throw new ForbiddenError('Access denied: Cannot query ledger of another organization');
      }
    }

    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const result = await CommissionLedgerService.listLedgerEntries({
      organizationId: targetOrgId,
      entryType: req.query.entryType as any,
      category: req.query.category as any,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit,
      offset,
    });

    const response: ApiResponse<typeof result.entries> = {
      success: true,
      data: result.entries,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit) || 1,
        },
      },
    };
    res.json(response);
  })
);

/**
 * GET /api/v1/commissions/ledger/:referenceId
 * Lookup a specific ledger transaction by reference ID
 */
commissionRouter.get(
  '/ledger/:referenceId',
  asyncHandler(async (req, res) => {
    const entry = await CommissionLedgerService.getLedgerEntryByReference(req.params.referenceId);
    if (!entry) {
      throw new NotFoundError(`Ledger entry with reference ID '${req.params.referenceId}' not found`);
    }

    // Enforce tenant isolation for non-super_admins
    const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
    if (!isSuperAdmin && entry.organization_id !== req.user?.organizationId) {
      throw new ForbiddenError('Access denied to this ledger transaction');
    }

    const response: ApiResponse<typeof entry> = {
      success: true,
      data: entry,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

// ==========================================
// ADMIN APIS
// ==========================================

/**
 * Admin Action: GET /api/v1/commissions/accounts
 * Lists all franchise commission accounts (Super Admin only)
 */
commissionRouter.get(
  '/accounts',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const accounts = await CommissionLedgerService.listAccounts();

    const response: ApiResponse<typeof accounts> = {
      success: true,
      data: accounts,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * Admin Action: POST /api/v1/commissions/adjustments
 * Post an admin commission adjustment (Credit or Debit)
 * Super Admin only. Concurrency-safe and generates an immutable ledger entry.
 */
commissionRouter.post(
  '/adjustments',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: adminAdjustmentSchema }),
  asyncHandler(async (req, res) => {
    const result = await CommissionLedgerService.applyAdminAdjustment(req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.status(201).json(response);
  })
);

/**
 * Admin Action: POST /api/v1/commissions/transactions
 * Post an explicit commission transaction (Super Admin only)
 */
commissionRouter.post(
  '/transactions',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: postTransactionSchema }),
  asyncHandler(async (req, res) => {
    const result = await CommissionLedgerService.postTransaction(req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.status(201).json(response);
  })
);
