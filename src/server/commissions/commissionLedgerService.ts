import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../errors/AppError.js';
import type { DatabaseAdapter, DatabaseTransaction } from '../types/index.js';
import {
  LEDGER_ENTRY_TYPE,
  LEDGER_CATEGORY,
  type FranchiseCommissionAccountModel,
  type CommissionLedgerEntryModel,
  type FranchiseCommissionAccountDetail,
  type LedgerEntryType,
  type LedgerCategory,
  type SettlementStatementResult,
} from './types.js';

export interface PostCommissionTransactionDto {
  organizationId: string;
  entryType: LedgerEntryType; // 'credit' | 'debit'
  category: LedgerCategory;
  amount: number; // positive number
  referenceId: string;
  externalReference?: string | null;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export interface AdminCommissionAdjustmentDto {
  organizationId: string;
  adjustmentType: 'credit' | 'debit';
  amount: number; // positive number
  reason: string;
  referenceId?: string;
  notes?: string | null;
}

export interface ListLedgerFilter {
  organizationId?: string;
  entryType?: LedgerEntryType;
  category?: LedgerCategory;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class CommissionLedgerService {
  /**
   * Ensure or get commission account for an organization.
   * Auto-creates an account if organization is valid and active.
   */
  static async getOrCreateAccount(
    organizationId: string,
    dbOverride?: DatabaseAdapter | DatabaseTransaction
  ): Promise<FranchiseCommissionAccountModel> {
    const db = dbOverride || getDatabase();
    const rows = await db.query<FranchiseCommissionAccountModel>(
      `SELECT * FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1`,
      [organizationId]
    );

    if (rows.length > 0) {
      return {
        ...rows[0],
        current_balance: Number(rows[0].current_balance),
        version: Number(rows[0].version),
        zero_balance_buy_count: Number((rows[0] as any).zero_balance_buy_count || 0),
      };
    }

    // Verify organization exists
    const orgs = await db.query<any>(
      `SELECT id, name FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    if (orgs.length === 0) {
      throw new NotFoundError(`Organization with ID '${organizationId}' not found`);
    }

    const newId = `comm_acc_${organizationId}`;
    await db.execute(
      `INSERT INTO franchise_commission_accounts (id, organization_id, current_balance, currency, version)
       VALUES (?, ?, 0.0, 'INR', 1)`,
      [newId, organizationId]
    );

    const created = await db.query<FranchiseCommissionAccountModel>(
      `SELECT * FROM franchise_commission_accounts WHERE id = ? LIMIT 1`,
      [newId]
    );

    return {
      ...created[0],
      current_balance: Number(created[0].current_balance),
      version: Number(created[0].version),
      zero_balance_buy_count: 0,
    };
  }

  /**
   * Get account detail along with franchise profile info
   */
  static async getAccountDetail(organizationId: string): Promise<FranchiseCommissionAccountDetail | null> {
    const db = getDatabase();
    const account = await this.getOrCreateAccount(organizationId);

    const profileRows = await db.query<any>(
      `SELECT franchise_code, operating_name FROM franchise_profiles WHERE organization_id = ? LIMIT 1`,
      [organizationId]
    );

    const counts = await db.query<any>(
      `SELECT 
        SUM(CASE WHEN entry_type = 'credit' THEN 1 ELSE 0 END) as total_credits,
        SUM(CASE WHEN entry_type = 'debit' THEN 1 ELSE 0 END) as total_debits
       FROM commission_ledger_entries
       WHERE organization_id = ?`,
      [organizationId]
    );

    return {
      ...account,
      franchise_code: profileRows[0]?.franchise_code,
      operating_name: profileRows[0]?.operating_name,
      total_credit_count: Number(counts[0]?.total_credits || 0),
      total_debit_count: Number(counts[0]?.total_debits || 0),
    };
  }

  /**
   * Post a transaction to the commission account with strict ledger immutability and concurrency control.
   * Rules:
   * 1. Balance-changing operations must run in a database transaction.
   * 2. Negative balances are permitted.
   * 3. Ledger entries are append-only and cannot be updated or deleted.
   * 4. Idempotency enforced by unique referenceId.
   */
  static async postTransaction(
    dto: PostCommissionTransactionDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ account: FranchiseCommissionAccountModel; entry: CommissionLedgerEntryModel }> {
    const db = getDatabase();

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestError('Transaction amount must be a positive number greater than 0');
    }

    if (!dto.referenceId || dto.referenceId.trim().length === 0) {
      throw new BadRequestError('Transaction referenceId is required');
    }

    const refId = dto.referenceId.trim();

    // Check existing reference ID for idempotency before transaction
    const existingRef = await db.query<any>(
      `SELECT id FROM commission_ledger_entries WHERE reference_id = ? LIMIT 1`,
      [refId]
    );
    if (existingRef.length > 0) {
      throw new ConflictError(`Transaction with reference ID '${refId}' has already been processed`);
    }

    const txResult = await db.transaction(async (tx) => {
      // 1. Fetch account with optimistic locking check
      let accountRows = await tx.query<FranchiseCommissionAccountModel>(
        `SELECT * FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1`,
        [dto.organizationId]
      );

      let account: FranchiseCommissionAccountModel;
      if (accountRows.length === 0) {
        // Create account inside transaction if missing
        const newId = `comm_acc_${dto.organizationId}`;
        await tx.execute(
          `INSERT INTO franchise_commission_accounts (id, organization_id, current_balance, currency, version)
           VALUES (?, ?, 0.0, 'INR', 1)`,
          [newId, dto.organizationId]
        );
        const refetch = await tx.query<FranchiseCommissionAccountModel>(
          `SELECT * FROM franchise_commission_accounts WHERE id = ? LIMIT 1`,
          [newId]
        );
        account = refetch[0];
      } else {
        account = accountRows[0];
      }

      const balanceBefore = Number(account.current_balance);
      const versionBefore = Number(account.version);
      const amount = Number(dto.amount);

      // Compute balance after: negative balances are fully allowed
      let balanceAfter: number;
      if (dto.entryType === LEDGER_ENTRY_TYPE.CREDIT) {
        balanceAfter = balanceBefore + amount;
      } else if (dto.entryType === LEDGER_ENTRY_TYPE.DEBIT) {
        balanceAfter = balanceBefore - amount;
      } else {
        throw new BadRequestError(`Invalid entry type: '${dto.entryType}'`);
      }

      // Round to 2 decimal places to prevent floating point inaccuracies
      balanceAfter = Math.round(balanceAfter * 100) / 100;

      // 2. Concurrency-safe balance update using version comparison
      // If balance becomes strictly positive (> 0), reset zero_balance_buy_count to 0
      const isSqlite = db.getDialect() === 'sqlite';
      const shouldResetZeroCount = balanceAfter > 0;
      const updateResult = await tx.execute(
        `UPDATE franchise_commission_accounts
         SET current_balance = ?,
             version = version + 1,
             zero_balance_buy_count = CASE WHEN ? THEN 0 ELSE zero_balance_buy_count END,
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ? AND version = ?`,
        [balanceAfter, shouldResetZeroCount ? 1 : 0, account.id, versionBefore]
      );

      if (updateResult.rowsAffected === 0) {
        throw new ConflictError(
          'Commission account balance was modified by another concurrent transaction. Please retry.'
        );
      }

      // 3. Create immutable ledger entry
      const entryId = `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const metadataStr = dto.metadata ? JSON.stringify(dto.metadata) : null;

      await tx.execute(
        `INSERT INTO commission_ledger_entries (
          id, account_id, organization_id, entry_type, category, amount,
          balance_before, balance_after, reference_id, external_reference,
          description, metadata, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryId,
          account.id,
          dto.organizationId,
          dto.entryType,
          dto.category,
          amount,
          balanceBefore,
          balanceAfter,
          refId,
          dto.externalReference || null,
          dto.description,
          metadataStr,
          context?.userId || null,
        ]
      );

      const entryRows = await tx.query<CommissionLedgerEntryModel>(
        `SELECT * FROM commission_ledger_entries WHERE id = ? LIMIT 1`,
        [entryId]
      );
      const createdEntry = entryRows[0];

      return {
        account: {
          ...account,
          current_balance: balanceAfter,
          version: versionBefore + 1,
        },
        entry: {
          ...createdEntry,
          amount: Number(createdEntry.amount),
          balance_before: Number(createdEntry.balance_before),
          balance_after: Number(createdEntry.balance_after),
        },
      };
    });

    // 4. Audit Log (Logged after transaction commit to ensure persistence and lock freedom)
    await AuditService.log({
      userId: context?.userId,
      organizationId: dto.organizationId,
      action: 'COMMISSION_TRANSACTION_POSTED',
      entityType: 'commission_ledger',
      entityId: txResult.entry.id,
      newValues: {
        accountId: txResult.account.id,
        organizationId: dto.organizationId,
        entryType: dto.entryType,
        category: dto.category,
        amount: txResult.entry.amount,
        balanceBefore: txResult.entry.balance_before,
        balanceAfter: txResult.entry.balance_after,
        referenceId: refId,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return txResult;
  }

  /**
   * Admin Commission Adjustment (Credit or Debit)
   * Creates an explicit manual adjustment entry on the ledger.
   */
  static async applyAdminAdjustment(
    dto: AdminCommissionAdjustmentDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ account: FranchiseCommissionAccountModel; entry: CommissionLedgerEntryModel }> {
    const category: LedgerCategory =
      dto.adjustmentType === 'credit'
        ? LEDGER_CATEGORY.MANUAL_ADJUSTMENT_CREDIT
        : LEDGER_CATEGORY.MANUAL_ADJUSTMENT_DEBIT;

    const referenceId =
      dto.referenceId ||
      `ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const description = `Admin manual ${dto.adjustmentType} adjustment: ${dto.reason}`;

    return await this.postTransaction(
      {
        organizationId: dto.organizationId,
        entryType: dto.adjustmentType,
        category,
        amount: dto.amount,
        referenceId,
        description,
        metadata: {
          reason: dto.reason,
          notes: dto.notes || null,
          adjustedBy: context?.userId || null,
        },
      },
      context
    );
  }

  /**
   * List immutable ledger entries with filters and pagination
   */
  static async listLedgerEntries(filter?: ListLedgerFilter): Promise<{
    entries: CommissionLedgerEntryModel[];
    total: number;
  }> {
    const db = getDatabase();
    let whereClauses = ['1=1'];
    const params: unknown[] = [];

    if (filter?.organizationId) {
      whereClauses.push('organization_id = ?');
      params.push(filter.organizationId);
    }

    if (filter?.entryType) {
      whereClauses.push('entry_type = ?');
      params.push(filter.entryType);
    }

    if (filter?.category) {
      whereClauses.push('category = ?');
      params.push(filter.category);
    }

    if (filter?.startDate) {
      whereClauses.push('created_at >= ?');
      params.push(filter.startDate);
    }

    if (filter?.endDate) {
      whereClauses.push('created_at <= ?');
      params.push(filter.endDate);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total count
    const countRows = await db.query<{ count: number | string }>(
      `SELECT COUNT(*) as count FROM commission_ledger_entries WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count || 0);

    // Entries with pagination
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    const querySql = `
      SELECT * FROM commission_ledger_entries
      WHERE ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.query<CommissionLedgerEntryModel>(querySql, [...params, limit, offset]);

    return {
      entries: rows.map((r) => ({
        ...r,
        amount: Number(r.amount),
        balance_before: Number(r.balance_before),
        balance_after: Number(r.balance_after),
      })),
      total,
    };
  }

  /**
   * Retrieve a specific ledger entry by reference ID
   */
  static async getLedgerEntryByReference(referenceId: string): Promise<CommissionLedgerEntryModel | null> {
    const db = getDatabase();
    const rows = await db.query<CommissionLedgerEntryModel>(
      `SELECT * FROM commission_ledger_entries WHERE reference_id = ? LIMIT 1`,
      [referenceId.trim()]
    );
    if (rows.length === 0) return null;
    return {
      ...rows[0],
      amount: Number(rows[0].amount),
      balance_before: Number(rows[0].balance_before),
      balance_after: Number(rows[0].balance_after),
    };
  }

  /**
   * List all accounts for admin overview
   */
  static async listAccounts(): Promise<FranchiseCommissionAccountDetail[]> {
    const db = getDatabase();
    const rows = await db.query<any>(`
      SELECT a.*, p.franchise_code, p.operating_name
      FROM franchise_commission_accounts a
      LEFT JOIN franchise_profiles p ON a.organization_id = p.organization_id
      ORDER BY a.current_balance DESC
    `);

    return rows.map((r) => ({
      ...r,
      current_balance: Number(r.current_balance),
      version: Number(r.version),
    }));
  }

  /**
   * Generates a formal periodic settlement statement for a franchise commission account.
   * Accounting reconciliation formula:
   *   closingBalance = openingBalance + earnedCommissions - campaignDeductions - buyLeadDeductions + manualAdjustments - payouts + reversals
   */
  static async getSettlementStatement(
    organizationId: string,
    filter?: { startDate?: string; endDate?: string },
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<SettlementStatementResult> {
    const db = getDatabase();

    // 1. Resolve organizationId if franchiseCode or profile ID passed
    let resolvedOrgId = organizationId;
    const orgCheck = await db.query<any>(`SELECT id FROM organizations WHERE id = ?`, [organizationId]);
    if (orgCheck.length === 0) {
      const profileCheck = await db.query<any>(
        `SELECT organization_id FROM franchise_profiles WHERE franchise_code = ? OR id = ? OR LOWER(operating_name) LIKE LOWER(?) LIMIT 1`,
        [organizationId, organizationId, `%${organizationId}%`]
      );
      if (profileCheck.length > 0 && profileCheck[0].organization_id) {
        resolvedOrgId = profileCheck[0].organization_id;
      }
    }

    // Fetch account and franchise profile
    const account = await this.getOrCreateAccount(resolvedOrgId);

    const profileRows = await db.query<any>(
      `SELECT fp.franchise_code, fp.operating_name, fp.legal_name, fp.city, fp.district, fp.state, o.name as org_name
       FROM organizations o
       LEFT JOIN franchise_profiles fp ON o.id = fp.organization_id
       WHERE o.id = ? LIMIT 1`,
      [resolvedOrgId]
    );

    const profile = profileRows[0] || {};
    const franchiseInfo = {
      organizationId: resolvedOrgId,
      franchiseCode: profile.franchise_code || 'FRAN-UNKNOWN',
      operatingName: profile.operating_name || profile.org_name || 'Franchise Partner',
      legalName: profile.legal_name || undefined,
      city: profile.city || undefined,
      district: profile.district || undefined,
      state: profile.state || undefined,
      currency: account.currency || 'INR',
      currentAccountBalance: Number(account.current_balance),
    };

    // 2. Normalize date parameters
    let normStart: string | undefined;
    let normEnd: string | undefined;

    if (filter?.startDate) {
      const cleaned = filter.startDate.replace('T', ' ').replace('Z', '').split('.')[0];
      normStart = cleaned.includes(':') ? cleaned : `${cleaned} 00:00:00`;
    }
    if (filter?.endDate) {
      const cleaned = filter.endDate.replace('T', ' ').replace('Z', '').split('.')[0];
      normEnd = cleaned.includes(':') ? cleaned : `${cleaned} 23:59:59`;
    }

    // 3. Opening Balance:
    // If normStart is specified, it is the balance immediately preceding normStart.
    // If no transactions exist before normStart, or if normStart is omitted, opening balance is 0.0.
    let openingBalance = 0.0;
    if (normStart) {
      const priorRows = await db.query<any>(
        `SELECT balance_after FROM commission_ledger_entries
         WHERE organization_id = ? AND created_at < ?
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [resolvedOrgId, normStart]
      );
      if (priorRows.length > 0) {
        openingBalance = Math.round(Number(priorRows[0].balance_after) * 100) / 100;
      }
    }

    // 4. Query entries within period
    const whereClauses = ['organization_id = ?'];
    const params: any[] = [resolvedOrgId];

    if (normStart) {
      whereClauses.push('created_at >= ?');
      params.push(normStart);
    }
    if (normEnd) {
      whereClauses.push('created_at <= ?');
      params.push(normEnd);
    }

    const entriesSql = `
      SELECT * FROM commission_ledger_entries
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at ASC, id ASC
    `;
    const rows = await db.query<any>(entriesSql, params);

    // 5. Aggregate components
    let earnedCommissions = 0;
    let campaignDeductions = 0;
    let buyLeadDeductions = 0;
    let manualCredits = 0;
    let manualDebits = 0;
    let payouts = 0;
    let reversals = 0;

    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.category === LEDGER_CATEGORY.COMMISSION_EARNED && r.entry_type === LEDGER_ENTRY_TYPE.CREDIT) {
        earnedCommissions += amt;
      } else if (r.category === LEDGER_CATEGORY.CAMPAIGN_DAILY_CHARGE && r.entry_type === LEDGER_ENTRY_TYPE.DEBIT) {
        campaignDeductions += amt;
      } else if (r.category === LEDGER_CATEGORY.BUY_LEAD && r.entry_type === LEDGER_ENTRY_TYPE.DEBIT) {
        buyLeadDeductions += amt;
      } else if (r.category === LEDGER_CATEGORY.MANUAL_ADJUSTMENT_CREDIT && r.entry_type === LEDGER_ENTRY_TYPE.CREDIT) {
        manualCredits += amt;
      } else if (r.category === LEDGER_CATEGORY.MANUAL_ADJUSTMENT_DEBIT && r.entry_type === LEDGER_ENTRY_TYPE.DEBIT) {
        manualDebits += amt;
      } else if (r.category === LEDGER_CATEGORY.PAYOUT_TRANSFER && r.entry_type === LEDGER_ENTRY_TYPE.DEBIT) {
        payouts += amt;
      } else if (r.category === LEDGER_CATEGORY.CORRECTION_REVERSAL) {
        reversals += r.entry_type === LEDGER_ENTRY_TYPE.CREDIT ? amt : -amt;
      }
    }

    earnedCommissions = Math.round(earnedCommissions * 100) / 100;
    campaignDeductions = Math.round(campaignDeductions * 100) / 100;
    buyLeadDeductions = Math.round(buyLeadDeductions * 100) / 100;
    manualCredits = Math.round(manualCredits * 100) / 100;
    manualDebits = Math.round(manualDebits * 100) / 100;
    payouts = Math.round(payouts * 100) / 100;
    reversals = Math.round(reversals * 100) / 100;

    const manualAdjustments = Math.round((manualCredits - manualDebits) * 100) / 100;
    const netChange = Math.round(
      (earnedCommissions - campaignDeductions - buyLeadDeductions + manualAdjustments - payouts + reversals) * 100
    ) / 100;

    // Closing Balance
    let closingBalance = Math.round((openingBalance + netChange) * 100) / 100;

    // If all time or no end date specified and no date range, closing balance matches current balance
    if (!normEnd && rows.length > 0) {
      closingBalance = Number(account.current_balance);
    }

    const mappedEntries = rows.map((r) => ({
      id: r.id,
      date: new Date(r.created_at).toISOString(),
      category: r.category,
      entryType: r.entry_type as 'credit' | 'debit',
      amount: Number(r.amount),
      balanceBefore: Number(r.balance_before),
      balanceAfter: Number(r.balance_after),
      referenceId: r.reference_id,
      externalReference: r.external_reference || null,
      description: r.description,
    }));

    // 6. Audit log
    await AuditService.log({
      userId: context?.userId,
      organizationId: resolvedOrgId,
      action: 'SETTLEMENT_STATEMENT_GENERATED',
      entityType: 'commission_account',
      entityId: account.id,
      newValues: {
        franchiseCode: franchiseInfo.franchiseCode,
        period: { startDate: filter?.startDate || null, endDate: filter?.endDate || null },
        openingBalance,
        closingBalance,
        totalEntries: rows.length,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      openingBalance,
      earnedCommissions,
      campaignDeductions,
      buyLeadDeductions,
      manualAdjustments,
      payouts,
      closingBalance,
      opening_balance: openingBalance,
      earned_commissions: earnedCommissions,
      campaign_deductions: campaignDeductions,
      buy_lead_deductions: buyLeadDeductions,
      manual_adjustments: manualAdjustments,
      closing_balance: closingBalance,
      franchise: franchiseInfo,
      period: {
        startDate: filter?.startDate || null,
        endDate: filter?.endDate || null,
      },
      summary: {
        openingBalance,
        earnedCommissions,
        campaignDeductions,
        buyLeadDeductions,
        manualAdjustments,
        manualCredits,
        manualDebits,
        payouts,
        reversals,
        closingBalance,
        netChange,
      },
      entries: mappedEntries,
      totalEntriesCount: mappedEntries.length,
      generatedAt: new Date().toISOString(),
    };
  }
}
