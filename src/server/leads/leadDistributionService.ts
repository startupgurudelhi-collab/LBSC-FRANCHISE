import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../errors/AppError.js';
import type { DatabaseTransaction } from '../types/index.js';
import {
  LEAD_STATUS,
  OPPORTUNITY_STATUS,
  LEAD_HISTORY_ACTION,
  OPPORTUNITY_EXPIRY_MS,
  MAX_CAMPAIGN_LEADS_PER_DAY,
  type LeadModel,
  type LeadOpportunityModel,
  type LeadAssignmentHistoryModel,
  type IngestLeadDto,
  type LeadDetail,
  type FranchiseOpportunityDetail,
  type ListLeadsFilter,
} from './types.js';

export class LeadDistributionService {
  /**
   * Generates a human-friendly unique lead number:
   * Format: LD-YYYYMMDD-XXXX
   */
  private static generateLeadNumber(): string {
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `LD-${ymd}-${rand}`;
  }

  /**
   * Ingest a new lead and automatically trigger distribution matching.
   * Matches leads strictly by:
   * 1. Service ID (must be active)
   * 2. City, District, State (case-insensitive exact string match)
   * 3. Franchise campaign must be ACTIVE
   * 4. Enforces maximum 5 leads/day per campaign
   */
  static async ingestLead(
    dto: IngestLeadDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ lead: LeadDetail; matchResult: { status: string; franchiseId?: string; opportunityId?: string; reason?: string } }> {
    const db = getDatabase();

    // 1. Validate service
    const services = await db.query<any>(
      `SELECT id, code, name, is_active FROM service_masters WHERE id = ? LIMIT 1`,
      [dto.serviceId]
    );
    if (services.length === 0) {
      throw new NotFoundError(`Service with ID '${dto.serviceId}' not found`);
    }
    if (!services[0].is_active) {
      throw new BadRequestError(`Service '${services[0].name}' (${services[0].code}) is currently inactive`);
    }

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const leadNumber = this.generateLeadNumber();

    // Normalize location fields
    const city = dto.city.trim();
    const district = dto.district.trim();
    const state = dto.state.trim();

    // Insert lead within a transaction and evaluate distribution
    let matchResult: { status: string; franchiseId?: string; opportunityId?: string; reason?: string } = {
      status: 'pending',
    };

    await db.transaction(async (tx: DatabaseTransaction) => {
      await tx.execute(
        `INSERT INTO leads (
          id, lead_number, source, source_reference, customer_name, customer_phone, customer_email,
          service_id, city, district, state, pin, address, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          leadId,
          leadNumber,
          dto.source.trim(),
          dto.sourceReference?.trim() || null,
          dto.customerName.trim(),
          dto.customerPhone.trim(),
          dto.customerEmail?.trim() || null,
          dto.serviceId,
          city,
          district,
          state,
          dto.pin?.trim() || null,
          dto.address?.trim() || null,
          dto.notes?.trim() || null,
          LEAD_STATUS.NEW,
        ]
      );

      // Record lead intake history
      const historyId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO lead_assignment_history (
          id, lead_id, action, reason, performed_by_user_id
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          historyId,
          leadId,
          LEAD_HISTORY_ACTION.CREATED,
          `Lead ingested via ${dto.source}`,
          context?.userId || null,
        ]
      );

      // Distribute to the first eligible campaign franchise
      matchResult = await this.routeLeadInternal(leadId, tx, context);
    });

    // Record audit log
    await AuditService.log({
      action: 'LEAD_INGESTED',
      entityType: 'lead',
      entityId: leadId,
      userId: context?.userId,
      newValues: {
        leadNumber,
        source: dto.source,
        serviceId: dto.serviceId,
        city,
        district,
        state,
        matchResult,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const leadDetail = await this.getLeadById(leadId);
    return { lead: leadDetail!, matchResult };
  }

  /**
   * Internal routing algorithm:
   * Finds eligible active campaigns matching (service_id, city, district, state).
   * Excludes franchises that have already been offered this lead.
   * Excludes campaigns that have already reached 5 leads for today.
   * If an eligible franchise is found:
   *   - Creates a 1-hour temporary lead opportunity.
   *   - Sets lead status to 'offered'.
   * If NO eligible active franchise is found:
   *   - Moves lead to 'own_lead_center'.
   */
  private static async routeLeadInternal(
    leadId: string,
    tx: DatabaseTransaction,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ status: string; franchiseId?: string; opportunityId?: string; reason?: string }> {
    // 1. Fetch current lead
    const leadRows = await tx.query<LeadModel>(
      `SELECT * FROM leads WHERE id = ? LIMIT 1`,
      [leadId]
    );
    if (leadRows.length === 0) {
      throw new NotFoundError(`Lead '${leadId}' not found`);
    }
    const lead = leadRows[0];

    // Check if already permanently assigned
    if (lead.assigned_franchise_id) {
      return {
        status: 'already_assigned',
        franchiseId: lead.assigned_franchise_id,
        reason: 'Lead is already permanently assigned to a franchise',
      };
    }

    // 2. Fetch list of franchises that were ALREADY offered this lead
    const previousOffers = await tx.query<{ franchise_id: string }>(
      `SELECT franchise_id FROM lead_opportunities WHERE lead_id = ?`,
      [leadId]
    );
    const offeredFranchiseIds = previousOffers.map((o) => o.franchise_id);

    // 3. Find candidates with ACTIVE campaigns matching exact Service + City + District + State
    // Ordered by earliest created campaign (fair FIFO rotation)
    const campaigns = await tx.query<any>(
      `SELECT c.id as campaign_id, c.organization_id as franchise_id, c.max_leads_per_day, c.city, c.district, c.state
       FROM franchise_campaigns c
       JOIN organizations o ON c.organization_id = o.id
       WHERE c.service_id = ?
         AND LOWER(c.city) = LOWER(?)
         AND LOWER(c.district) = LOWER(?)
         AND LOWER(c.state) = LOWER(?)
         AND c.status = 'active'
         AND o.status = 'active'
       ORDER BY c.created_at ASC`,
      [lead.service_id, lead.city, lead.district, lead.state]
    );

    // Filter candidate campaigns
    const now = new Date();
    const todayYmd = now.toISOString().slice(0, 10);

    let selectedCampaign: any = null;

    for (const camp of campaigns) {
      // Skip if this franchise was already offered this lead
      if (offeredFranchiseIds.includes(camp.franchise_id)) {
        continue;
      }

      // Check 5 leads/day cap: Count leads assigned OR currently offered to this campaign today
      const todayCountRows = await tx.query<any>(
        `SELECT COUNT(*) as count FROM (
          -- Leads permanently accepted through this campaign today
          SELECT id FROM leads 
          WHERE assigned_campaign_id = ? 
            AND date(assigned_at) = date(?)
          UNION
          -- Leads currently pending accepted/offered in this campaign today
          SELECT lead_id as id FROM lead_opportunities 
          WHERE campaign_id = ? 
            AND date(offered_at) = date(?)
            AND status IN ('pending', 'accepted')
        )`,
        [camp.campaign_id, todayYmd, camp.campaign_id, todayYmd]
      );

      const countToday = Number(todayCountRows[0]?.count || 0);
      const maxLeads = Number(camp.max_leads_per_day || MAX_CAMPAIGN_LEADS_PER_DAY);

      if (countToday < maxLeads) {
        selectedCampaign = camp;
        break;
      }
    }

    // 4. If an eligible campaign franchise is found, offer it for exactly 1 hour
    if (selectedCampaign) {
      const oppId = `opp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const offeredAt = new Date();
      const expiresAt = new Date(offeredAt.getTime() + OPPORTUNITY_EXPIRY_MS);

      const offeredAtStr = offeredAt.toISOString().replace('T', ' ').substring(0, 19);
      const expiresAtStr = expiresAt.toISOString().replace('T', ' ').substring(0, 19);
      const createdAtStr = offeredAt.toISOString();

      await tx.execute(
        `INSERT INTO lead_opportunities (
          id, lead_id, franchise_id, campaign_id, status, offered_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          oppId,
          leadId,
          selectedCampaign.franchise_id,
          selectedCampaign.campaign_id,
          OPPORTUNITY_STATUS.PENDING,
          offeredAtStr,
          expiresAtStr,
          createdAtStr,
        ]
      );

      // Update lead status to 'offered'
      await tx.execute(
        `UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [LEAD_STATUS.OFFERED, leadId]
      );

      // Record in history
      const histId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO lead_assignment_history (
          id, lead_id, action, to_franchise_id, campaign_id, opportunity_id, reason, performed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          histId,
          leadId,
          LEAD_HISTORY_ACTION.OFFERED,
          selectedCampaign.franchise_id,
          selectedCampaign.campaign_id,
          oppId,
          `Offered to franchise campaign (1 hour acceptance window)`,
          context?.userId || null,
        ]
      );

      return {
        status: 'offered',
        franchiseId: selectedCampaign.franchise_id,
        opportunityId: oppId,
      };
    }

    // 5. If NO eligible active campaign franchise exists, move to Own Lead Center
    await tx.execute(
      `UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [LEAD_STATUS.OWN_LEAD_CENTER, leadId]
    );

    const histId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await tx.execute(
      `INSERT INTO lead_assignment_history (
        id, lead_id, action, reason, performed_by_user_id
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        histId,
        leadId,
        LEAD_HISTORY_ACTION.ROUTED_TO_OWN_LEAD_CENTER,
        'No eligible active franchise campaign available (or daily cap reached). Moved to Own Lead Center.',
        context?.userId || null,
      ]
    );

    return {
      status: 'own_lead_center',
      reason: 'No eligible active franchise campaign with remaining daily capacity found.',
    };
  }

  /**
   * Accept an offered opportunity by the franchise.
   * Enforces:
   * - Strict 1-hour time window (must not be expired)
   * - Must belong to the calling franchise
   * - Atomic concurrency lock to prevent race conditions
   * - Lead becomes permanently associated with this franchise
   * - Campaign leads are NOT charged ₹20 separately!
   */
  static async acceptOpportunity(
    opportunityId: string,
    franchiseId: string,
    notes?: string | null,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ lead: LeadDetail; opportunity: LeadOpportunityModel }> {
    const db = getDatabase();

    let acceptedLeadId = '';
    let updatedOpp: LeadOpportunityModel | null = null;

    await db.transaction(async (tx: DatabaseTransaction) => {
      // 1. Fetch opportunity with lock/atomicity
      const oppRows = await tx.query<LeadOpportunityModel>(
        `SELECT * FROM lead_opportunities WHERE id = ? LIMIT 1`,
        [opportunityId]
      );

      if (oppRows.length === 0) {
        throw new NotFoundError(`Opportunity with ID '${opportunityId}' not found`);
      }

      const opp = oppRows[0];

      // Franchise ownership check
      if (opp.franchise_id !== franchiseId) {
        throw new ForbiddenError('You are not authorized to accept an opportunity assigned to another franchise');
      }

      // Check current status
      if (opp.status === OPPORTUNITY_STATUS.ACCEPTED) {
        throw new ConflictError('This lead opportunity has already been accepted');
      }

      if (opp.status === OPPORTUNITY_STATUS.EXPIRED) {
        throw new BadRequestError('This lead opportunity has expired and can no longer be accepted');
      }

      if (opp.status !== OPPORTUNITY_STATUS.PENDING) {
        throw new BadRequestError(`Cannot accept opportunity with status '${opp.status}'`);
      }

      // Check if expired by time (1-hour window)
      const now = new Date();
      const expiresAt = new Date(opp.expires_at.replace(' ', 'T') + (opp.expires_at.includes('Z') ? '' : 'Z'));
      if (now.getTime() > expiresAt.getTime()) {
        // Mark as expired in DB
        await tx.execute(
          `UPDATE lead_opportunities SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [OPPORTUNITY_STATUS.EXPIRED, opportunityId]
        );
        throw new BadRequestError('The 1-hour window for this lead opportunity has expired. The lead will be re-routed.');
      }

      // 2. Fetch and lock lead
      const leadRows = await tx.query<LeadModel>(
        `SELECT * FROM leads WHERE id = ? LIMIT 1`,
        [opp.lead_id]
      );

      if (leadRows.length === 0) {
        throw new NotFoundError(`Associated lead '${opp.lead_id}' not found`);
      }

      const lead = leadRows[0];

      if (lead.assigned_franchise_id) {
        throw new ConflictError('This lead is already permanently assigned to a franchise');
      }

      // 3. Mark opportunity as ACCEPTED
      const respondedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await tx.execute(
        `UPDATE lead_opportunities 
         SET status = ?, responded_at = ?, response_notes = ?
         WHERE id = ?`,
        [OPPORTUNITY_STATUS.ACCEPTED, respondedAt, notes || null, opportunityId]
      );

      // 4. Update Lead to permanently assigned
      const assignedAt = respondedAt;
      await tx.execute(
        `UPDATE leads 
         SET status = ?, assigned_franchise_id = ?, assigned_campaign_id = ?, assigned_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [LEAD_STATUS.ASSIGNED, opp.franchise_id, opp.campaign_id, assignedAt, lead.id]
      );

      // 5. Record in immutable assignment history
      const histId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO lead_assignment_history (
          id, lead_id, action, to_franchise_id, campaign_id, opportunity_id, reason, performed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          histId,
          lead.id,
          LEAD_HISTORY_ACTION.ACCEPTED,
          opp.franchise_id,
          opp.campaign_id,
          opportunityId,
          `Opportunity accepted within 1 hour. Lead permanently associated with franchise.`,
          context?.userId || null,
        ]
      );

      acceptedLeadId = lead.id;
      const refetchedOpp = await tx.query<LeadOpportunityModel>(
        `SELECT * FROM lead_opportunities WHERE id = ? LIMIT 1`,
        [opportunityId]
      );
      updatedOpp = refetchedOpp[0];
    });

    // 6. Audit logging
    await AuditService.log({
      action: 'LEAD_OPPORTUNITY_ACCEPTED',
      entityType: 'lead_opportunity',
      entityId: opportunityId,
      organizationId: franchiseId,
      userId: context?.userId,
      newValues: {
        leadId: acceptedLeadId,
        franchiseId,
        notes,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const leadDetail = await this.getLeadById(acceptedLeadId);
    return { lead: leadDetail!, opportunity: updatedOpp! };
  }

  /**
   * Release an expired opportunity and re-route the lead to the next eligible franchise.
   * If a specific opportunity has timed out:
   *   - Updates opportunity status to 'expired'
   *   - Logs expiration history
   *   - Invokes routeLeadInternal to find next franchise or route to Own Lead Center
   */
  static async releaseExpiredOpportunity(
    opportunityId: string,
    context?: {
      userId?: string;
      franchiseId?: string;
      isSuperAdmin?: boolean;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ leadId: string; nextRouting: { status: string; franchiseId?: string; opportunityId?: string; reason?: string } }> {
    const db = getDatabase();

    let leadId = '';
    let nextRouting: { status: string; franchiseId?: string; opportunityId?: string; reason?: string } = {
      status: 'pending',
    };

    await db.transaction(async (tx: DatabaseTransaction) => {
      const oppRows = await tx.query<LeadOpportunityModel>(
        `SELECT * FROM lead_opportunities WHERE id = ? LIMIT 1`,
        [opportunityId]
      );

      if (oppRows.length === 0) {
        throw new NotFoundError(`Opportunity '${opportunityId}' not found`);
      }

      const opp = oppRows[0];
      leadId = opp.lead_id;

      if (opp.status === OPPORTUNITY_STATUS.ACCEPTED) {
        throw new BadRequestError('Cannot expire an opportunity that has already been accepted');
      }

      // Tenant isolation & premature release enforcement:
      // If caller is NOT Super Admin (e.g. Franchise user calling via API):
      const isSuperAdmin = Boolean(context?.isSuperAdmin);
      if (!isSuperAdmin && context?.franchiseId !== undefined) {
        // 1. Franchise users may release only their own opportunities
        if (opp.franchise_id !== context.franchiseId) {
          throw new ForbiddenError('Access denied: You can only release opportunities offered to your own franchise');
        }

        // 2. Franchise users cannot release an opportunity before expires_at
        const now = Date.now();
        const expiresAt = new Date(
          opp.expires_at.replace(' ', 'T') + (opp.expires_at.includes('Z') ? '' : 'Z')
        ).getTime();

        if (now < expiresAt) {
          throw new BadRequestError(
            `Cannot release opportunity prematurely. Acceptance window is active until ${opp.expires_at}.`
          );
        }
      }

      // Mark expired
      await tx.execute(
        `UPDATE lead_opportunities SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [OPPORTUNITY_STATUS.EXPIRED, opportunityId]
      );

      // Record expiration in history
      const histId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO lead_assignment_history (
          id, lead_id, action, from_franchise_id, campaign_id, opportunity_id, reason, performed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          histId,
          leadId,
          LEAD_HISTORY_ACTION.EXPIRED_RELEASED,
          opp.franchise_id,
          opp.campaign_id,
          opportunityId,
          '1-hour acceptance window expired without acceptance. Released for re-distribution.',
          context?.userId || null,
        ]
      );

      // Re-route lead to next eligible franchise
      nextRouting = await this.routeLeadInternal(leadId, tx, context);
    });

    await AuditService.log({
      action: 'LEAD_OPPORTUNITY_EXPIRED',
      entityType: 'lead_opportunity',
      entityId: opportunityId,
      userId: context?.userId,
      newValues: {
        leadId,
        nextRouting,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return { leadId, nextRouting };
  }

  /**
   * Process all expired pending opportunities across the platform.
   * Can be run on schedule or invoked via maintenance API.
   */
  static async processAllExpiredOpportunities(
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ processedCount: number; results: Array<{ opportunityId: string; leadId: string; nextRouting: any }> }> {
    const db = getDatabase();

    // Query pending opportunities where expires_at <= CURRENT_TIMESTAMP
    const expiredOpps = await db.query<{ id: string; lead_id: string }>(
      `SELECT id, lead_id FROM lead_opportunities 
       WHERE status = 'pending' 
         AND expires_at <= CURRENT_TIMESTAMP`
    );

    const results: Array<{ opportunityId: string; leadId: string; nextRouting: any }> = [];

    for (const opp of expiredOpps) {
      try {
        const res = await this.releaseExpiredOpportunity(opp.id, context);
        results.push({
          opportunityId: opp.id,
          leadId: res.leadId,
          nextRouting: res.nextRouting,
        });
      } catch (err: any) {
        console.error(`Failed to release expired opportunity ${opp.id}:`, err?.message);
      }
    }

    return {
      processedCount: results.length,
      results,
    };
  }

  /**
   * Get single lead by ID with full details, current opportunity status, and assignment history.
   */
  static async getLeadById(
    id: string,
    orgScope?: string
  ): Promise<LeadDetail | null> {
    const db = getDatabase();

    const rows = await db.query<any>(
      `SELECT l.*, s.code as service_code, s.name as service_name, s.service_fee,
              o.name as assigned_franchise_name
       FROM leads l
       LEFT JOIN service_masters s ON l.service_id = s.id
       LEFT JOIN organizations o ON l.assigned_franchise_id = o.id
       WHERE l.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) return null;
    const raw = rows[0];

    // If orgScope is set, verify access (either permanently assigned or currently offered)
    if (orgScope && raw.assigned_franchise_id !== orgScope) {
      // Check if currently offered to this franchise
      const oppCheck = await db.query<any>(
        `SELECT id FROM lead_opportunities WHERE lead_id = ? AND franchise_id = ? LIMIT 1`,
        [id, orgScope]
      );
      if (oppCheck.length === 0) {
        throw new ForbiddenError('You do not have permission to view this lead');
      }
    }

    // Get current active or latest opportunity
    const oppRows = await db.query<any>(
      `SELECT opp.*, org.name as franchise_name
       FROM lead_opportunities opp
       LEFT JOIN organizations org ON opp.franchise_id = org.id
       WHERE opp.lead_id = ?
       ORDER BY opp.created_at DESC, opp.id DESC LIMIT 1`,
      [id]
    );

    let currentOpportunity = null;
    if (oppRows.length > 0) {
      const opp = oppRows[0];
      const now = new Date();
      const expiresAt = new Date(opp.expires_at.replace(' ', 'T') + (opp.expires_at.includes('Z') ? '' : 'Z'));
      const secondsRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      const isExpired = opp.status === 'expired' || (opp.status === 'pending' && secondsRemaining <= 0);

      currentOpportunity = {
        id: opp.id,
        franchise_id: opp.franchise_id,
        campaign_id: opp.campaign_id,
        franchise_name: opp.franchise_name,
        status: opp.status,
        offered_at: opp.offered_at,
        expires_at: opp.expires_at,
        seconds_remaining: secondsRemaining,
        is_expired: isExpired,
      };
    }

    // Get assignment history
    const historyRows = await db.query<LeadAssignmentHistoryModel>(
      `SELECT * FROM lead_assignment_history WHERE lead_id = ? ORDER BY created_at ASC`,
      [id]
    );

    return {
      ...raw,
      service_fee: raw.service_fee !== null ? Number(raw.service_fee) : undefined,
      current_opportunity: currentOpportunity,
      history: historyRows,
    };
  }

  /**
   * List pending opportunities for a franchise (Franchise Inbox).
   * Automatically auto-expires any opportunity whose 1-hour window passed.
   */
  static async listFranchiseOpportunities(
    franchiseId: string,
    status: 'pending' | 'accepted' | 'expired' | 'all' = 'pending'
  ): Promise<FranchiseOpportunityDetail[]> {
    const db = getDatabase();

    let statusCondition = '';
    const params: any[] = [franchiseId];

    if (status !== 'all') {
      statusCondition = 'AND opp.status = ?';
      params.push(status);
    }

    const rows = await db.query<any>(
      `SELECT opp.*, l.lead_number, l.customer_name, l.customer_phone, l.customer_email,
              l.service_id, l.city, l.district, l.state,
              s.code as service_code, s.name as service_name,
              c.name as campaign_name
       FROM lead_opportunities opp
       JOIN leads l ON opp.lead_id = l.id
       JOIN service_masters s ON l.service_id = s.id
       JOIN franchise_campaigns c ON opp.campaign_id = c.id
       WHERE opp.franchise_id = ?
         ${statusCondition}
       ORDER BY opp.created_at DESC`,
      params
    );

    const now = new Date();
    const result: FranchiseOpportunityDetail[] = [];

    for (const r of rows) {
      const expiresAt = new Date(r.expires_at.replace(' ', 'T') + (r.expires_at.includes('Z') ? '' : 'Z'));
      const secondsRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      const isExpired = r.status === 'expired' || (r.status === 'pending' && secondsRemaining <= 0);

      // Auto-expire in background if pending but timed out
      if (r.status === 'pending' && secondsRemaining <= 0) {
        // Fire-and-forget release
        this.releaseExpiredOpportunity(r.id).catch((err) =>
          console.error(`Auto-expire failed for opp ${r.id}:`, err?.message)
        );
        r.status = 'expired';
      }

      result.push({
        ...r,
        seconds_remaining: secondsRemaining,
        is_expired: isExpired,
      });
    }

    return result;
  }

  /**
   * List leads with filtering and pagination.
   */
  static async listLeads(
    filter: ListLeadsFilter,
    orgScope?: string
  ): Promise<{ leads: LeadDetail[]; total: number }> {
    const db = getDatabase();

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (orgScope) {
      conditions.push('l.assigned_franchise_id = ?');
      params.push(orgScope);
    } else if (filter.franchiseId) {
      conditions.push('l.assigned_franchise_id = ?');
      params.push(filter.franchiseId);
    }

    if (filter.status) {
      conditions.push('l.status = ?');
      params.push(filter.status);
    }

    if (filter.serviceId) {
      conditions.push('l.service_id = ?');
      params.push(filter.serviceId);
    }

    if (filter.city) {
      conditions.push('LOWER(l.city) = LOWER(?)');
      params.push(filter.city.trim());
    }

    if (filter.district) {
      conditions.push('LOWER(l.district) = LOWER(?)');
      params.push(filter.district.trim());
    }

    if (filter.state) {
      conditions.push('LOWER(l.state) = LOWER(?)');
      params.push(filter.state.trim());
    }

    const whereSql = conditions.join(' AND ');

    // Total count
    const countRows = await db.query<any>(
      `SELECT COUNT(*) as total FROM leads l WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const limit = Math.min(filter.limit || 50, 100);
    const offset = filter.offset || 0;

    const rows = await db.query<any>(
      `SELECT l.*, s.code as service_code, s.name as service_name, s.service_fee,
              o.name as assigned_franchise_name
       FROM leads l
       LEFT JOIN service_masters s ON l.service_id = s.id
       LEFT JOIN organizations o ON l.assigned_franchise_id = o.id
       WHERE ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const leads: LeadDetail[] = rows.map((raw) => ({
      ...raw,
      service_fee: raw.service_fee !== null ? Number(raw.service_fee) : undefined,
    }));

    return { leads, total };
  }
}
