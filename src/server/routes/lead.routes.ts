import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requirePermissions, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '../auth/roles.js';
import { LeadDistributionService } from '../leads/leadDistributionService.js';
import { LEAD_STATUS, type LeadStatus } from '../leads/types.js';

export const leadRouter = Router();

// Require authentication for all lead management endpoints
leadRouter.use(authenticate);

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

const ingestLeadSchema = z.object({
  source: z.string().min(1, 'Lead source is required'),
  sourceReference: z.string().optional().nullable(),
  customerName: z.string().min(2, 'Customer name must be at least 2 characters'),
  customerPhone: z.string().min(7, 'Customer phone is required'),
  customerEmail: z.string().email('Invalid email address').optional().nullable(),
  serviceId: z.string().min(1, 'serviceId is required'),
  city: z.string().min(2, 'City is required'),
  district: z.string().min(2, 'District is required'),
  state: z.string().min(2, 'State is required'),
  pin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const acceptOpportunitySchema = z.object({
  notes: z.string().optional().nullable(),
});

// ==========================================
// LEAD INTAKE & DISTRIBUTION ENDPOINTS
// ==========================================

/**
 * POST /api/v1/leads
 * Ingest a new lead and automatically execute matching & distribution to eligible active campaign franchise.
 */
leadRouter.post(
  '/',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = ingestLeadSchema.parse(req.body);

      const result = await LeadDistributionService.ingestLead(validated, {
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        message:
          result.matchResult.status === 'offered'
            ? 'Lead ingested and offered to matching franchise campaign'
            : 'Lead ingested and moved to Own Lead Center (no matching active campaign)',
        data: result.lead,
        routing: result.matchResult,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/leads
 * List leads. Scoped to assigned franchise unless caller is Super Admin.
 */
leadRouter.get(
  '/',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const filter = {
        status: req.query.status as LeadStatus,
        serviceId: req.query.serviceId as string,
        city: req.query.city as string,
        district: req.query.district as string,
        state: req.query.state as string,
        franchiseId: isSuperAdmin ? (req.query.franchiseId as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await LeadDistributionService.listLeads(filter, orgScope);

      res.json({
        success: true,
        data: result.leads,
        meta: {
          total: result.total,
          limit: filter.limit,
          offset: filter.offset,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/leads/opportunities
 * Franchise opportunity inbox. Returns pending (or all) lead opportunities offered to caller's franchise.
 */
leadRouter.get(
  '/opportunities',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.organizationId;
      if (!franchiseId) {
        res.status(400).json({
          success: false,
          error: { message: 'Authenticated user is not linked to a franchise organization' },
        });
        return;
      }

      const status = (req.query.status as 'pending' | 'accepted' | 'expired' | 'all') || 'pending';
      const opportunities = await LeadDistributionService.listFranchiseOpportunities(franchiseId, status);

      res.json({
        success: true,
        data: opportunities,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/leads/process-expired
 * Maintenance endpoint (Super Admin) to process all timed-out opportunities and re-distribute them.
 */
leadRouter.post(
  '/process-expired',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await LeadDistributionService.processAllExpiredOpportunities({
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: `Processed ${result.processedCount} expired lead opportunities`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/leads/:id
 * Get single lead by ID with current opportunity window status and assignment history.
 */
leadRouter.get(
  '/:id',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const lead = await LeadDistributionService.getLeadById(req.params.id, orgScope);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: { message: `Lead with ID '${req.params.id}' not found` },
        });
        return;
      }

      res.json({
        success: true,
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/leads/opportunities/:id/accept
 * Franchise accepts a temporary (1-hour) opportunity.
 * Once accepted, lead is permanently assigned to that franchise.
 * Concurrency protected.
 */
leadRouter.post(
  '/opportunities/:id/accept',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.organizationId;
      if (!franchiseId) {
        res.status(400).json({
          success: false,
          error: { message: 'Authenticated user is not linked to a franchise organization' },
        });
        return;
      }

      const body = acceptOpportunitySchema.parse(req.body || {});
      const result = await LeadDistributionService.acceptOpportunity(
        req.params.id,
        franchiseId,
        body.notes,
        {
          userId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );

      res.json({
        success: true,
        message: 'Lead opportunity accepted successfully. Lead is permanently assigned to your franchise.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/leads/opportunities/:id/release
 * Manually or automatically trigger release of an expired opportunity for re-distribution.
 */
leadRouter.post(
  '/opportunities/:id/release',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const franchiseId = req.user?.organizationId || undefined;

      const result = await LeadDistributionService.releaseExpiredOpportunity(req.params.id, {
        userId: req.user?.id,
        franchiseId,
        isSuperAdmin,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Expired opportunity released and lead re-routed',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);
