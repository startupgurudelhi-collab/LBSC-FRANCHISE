import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../errors/AppError.js';
import {
  LEAD_STATUS,
  LEAD_HISTORY_ACTION,
  BUY_LEAD_PRICE,
  MAX_BUY_LEADS_ZERO_BALANCE,
  type LeadModel,
  type LeadDetail,
  type LeadPurchaseModel,
  type BuyLeadResult,
  type OwnLeadCenterItem,
} from './types.js';
import { LEDGER_ENTRY_TYPE, LEDGER_CATEGORY } from '../commissions/types.js';

export interface ListOwnLeadCenterFilter {
  serviceId?: string;
  city?: string;
  district?: string;
  state?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class OwnLeadCenterService {
  /**
   * List available buyable leads from Own Lead Center.
   * Leads qualify if status = 'own_lead_center' and assigned_franchise_id IS NULL.
   */
  static async listAvailableLeads(filter: ListOwnLeadCenterFilter = {}): Promise<{
    leads: OwnLeadCenterItem[];
    total: number;
    buyLeadPrice: number;
  }> {
    const db = getDatabase();
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset >= 0 ? filter.offset : 0;

    let whereSql = `WHERE l.status = 'own_lead_center' AND l.assigned_franchise_id IS NULL`;
    const params: any[] = [];

    if (filter.serviceId) {
      whereSql += ` AND l.service_id = ?`;
      params.push(filter.serviceId);
    }
    if (filter.city) {
      whereSql += ` AND LOWER(l.city) = LOWER(?)`;
      params.push(filter.city);
    }
    if (filter.district) {
      whereSql += ` AND LOWER(l.district) = LOWER(?)`;
      params.push(filter.district);
    }
    if (filter.state) {
      whereSql += ` AND LOWER(l.state) = LOWER(?)`;
      params.push(filter.state);
    }
    if (filter.search) {
      whereSql += ` AND (LOWER(l.customer_name) LIKE ? OR LOWER(l.lead_number) LIKE ? OR LOWER(l.city) LIKE ?)`;
      const s = `%${filter.search.toLowerCase()}%`;
      params.push(s, s, s);
    }

    const countRows = await db.query<any>(
      `SELECT COUNT(*) as total FROM leads l ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const querySql = `
      SELECT 
        l.*,
        s.code as service_code,
        s.name as service_name,
        s.service_fee,
        sc.name as category_name
      FROM leads l
      LEFT JOIN service_masters s ON l.service_id = s.id
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.query<any>(querySql, [...params, limit, offset]);

    const leads: OwnLeadCenterItem[] = rows.map((r) => ({
      ...r,
      service_fee: r.service_fee !== null ? Number(r.service_fee) : undefined,
      price: BUY_LEAD_PRICE,
    }));

    return {
      leads,
      total,
      buyLeadPrice: BUY_LEAD_PRICE,
    };
  }

  /**
   * Get single buyable lead from Own Lead Center.
   */
  static async getAvailableLeadById(leadId: string): Promise<OwnLeadCenterItem | null> {
    const db = getDatabase();
    const rows = await db.query<any>(
      `SELECT 
        l.*,
        s.code as service_code,
        s.name as service_name,
        s.service_fee,
        sc.name as category_name
       FROM leads l
       LEFT JOIN service_masters s ON l.service_id = s.id
       LEFT JOIN service_categories sc ON s.category_id = sc.id
       WHERE l.id = ?
         AND l.status = 'own_lead_center'
         AND l.assigned_franchise_id IS NULL
       LIMIT 1`,
      [leadId]
    );

    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      ...r,
      service_fee: r.service_fee !== null ? Number(r.service_fee) : undefined,
      price: BUY_LEAD_PRICE,
    };
  }

  /**
   * Buy Lead Action:
   * Rules:
   * 1. Franchise buys a lead from Own Lead Center (status = 'own_lead_center' & unassigned)
   * 2. Fixed price: ₹20 per lead
   * 3. Deduct ₹20 from buying franchise's commission balance
   * 4. Negative balance is allowed.
   * 5. When balance was ₹0 or negative (<= 0):
   *    - Maximum 3 Buy Leads allowed: ₹0 -> -₹20 -> -₹40 -> -₹60
   *    - After 3 Buy Leads while balance is <= 0, block further purchases until balance becomes positive (> 0)
   * 6. Once balance becomes positive (> 0), the 3-lead restriction resets (zero_balance_buy_count = 0)
   * 7. Concurrency protection / database transaction:
   *    - Prevent duplicate purchases: if two franchises attempt to purchase the same lead concurrently,
   *      one succeeds and the other receives 409 Conflict.
   * 8. Permanently assign lead to buying franchise (status = 'assigned', assigned_franchise_id = franchiseId, assigned_at = now)
   * 9. Insert immutable commission ledger entry with category 'BUY_LEAD'
   * 10. Record purchase in lead_purchases table and lead_assignment_history
   * 11. Create audit log
   */
  static async buyLead(
    leadId: string,
    franchiseId: string,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<BuyLeadResult> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // Verify franchise organization exists & is active
    const franchiseRows = await db.query<any>(
      `SELECT id, name, status FROM organizations WHERE id = ? AND type = 'franchise' LIMIT 1`,
      [franchiseId]
    );
    if (franchiseRows.length === 0) {
      throw new NotFoundError(`Franchise organization with ID '${franchiseId}' not found`);
    }
    if (franchiseRows[0].status !== 'active') {
      throw new BadRequestError(`Franchise organization '${franchiseRows[0].name}' is not active`);
    }

    const price = BUY_LEAD_PRICE; // Fixed ₹20

    // Execute atomic purchase transaction with strict concurrency controls
    const result = await db.transaction(async (tx) => {
      // 1. Fetch lead and lock/check eligibility
      const leadRows = await tx.query<LeadModel>(
        `SELECT * FROM leads WHERE id = ? LIMIT 1`,
        [leadId]
      );

      if (leadRows.length === 0) {
        throw new NotFoundError(`Lead with ID '${leadId}' not found`);
      }

      const lead = leadRows[0];

      if (lead.status !== LEAD_STATUS.OWN_LEAD_CENTER || lead.assigned_franchise_id !== null) {
        throw new ConflictError(
          `Lead ${lead.lead_number} is no longer available in the Own Lead Center (already assigned or purchased)`
        );
      }

      // Check if already purchased in lead_purchases table
      const existingPurchases = await tx.query<any>(
        `SELECT id, franchise_id FROM lead_purchases WHERE lead_id = ? LIMIT 1`,
        [leadId]
      );
      if (existingPurchases.length > 0) {
        throw new ConflictError(
          `Lead ${lead.lead_number} has already been purchased by franchise ${existingPurchases[0].franchise_id}`
        );
      }

      // 2. Fetch or create commission account inside transaction
      let accountRows = await tx.query<any>(
        `SELECT * FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1`,
        [franchiseId]
      );

      let account: any;
      if (accountRows.length === 0) {
        const accId = `comm_acc_${franchiseId}`;
        await tx.execute(
          `INSERT INTO franchise_commission_accounts (id, organization_id, current_balance, currency, version, zero_balance_buy_count)
           VALUES (?, ?, 0.0, 'INR', 1, 0)`,
          [accId, franchiseId]
        );
        const refetch = await tx.query<any>(
          `SELECT * FROM franchise_commission_accounts WHERE id = ? LIMIT 1`,
          [accId]
        );
        account = refetch[0];
      } else {
        account = accountRows[0];
      }

      let currentBalance = Number(account.current_balance);
      const versionBefore = Number(account.version);
      let zeroBalanceBuyCount = Number(account.zero_balance_buy_count || 0);

      // Business Rule:
      // When commission balance is <= 0, allow maximum 3 Buy Leads:
      // ₹0 -> -₹20 (1st) -> -₹40 (2nd) -> -₹60 (3rd).
      // After 3 Buy Leads while balance is non-positive, block further purchases until balance becomes positive.
      // Once balance becomes positive, the 3-lead restriction resets.
      if (currentBalance > 0) {
        // Balance is positive: reset the zero-balance count
        zeroBalanceBuyCount = 0;
      } else {
        // Balance is zero or negative: check the 3-buy quota
        if (zeroBalanceBuyCount >= MAX_BUY_LEADS_ZERO_BALANCE) {
          throw new BadRequestError(
            `Purchase blocked: You have reached the maximum limit of ${MAX_BUY_LEADS_ZERO_BALANCE} Buy Leads while your commission balance is zero or negative (current balance: ₹${currentBalance.toFixed(
              2
            )}). Further purchases are blocked until your commission balance becomes positive.`
          );
        }
      }

      // Compute balance after deducting ₹20
      const balanceBefore = currentBalance;
      const balanceAfter = Math.round((balanceBefore - price) * 100) / 100;

      // Increment zero-balance buy count if the balance was <= 0 when purchase was initiated
      const newZeroBalanceBuyCount = balanceBefore <= 0 ? zeroBalanceBuyCount + 1 : 0;

      // 3. Atomically update commission account with optimistic concurrency check
      const updateAccResult = await tx.execute(
        `UPDATE franchise_commission_accounts
         SET current_balance = ?,
             zero_balance_buy_count = ?,
             version = version + 1,
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ? AND version = ?`,
        [balanceAfter, newZeroBalanceBuyCount, account.id, versionBefore]
      );

      if (updateAccResult.rowsAffected === 0) {
        throw new ConflictError(
          'Franchise commission account was updated concurrently. Please retry the purchase.'
        );
      }

      // 4. Atomically update the lead:
      // Assign lead permanently to the buying franchise, status = 'assigned'
      const nowStr = new Date().toISOString();
      const updateLeadResult = await tx.execute(
        `UPDATE leads
         SET status = ?,
             assigned_franchise_id = ?,
             assigned_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'},
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ?
           AND status = 'own_lead_center'
           AND assigned_franchise_id IS NULL`,
        [LEAD_STATUS.ASSIGNED, franchiseId, leadId]
      );

      if (updateLeadResult.rowsAffected === 0) {
        throw new ConflictError(
          `Lead ${lead.lead_number} was purchased or assigned by another transaction concurrently.`
        );
      }

      // 5. Create immutable commission ledger entry with category 'BUY_LEAD'
      const ledgerEntryId = `ledg_buy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const ledgerRefId = `TXN-BUY-LEAD-${lead.lead_number}-${Date.now()}`;
      const description = `Buy Lead ${lead.lead_number} from Own Lead Center (-₹${price.toFixed(2)})`;
      const metadata = JSON.stringify({
        leadId,
        leadNumber: lead.lead_number,
        serviceId: lead.service_id,
        price,
        franchiseId,
        purchasedByUserId: context?.userId || null,
        zeroBalanceBuyCount: newZeroBalanceBuyCount,
      });

      await tx.execute(
        `INSERT INTO commission_ledger_entries (
          id, account_id, organization_id, entry_type, category, amount,
          balance_before, balance_after, reference_id, external_reference,
          description, metadata, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ledgerEntryId,
          account.id,
          franchiseId,
          LEDGER_ENTRY_TYPE.DEBIT,
          LEDGER_CATEGORY.BUY_LEAD,
          price,
          balanceBefore,
          balanceAfter,
          ledgerRefId,
          lead.lead_number,
          description,
          metadata,
          context?.userId || null,
        ]
      );

      // 6. Record purchase in lead_purchases
      const purchaseId = `pur_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO lead_purchases (
          id, lead_id, franchise_id, purchased_by_user_id, price, currency,
          ledger_entry_id, ledger_reference_id, balance_before, balance_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          leadId,
          franchiseId,
          context?.userId || null,
          price,
          'INR',
          ledgerEntryId,
          ledgerRefId,
          balanceBefore,
          balanceAfter,
        ]
      );

      // 7. Record in lead_assignment_history
      const historyId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO lead_assignment_history (
          id, lead_id, action, to_franchise_id, reason, performed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          historyId,
          leadId,
          LEAD_HISTORY_ACTION.BOUGHT_LEAD,
          franchiseId,
          `Lead purchased from Own Lead Center for ₹${price.toFixed(2)} (Ledger Ref: ${ledgerRefId})`,
          context?.userId || null,
        ]
      );

      // 8. Fetch updated lead details
      const updatedLeadRows = await tx.query<any>(
        `SELECT l.*, s.code as service_code, s.name as service_name, s.service_fee, o.name as assigned_franchise_name
         FROM leads l
         LEFT JOIN service_masters s ON l.service_id = s.id
         LEFT JOIN organizations o ON l.assigned_franchise_id = o.id
         WHERE l.id = ? LIMIT 1`,
        [leadId]
      );

      const purchaseRecord: LeadPurchaseModel = {
        id: purchaseId,
        lead_id: leadId,
        franchise_id: franchiseId,
        purchased_by_user_id: context?.userId || null,
        price,
        currency: 'INR',
        ledger_entry_id: ledgerEntryId,
        ledger_reference_id: ledgerRefId,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        purchased_at: nowStr,
      };

      return {
        lead: updatedLeadRows[0],
        purchase: purchaseRecord,
        commission: {
          balanceBefore,
          balanceAfter,
          amountDeducted: price,
          zeroBalanceBuyCount: newZeroBalanceBuyCount,
          ledgerReferenceId: ledgerRefId,
        },
      };
    });

    // Audit the purchase asynchronously
    await AuditService.log({
      action: 'LEAD_BOUGHT',
      entityType: 'lead',
      entityId: leadId,
      organizationId: franchiseId,
      userId: context?.userId || null,
      oldValues: {
        status: LEAD_STATUS.OWN_LEAD_CENTER,
        assigned_franchise_id: null,
        commission_balance: result.commission.balanceBefore,
      },
      newValues: {
        status: LEAD_STATUS.ASSIGNED,
        assigned_franchise_id: franchiseId,
        commission_balance: result.commission.balanceAfter,
        price,
        leadNumber: result.lead.lead_number,
        ledgerRef: result.commission.ledgerReferenceId,
        zeroBalanceBuyCount: result.commission.zeroBalanceBuyCount,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return result;
  }

  /**
   * Get purchase history for a lead or a franchise (Admin and Franchise access).
   */
  static async listPurchases(filter: {
    franchiseId?: string;
    leadId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ purchases: any[]; total: number }> {
    const db = getDatabase();
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset >= 0 ? filter.offset : 0;

    let whereSql = `WHERE 1=1`;
    const params: any[] = [];

    if (filter.franchiseId) {
      whereSql += ` AND lp.franchise_id = ?`;
      params.push(filter.franchiseId);
    }
    if (filter.leadId) {
      whereSql += ` AND lp.lead_id = ?`;
      params.push(filter.leadId);
    }

    const countRows = await db.query<any>(
      `SELECT COUNT(*) as total FROM lead_purchases lp ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const querySql = `
      SELECT 
        lp.*,
        l.lead_number,
        l.customer_name,
        l.customer_phone,
        l.city,
        l.district,
        l.state,
        s.name as service_name,
        o.name as franchise_name,
        u.first_name as purchaser_first_name,
        u.last_name as purchaser_last_name
      FROM lead_purchases lp
      JOIN leads l ON lp.lead_id = l.id
      JOIN organizations o ON lp.franchise_id = o.id
      LEFT JOIN service_masters s ON l.service_id = s.id
      LEFT JOIN users u ON lp.purchased_by_user_id = u.id
      ${whereSql}
      ORDER BY lp.purchased_at DESC
      LIMIT ? OFFSET ?
    `;

    const purchases = await db.query<any>(querySql, [...params, limit, offset]);

    return { purchases, total };
  }

  /**
   * Admin Own Lead Center statistics
   */
  static async getOwnLeadCenterStats(): Promise<{
    availableLeadsCount: number;
    totalPurchasedCount: number;
    totalRevenueGenerated: number;
    fixedBuyPrice: number;
  }> {
    const db = getDatabase();

    const availRows = await db.query<any>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'own_lead_center' AND assigned_franchise_id IS NULL`
    );
    const purRows = await db.query<any>(
      `SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total_revenue FROM lead_purchases`
    );

    return {
      availableLeadsCount: Number(availRows[0]?.count || 0),
      totalPurchasedCount: Number(purRows[0]?.count || 0),
      totalRevenueGenerated: Number(purRows[0]?.total_revenue || 0),
      fixedBuyPrice: BUY_LEAD_PRICE,
    };
  }
}
