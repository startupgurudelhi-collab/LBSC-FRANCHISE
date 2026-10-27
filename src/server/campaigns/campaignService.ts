import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../errors/AppError.js';
import { CommissionLedgerService } from '../commissions/commissionLedgerService.js';
import { LEDGER_CATEGORY, LEDGER_ENTRY_TYPE } from '../commissions/types.js';
import {
  CAMPAIGN_STATUS,
  FIXED_CAMPAIGN_DAILY_FEE,
  MAX_CAMPAIGN_LEADS_PER_DAY,
  MAX_ZERO_BALANCE_GRACE_DAYS,
  type FranchiseCampaignModel,
  type CampaignDetail,
  type CampaignDailyChargeModel,
  type CreateCampaignDto,
  type UpdateCampaignDto,
  type ListCampaignsFilter,
} from './types.js';

export class CampaignService {
  /**
   * Helper to format remaining zero-balance grace days
   */
  private static formatCampaignDetail(
    raw: any
  ): CampaignDetail {
    const zeroDays = Number(raw.zero_balance_days_count || 0);
    const remainingGraceDays = Math.max(0, MAX_ZERO_BALANCE_GRACE_DAYS - zeroDays);

    return {
      ...raw,
      daily_fee: Number(raw.daily_fee || FIXED_CAMPAIGN_DAILY_FEE),
      max_leads_per_day: Number(raw.max_leads_per_day || MAX_CAMPAIGN_LEADS_PER_DAY),
      zero_balance_days_count: zeroDays,
      total_charges_count: Number(raw.total_charges_count || 0),
      total_charges_amount: Number(raw.total_charges_amount || 0),
      service_fee: raw.service_fee !== undefined ? Number(raw.service_fee) : undefined,
      remaining_zero_balance_grace_days: remainingGraceDays,
    };
  }

  /**
   * Create a new franchise campaign
   */
  static async createCampaign(
    dto: CreateCampaignDto,
    context?: { userId?: string; organizationId?: string; isSuperAdmin?: boolean; ipAddress?: string; userAgent?: string }
  ): Promise<CampaignDetail> {
    const db = getDatabase();

    // 1. Determine target franchise organization
    let orgId = dto.organizationId;
    if (!context?.isSuperAdmin) {
      if (!context?.organizationId) {
        throw new ForbiddenError('You are not associated with a franchise organization');
      }
      orgId = context.organizationId;
    } else {
      if (!orgId) {
        orgId = context?.organizationId;
      }
    }

    if (!orgId) {
      throw new BadRequestError('Franchise organizationId is required to create a campaign');
    }

    // Verify organization exists and is of type franchise
    const orgRows = await db.query<any>(
      `SELECT id, name, type, status FROM organizations WHERE id = ? LIMIT 1`,
      [orgId]
    );
    if (orgRows.length === 0) {
      throw new NotFoundError(`Organization with ID '${orgId}' not found`);
    }
    if (orgRows[0].type !== 'franchise') {
      throw new BadRequestError(`Campaigns can only be created for franchise organizations`);
    }

    // 2. Validate Service exists and is active
    if (!dto.serviceId || dto.serviceId.trim().length === 0) {
      throw new BadRequestError('serviceId is required');
    }
    const serviceRows = await db.query<any>(
      `SELECT id, code, name, is_active FROM service_masters WHERE id = ? LIMIT 1`,
      [dto.serviceId.trim()]
    );
    if (serviceRows.length === 0) {
      throw new NotFoundError(`Service with ID '${dto.serviceId}' not found`);
    }
    const service = serviceRows[0];
    const isServiceActive = Boolean(service.is_active === 1 || service.is_active === true);
    if (!isServiceActive) {
      throw new BadRequestError(`Service '${service.name}' (${service.code}) is inactive and cannot be selected for campaigns`);
    }

    // 3. Validate Location: City, District, State
    if (!dto.city || dto.city.trim().length < 2) {
      throw new BadRequestError('Valid city is required');
    }
    if (!dto.district || dto.district.trim().length < 2) {
      throw new BadRequestError('Valid district is required');
    }
    if (!dto.state || dto.state.trim().length < 2) {
      throw new BadRequestError('Valid state is required');
    }

    // 4. Validate Start Date & End Date
    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = dto.startDate ? dto.startDate.trim() : todayStr;
    const endDate = dto.endDate ? dto.endDate.trim() : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestError(`End date '${endDate}' cannot be before start date '${startDate}'`);
    }

    // 5. Ensure commission account exists
    await CommissionLedgerService.getOrCreateAccount(orgId);

    // 6. Insert new campaign
    const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const status = dto.status || CAMPAIGN_STATUS.ACTIVE;
    const campaignName = dto.name?.trim() || `${service.name} - ${dto.city.trim()}, ${dto.district.trim()}`;

    await db.execute(
      `INSERT INTO franchise_campaigns (
        id, organization_id, service_id, name, city, district, state,
        status, pause_reason, daily_fee, max_leads_per_day,
        start_date, end_date, zero_balance_days_count,
        total_charges_count, total_charges_amount, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0.0, ?)`,
      [
        campaignId,
        orgId,
        service.id,
        campaignName,
        dto.city.trim(),
        dto.district.trim(),
        dto.state.trim(),
        status,
        null,
        FIXED_CAMPAIGN_DAILY_FEE,
        MAX_CAMPAIGN_LEADS_PER_DAY,
        startDate,
        endDate,
        context?.userId || null,
      ]
    );

    // 7. Audit log
    await AuditService.log({
      userId: context?.userId,
      organizationId: orgId,
      action: 'CAMPAIGN_CREATED',
      entityType: 'franchise_campaign',
      entityId: campaignId,
      newValues: {
        campaignId,
        organizationId: orgId,
        serviceId: service.id,
        serviceCode: service.code,
        serviceName: service.name,
        name: campaignName,
        city: dto.city.trim(),
        district: dto.district.trim(),
        state: dto.state.trim(),
        dailyFee: FIXED_CAMPAIGN_DAILY_FEE,
        maxLeadsPerDay: MAX_CAMPAIGN_LEADS_PER_DAY,
        startDate,
        endDate,
        status,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const created = await this.getCampaignById(campaignId);
    return created!;
  }

  /**
   * Get single campaign by ID with service & franchise details
   */
  static async getCampaignById(
    campaignId: string,
    orgScope?: string
  ): Promise<CampaignDetail | null> {
    const db = getDatabase();

    let query = `
      SELECT 
        c.*,
        s.code as service_code,
        s.name as service_name,
        s.service_fee,
        p.franchise_code,
        p.operating_name
      FROM franchise_campaigns c
      LEFT JOIN service_masters s ON c.service_id = s.id
      LEFT JOIN franchise_profiles p ON c.organization_id = p.organization_id
      WHERE c.id = ?
    `;
    const params: unknown[] = [campaignId];

    if (orgScope) {
      query += ` AND c.organization_id = ?`;
      params.push(orgScope);
    }

    const rows = await db.query<any>(query, params);
    if (rows.length === 0) {
      return null;
    }

    return this.formatCampaignDetail(rows[0]);
  }

  /**
   * List campaigns with filtering and pagination
   */
  static async listCampaigns(
    filter?: ListCampaignsFilter,
    orgScope?: string
  ): Promise<{ campaigns: CampaignDetail[]; total: number }> {
    const db = getDatabase();
    const whereClauses: string[] = ['1=1'];
    const params: unknown[] = [];

    const effectiveOrgId = orgScope || filter?.organizationId;
    if (effectiveOrgId) {
      whereClauses.push('c.organization_id = ?');
      params.push(effectiveOrgId);
    }

    if (filter?.serviceId) {
      whereClauses.push('c.service_id = ?');
      params.push(filter.serviceId);
    }

    if (filter?.status) {
      whereClauses.push('c.status = ?');
      params.push(filter.status);
    }

    if (filter?.city) {
      whereClauses.push('c.city LIKE ?');
      params.push(`%${filter.city}%`);
    }

    if (filter?.district) {
      whereClauses.push('c.district LIKE ?');
      params.push(`%${filter.district}%`);
    }

    if (filter?.state) {
      whereClauses.push('c.state LIKE ?');
      params.push(`%${filter.state}%`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Count
    const countRows = await db.query<{ count: number | string }>(
      `SELECT COUNT(*) as count FROM franchise_campaigns c WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count || 0);

    // Query
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    const querySql = `
      SELECT 
        c.*,
        s.code as service_code,
        s.name as service_name,
        s.service_fee,
        p.franchise_code,
        p.operating_name
      FROM franchise_campaigns c
      LEFT JOIN service_masters s ON c.service_id = s.id
      LEFT JOIN franchise_profiles p ON c.organization_id = p.organization_id
      WHERE ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.query<any>(querySql, [...params, limit, offset]);

    return {
      campaigns: rows.map((r) => this.formatCampaignDetail(r)),
      total,
    };
  }

  /**
   * Update campaign details or status
   */
  static async updateCampaign(
    campaignId: string,
    dto: UpdateCampaignDto,
    context?: { userId?: string; orgScope?: string; ipAddress?: string; userAgent?: string }
  ): Promise<CampaignDetail> {
    const db = getDatabase();
    const existing = await this.getCampaignById(campaignId, context?.orgScope);
    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found`);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const isSqlite = db.getDialect() === 'sqlite';

    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name.trim());
    }

    if (dto.city !== undefined) {
      if (!dto.city || dto.city.trim().length < 2) {
        throw new BadRequestError('Valid city is required');
      }
      updates.push('city = ?');
      params.push(dto.city.trim());
    }

    if (dto.district !== undefined) {
      if (!dto.district || dto.district.trim().length < 2) {
        throw new BadRequestError('Valid district is required');
      }
      updates.push('district = ?');
      params.push(dto.district.trim());
    }

    if (dto.state !== undefined) {
      if (!dto.state || dto.state.trim().length < 2) {
        throw new BadRequestError('Valid state is required');
      }
      updates.push('state = ?');
      params.push(dto.state.trim());
    }

    if (dto.endDate !== undefined) {
      if (dto.endDate && dto.endDate < existing.start_date) {
        throw new BadRequestError(`End date '${dto.endDate}' cannot be before start date '${existing.start_date}'`);
      }
      updates.push('end_date = ?');
      params.push(dto.endDate ? dto.endDate.trim() : null);
    }

    // Status transition handling
    if (dto.status !== undefined && dto.status !== existing.status) {
      if (dto.status === CAMPAIGN_STATUS.PAUSED) {
        updates.push('status = ?', 'pause_reason = ?');
        params.push(CAMPAIGN_STATUS.PAUSED, 'manual_pause');
      } else if (dto.status === CAMPAIGN_STATUS.ACTIVE) {
        // If resuming, check zero-balance condition
        const account = await CommissionLedgerService.getOrCreateAccount(existing.organization_id);
        const currentBalance = Number(account.current_balance);

        if (existing.zero_balance_days_count >= MAX_ZERO_BALANCE_GRACE_DAYS) {
          if (currentBalance <= 0) {
            throw new BadRequestError(
              `Cannot activate campaign: Commission balance is ₹${currentBalance} (₹0 or below) and the 3-day grace period has been exhausted. Please top up the franchise commission balance to resume.`
            );
          } else {
            // Balance topped up! Reset grace days count
            updates.push('status = ?', 'pause_reason = ?', 'zero_balance_days_count = ?');
            params.push(CAMPAIGN_STATUS.ACTIVE, null, 0);
          }
        } else {
          // Grace days remain
          updates.push('status = ?', 'pause_reason = ?');
          params.push(CAMPAIGN_STATUS.ACTIVE, null);
        }
      }
    }

    if (updates.length > 0) {
      updates.push(`updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`);
      params.push(campaignId);

      await db.execute(
        `UPDATE franchise_campaigns SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      await AuditService.log({
        userId: context?.userId,
        organizationId: existing.organization_id,
        action: 'CAMPAIGN_UPDATED',
        entityType: 'franchise_campaign',
        entityId: campaignId,
        oldValues: {
          name: existing.name,
          city: existing.city,
          district: existing.district,
          state: existing.state,
          endDate: existing.end_date,
          status: existing.status,
        },
        newValues: { ...dto },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    }

    const updated = await this.getCampaignById(campaignId);
    return updated!;
  }

  /**
   * Pause campaign action
   */
  static async pauseCampaign(
    campaignId: string,
    reason = 'manual_pause',
    context?: { userId?: string; orgScope?: string; ipAddress?: string; userAgent?: string }
  ): Promise<CampaignDetail> {
    const existing = await this.getCampaignById(campaignId, context?.orgScope);
    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found`);
    }

    if (existing.status === CAMPAIGN_STATUS.PAUSED) {
      return existing;
    }

    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    await db.execute(
      `UPDATE franchise_campaigns 
       SET status = ?, pause_reason = ?, updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [CAMPAIGN_STATUS.PAUSED, reason, campaignId]
    );

    await AuditService.log({
      userId: context?.userId,
      organizationId: existing.organization_id,
      action: 'CAMPAIGN_PAUSED',
      entityType: 'franchise_campaign',
      entityId: campaignId,
      newValues: { reason },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return (await this.getCampaignById(campaignId))!;
  }

  /**
   * Resume campaign action
   */
  static async resumeCampaign(
    campaignId: string,
    context?: { userId?: string; orgScope?: string; ipAddress?: string; userAgent?: string }
  ): Promise<CampaignDetail> {
    return await this.updateCampaign(
      campaignId,
      { status: CAMPAIGN_STATUS.ACTIVE },
      context
    );
  }

  /**
   * Deduct Daily Charge for a Single Campaign
   * 
   * Strict Rules:
   * - Daily fee is exactly ₹100/day
   * - Deducted from franchise commission balance
   * - Negative commission balance is allowed
   * - If balance is ₹0 or below, campaign may continue for maximum 3 days, then automatically PAUSES
   * - Uses database transactions with optimistic locking
   * - Idempotency enforced on campaign_id + charge_date
   */
  static async deductDailyCharge(
    campaignId: string,
    chargeDate?: string,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{
    charged: boolean;
    status: 'success' | 'paused_after_charge' | 'paused_due_to_grace_exhausted' | 'already_charged' | 'not_eligible';
    message: string;
    charge?: CampaignDailyChargeModel;
    campaign?: CampaignDetail;
  }> {
    const db = getDatabase();
    const targetDate = chargeDate ? chargeDate.trim() : new Date().toISOString().split('T')[0];

    // 1. Fetch current campaign details
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found`);
    }

    // If campaign is paused, cannot charge
    if (campaign.status === CAMPAIGN_STATUS.PAUSED) {
      return {
        charged: false,
        status: 'not_eligible',
        message: `Campaign is currently paused (${campaign.pause_reason || 'paused'}). No daily charge deducted.`,
        campaign,
      };
    }

    // Check date eligibility
    if (campaign.start_date > targetDate) {
      return {
        charged: false,
        status: 'not_eligible',
        message: `Campaign start date (${campaign.start_date}) is in the future relative to target date (${targetDate}).`,
        campaign,
      };
    }
    if (campaign.end_date && campaign.end_date < targetDate) {
      return {
        charged: false,
        status: 'not_eligible',
        message: `Campaign has already ended on (${campaign.end_date}).`,
        campaign,
      };
    }

    // Check idempotency: Has this campaign already been charged for targetDate?
    const existingCharges = await db.query<any>(
      `SELECT * FROM campaign_daily_charges WHERE campaign_id = ? AND charge_date = ? LIMIT 1`,
      [campaignId, targetDate]
    );
    if (existingCharges.length > 0) {
      return {
        charged: false,
        status: 'already_charged',
        message: `Campaign daily fee for date '${targetDate}' has already been processed.`,
        charge: existingCharges[0],
        campaign,
      };
    }

    // 2. Check pre-charge zero-balance grace exhaustion:
    // If the campaign has ALREADY run for 3 days with balance <= 0, and balance is STILL <= 0, auto-pause immediately without charging!
    const preAccount = await CommissionLedgerService.getOrCreateAccount(campaign.organization_id);
    const preBalance = Number(preAccount.current_balance);

    if (campaign.zero_balance_days_count >= MAX_ZERO_BALANCE_GRACE_DAYS && preBalance <= 0) {
      // Auto pause campaign without deducting
      const isSqlite = db.getDialect() === 'sqlite';
      await db.execute(
        `UPDATE franchise_campaigns 
         SET status = ?, pause_reason = ?, updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ?`,
        [CAMPAIGN_STATUS.PAUSED, 'zero_balance_grace_exhausted', campaignId]
      );

      await AuditService.log({
        userId: context?.userId,
        organizationId: campaign.organization_id,
        action: 'CAMPAIGN_AUTO_PAUSED',
        entityType: 'franchise_campaign',
        entityId: campaignId,
        newValues: {
          reason: 'zero_balance_grace_exhausted',
          balance: preBalance,
          zeroBalanceDaysCount: campaign.zero_balance_days_count,
          targetDate,
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });

      const updatedCamp = await this.getCampaignById(campaignId);
      return {
        charged: false,
        status: 'paused_due_to_grace_exhausted',
        message: `Franchise commission balance is ₹${preBalance} (<= ₹0) and maximum ${MAX_ZERO_BALANCE_GRACE_DAYS} grace days have been exhausted. Campaign has been automatically PAUSED.`,
        campaign: updatedCamp!,
      };
    }

    // 3. Process Transaction inside an atomic Database Transaction
    const txResult = await db.transaction(async (tx) => {
      // Fetch account inside tx with version
      const accRows = await tx.query<any>(
        `SELECT * FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1`,
        [campaign.organization_id]
      );
      if (accRows.length === 0) {
        throw new NotFoundError(`Commission account for organization '${campaign.organization_id}' not found`);
      }
      const account = accRows[0];
      const balanceBefore = Number(account.current_balance);
      const versionBefore = Number(account.version);

      // Deduct exactly ₹100.0 (Negative balance is allowed!)
      const balanceAfter = Math.round((balanceBefore - FIXED_CAMPAIGN_DAILY_FEE) * 100) / 100;

      // Optimistic concurrency update
      const isSqlite = db.getDialect() === 'sqlite';
      const updAcc = await tx.execute(
        `UPDATE franchise_commission_accounts
         SET current_balance = ?,
             version = version + 1,
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ? AND version = ?`,
        [balanceAfter, account.id, versionBefore]
      );

      if (updAcc.rowsAffected === 0) {
        throw new ConflictError('Concurrent modification of commission account detected. Please retry.');
      }

      // Create immutable ledger entry
      const ledgerEntryId = `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const refId = `CMP-CHG-${campaign.id}-${targetDate}`;

      await tx.execute(
        `INSERT INTO commission_ledger_entries (
          id, account_id, organization_id, entry_type, category, amount,
          balance_before, balance_after, reference_id, external_reference,
          description, metadata, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ledgerEntryId,
          account.id,
          campaign.organization_id,
          LEDGER_ENTRY_TYPE.DEBIT,
          LEDGER_CATEGORY.CAMPAIGN_DAILY_CHARGE,
          FIXED_CAMPAIGN_DAILY_FEE,
          balanceBefore,
          balanceAfter,
          refId,
          campaign.id,
          `Daily campaign fee for ${campaign.service_name || campaign.service_id} (${campaign.city}, ${campaign.district}) - ${targetDate}`,
          JSON.stringify({
            campaignId: campaign.id,
            serviceId: campaign.service_id,
            chargeDate: targetDate,
            location: { city: campaign.city, district: campaign.district, state: campaign.state },
          }),
          context?.userId || null,
        ]
      );

      // Calculate Zero Balance Grace Days
      let newZeroBalanceDaysCount: number;
      let shouldAutoPause = false;

      if (balanceAfter <= 0) {
        // Balance is ₹0 or below
        newZeroBalanceDaysCount = campaign.zero_balance_days_count + 1;
        if (newZeroBalanceDaysCount >= MAX_ZERO_BALANCE_GRACE_DAYS) {
          shouldAutoPause = true;
        }
      } else {
        // Balance is positive: reset grace days counter!
        newZeroBalanceDaysCount = 0;
      }

      // Update Campaign Record
      const newStatus = shouldAutoPause ? CAMPAIGN_STATUS.PAUSED : CAMPAIGN_STATUS.ACTIVE;
      const pauseReason = shouldAutoPause ? 'zero_balance_grace_exhausted' : null;

      await tx.execute(
        `UPDATE franchise_campaigns
         SET last_charged_date = ?,
             total_charges_count = total_charges_count + 1,
             total_charges_amount = total_charges_amount + ?,
             zero_balance_days_count = ?,
             status = ?,
             pause_reason = ?,
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ?`,
        [
          targetDate,
          FIXED_CAMPAIGN_DAILY_FEE,
          newZeroBalanceDaysCount,
          newStatus,
          pauseReason,
          campaign.id,
        ]
      );

      // Insert into Campaign Daily Charges Table
      const chargeId = `chg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const chargeStatus = shouldAutoPause ? 'paused_after_charge' : 'success';

      await tx.execute(
        `INSERT INTO campaign_daily_charges (
          id, campaign_id, organization_id, charge_date, amount,
          ledger_entry_id, balance_before, balance_after,
          zero_balance_day_count, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chargeId,
          campaign.id,
          campaign.organization_id,
          targetDate,
          FIXED_CAMPAIGN_DAILY_FEE,
          ledgerEntryId,
          balanceBefore,
          balanceAfter,
          newZeroBalanceDaysCount,
          chargeStatus,
          shouldAutoPause
            ? `Campaign charged for day ${newZeroBalanceDaysCount} of negative balance, then automatically paused.`
            : `Daily charge deducted successfully.`,
        ]
      );

      return {
        chargeId,
        ledgerEntryId,
        balanceBefore,
        balanceAfter,
        newZeroBalanceDaysCount,
        shouldAutoPause,
        chargeStatus,
      };
    });

    // 4. Post-transaction Audit Logging
    await AuditService.log({
      userId: context?.userId,
      organizationId: campaign.organization_id,
      action: 'CAMPAIGN_DAILY_CHARGE_DEDUCTED',
      entityType: 'campaign_daily_charge',
      entityId: txResult.chargeId,
      newValues: {
        campaignId: campaign.id,
        chargeDate: targetDate,
        amount: FIXED_CAMPAIGN_DAILY_FEE,
        balanceBefore: txResult.balanceBefore,
        balanceAfter: txResult.balanceAfter,
        zeroBalanceDaysCount: txResult.newZeroBalanceDaysCount,
        autoPaused: txResult.shouldAutoPause,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    if (txResult.shouldAutoPause) {
      await AuditService.log({
        userId: context?.userId,
        organizationId: campaign.organization_id,
        action: 'CAMPAIGN_AUTO_PAUSED',
        entityType: 'franchise_campaign',
        entityId: campaign.id,
        newValues: {
          reason: 'zero_balance_grace_exhausted',
          balanceAfter: txResult.balanceAfter,
          zeroBalanceDaysCount: txResult.newZeroBalanceDaysCount,
          targetDate,
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    }

    const updatedCampaign = await this.getCampaignById(campaignId);
    const chargeRecord = (
      await db.query<CampaignDailyChargeModel>(
        `SELECT * FROM campaign_daily_charges WHERE id = ? LIMIT 1`,
        [txResult.chargeId]
      )
    )[0];

    return {
      charged: true,
      status: txResult.shouldAutoPause ? 'paused_after_charge' : 'success',
      message: txResult.shouldAutoPause
        ? `₹100 deducted. Balance is now ₹${txResult.balanceAfter}. Maximum ${MAX_ZERO_BALANCE_GRACE_DAYS} days of zero/negative balance reached; campaign has been automatically PAUSED.`
        : `₹100 daily fee deducted. Remaining grace days: ${Math.max(0, MAX_ZERO_BALANCE_GRACE_DAYS - txResult.newZeroBalanceDaysCount)}.`,
      charge: chargeRecord,
      campaign: updatedCampaign!,
    };
  }

  /**
   * Process daily charges for all active eligible campaigns on target date
   */
  static async processDailyCharges(
    targetDate?: string,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{
    targetDate: string;
    totalActiveCampaigns: number;
    processedCount: number;
    successfulCharges: number;
    autoPausedCount: number;
    alreadyChargedCount: number;
    skippedCount: number;
    results: Array<{
      campaignId: string;
      franchise: string;
      status: string;
      message: string;
    }>;
  }> {
    const db = getDatabase();
    const dateToProcess = targetDate ? targetDate.trim() : new Date().toISOString().split('T')[0];

    // Find all active campaigns
    const eligibleCampaigns = await db.query<any>(
      `SELECT id, organization_id, name, city, district, start_date, end_date, last_charged_date
       FROM franchise_campaigns
       WHERE status = 'active'
         AND start_date <= ?
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY created_at ASC`,
      [dateToProcess, dateToProcess]
    );

    let successfulCharges = 0;
    let autoPausedCount = 0;
    let alreadyChargedCount = 0;
    let skippedCount = 0;
    const results: Array<{
      campaignId: string;
      franchise: string;
      status: string;
      message: string;
    }> = [];

    for (const cmp of eligibleCampaigns) {
      try {
        const res = await this.deductDailyCharge(cmp.id, dateToProcess, context);
        if (res.charged) {
          successfulCharges++;
          if (res.status === 'paused_after_charge') {
            autoPausedCount++;
          }
        } else {
          if (res.status === 'already_charged') {
            alreadyChargedCount++;
          } else if (res.status === 'paused_due_to_grace_exhausted') {
            autoPausedCount++;
          } else {
            skippedCount++;
          }
        }
        results.push({
          campaignId: cmp.id,
          franchise: cmp.organization_id,
          status: res.status,
          message: res.message,
        });
      } catch (err: any) {
        skippedCount++;
        results.push({
          campaignId: cmp.id,
          franchise: cmp.organization_id,
          status: 'error',
          message: err.message || 'Unknown processing error',
        });
      }
    }

    return {
      targetDate: dateToProcess,
      totalActiveCampaigns: eligibleCampaigns.length,
      processedCount: successfulCharges + autoPausedCount + alreadyChargedCount + skippedCount,
      successfulCharges,
      autoPausedCount,
      alreadyChargedCount,
      skippedCount,
      results,
    };
  }

  /**
   * List charge history for a campaign
   */
  static async listCampaignCharges(
    campaignId: string,
    orgScope?: string
  ): Promise<CampaignDailyChargeModel[]> {
    const db = getDatabase();
    // Validate campaign exists and ownership
    const campaign = await this.getCampaignById(campaignId, orgScope);
    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found`);
    }

    const rows = await db.query<CampaignDailyChargeModel>(
      `SELECT * FROM campaign_daily_charges WHERE campaign_id = ? ORDER BY charge_date DESC, created_at DESC`,
      [campaignId]
    );

    return rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      balance_before: Number(r.balance_before),
      balance_after: Number(r.balance_after),
      zero_balance_day_count: Number(r.zero_balance_day_count),
    }));
  }
}
