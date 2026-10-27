import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../errors/AppError.js';
import type { AuthenticatedUser as AuthUser } from '../types/index.js';
import {
  ADVERTISEMENT_REQUEST_STATUS,
  type AdvertisementRequest,
  type AdvertisementRequestStatus,
  type AdvertisementRequestHistory,
  type CreateAdvertisementRequestInput,
  type ReviewAdvertisementRequestInput,
  type ApproveAdvertisementRequestInput,
  type RejectAdvertisementRequestInput,
  type UpdateAdvertisementStatusInput,
  type AddAdvertisementNoteInput,
  type AdvertisementRequestFilters,
  type AdvertisementRequestSummary,
} from './types.js';

export class AdvertisementService {
  /**
   * Helper: check if authenticated user is Super Admin
   */
  private static isSuperAdmin(user: AuthUser): boolean {
    return user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }

  /**
   * Helper: Generate unique advertisement request number
   * Format: ADR-YYYYMMDD-XXXX (e.g. ADR-20261003-8K92)
   */
  private static generateRequestNumber(): string {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ADR-${today}-${rand}`;
  }

  /**
   * Helper: Build unified SELECT query with joined franchise, service and user metadata
   */
  private static getBaseSelectQuery(): string {
    return `
      SELECT 
        ar.*,
        o.name AS franchise_name,
        fp.franchise_code,
        sm.name AS service_name,
        sm.code AS service_code,
        u_creator.first_name || ' ' || u_creator.last_name AS created_by_name,
        u_creator.email AS created_by_email,
        u_rev.first_name || ' ' || u_rev.last_name AS reviewed_by_name,
        u_app.first_name || ' ' || u_app.last_name AS approved_by_name,
        u_comp.first_name || ' ' || u_comp.last_name AS completed_by_name,
        u_rej.first_name || ' ' || u_rej.last_name AS rejected_by_name
      FROM advertisement_requests ar
      LEFT JOIN organizations o ON ar.franchise_id = o.id
      LEFT JOIN franchise_profiles fp ON ar.franchise_id = fp.organization_id
      LEFT JOIN service_masters sm ON ar.service_id = sm.id
      LEFT JOIN users u_creator ON ar.created_by_user_id = u_creator.id
      LEFT JOIN users u_rev ON ar.reviewed_by_user_id = u_rev.id
      LEFT JOIN users u_app ON ar.approved_by_user_id = u_app.id
      LEFT JOIN users u_comp ON ar.completed_by_user_id = u_comp.id
      LEFT JOIN users u_rej ON ar.rejected_by_user_id = u_rej.id
    `;
  }

  /**
   * 1. Create a new advertisement request
   * Franchise creates request for its assigned organization.
   * Super Admin can create on behalf of a specific franchise.
   */
  static async createRequest(
    input: CreateAdvertisementRequestInput,
    user: AuthUser
  ): Promise<AdvertisementRequest> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // Tenant isolation: determine target franchise
    let targetFranchiseId = user.organizationId;
    if (this.isSuperAdmin(user)) {
      if (input.franchise_id) {
        targetFranchiseId = input.franchise_id;
      } else {
        // Fallback to first available active franchise if not specified by admin
        const orgRows = await db.query<any>(
          "SELECT id FROM organizations WHERE type = 'franchise' AND status = 'active' LIMIT 1"
        );
        targetFranchiseId = orgRows[0]?.id || 'org_salem_001';
      }
    }

    if (!targetFranchiseId) {
      throw new BadRequestError('Franchise organization context is required to create an advertisement request');
    }

    // Verify franchise exists
    const franchiseCheck = await db.query<any>(
      'SELECT id, name FROM organizations WHERE id = ? LIMIT 1',
      [targetFranchiseId]
    );
    if (franchiseCheck.length === 0) {
      throw new NotFoundError(`Franchise organization with ID '${targetFranchiseId}' not found`);
    }

    // Verify service if provided
    if (input.service_id) {
      const svcCheck = await db.query<any>(
        'SELECT id FROM service_masters WHERE id = ? LIMIT 1',
        [input.service_id]
      );
      if (svcCheck.length === 0) {
        throw new NotFoundError(`Service with ID '${input.service_id}' not found`);
      }
    }

    const id = `adv_req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const requestNumber = this.generateRequestNumber();
    const nowIso = new Date().toISOString();

    await db.execute(
      `INSERT INTO advertisement_requests (
        id, request_number, franchise_id, created_by_user_id,
        title, description, advertising_type, service_id,
        target_audience, target_location, preferred_timeline,
        notes, reference_details, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        requestNumber,
        targetFranchiseId,
        user.id,
        input.title.trim(),
        input.description.trim(),
        input.advertising_type.trim(),
        input.service_id || null,
        input.target_audience || null,
        input.target_location || null,
        input.preferred_timeline || null,
        input.notes || null,
        input.reference_details || null,
        ADVERTISEMENT_REQUEST_STATUS.PENDING,
        nowIso,
        nowIso,
      ]
    );

    // Initial history event
    const historyId = `adh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await db.execute(
      `INSERT INTO advertisement_request_history (
        id, request_id, author_user_id, action_type, previous_status, new_status, note, metadata, created_at
      ) VALUES (?, ?, ?, 'created', NULL, ?, ?, ?, ?)`,
      [
        historyId,
        id,
        user.id,
        ADVERTISEMENT_REQUEST_STATUS.PENDING,
        'Advertisement request submitted by franchise partner',
        JSON.stringify({
          advertising_type: input.advertising_type,
          service_id: input.service_id || null,
        }),
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: targetFranchiseId,
      action: 'ADVERTISEMENT_REQUEST_CREATED',
      entityType: 'ADVERTISEMENT_REQUEST',
      entityId: id,
      newValues: {
        request_number: requestNumber,
        title: input.title,
        advertising_type: input.advertising_type,
        status: ADVERTISEMENT_REQUEST_STATUS.PENDING,
      },
    });

    return this.getRequestById(id, user);
  }

  /**
   * 2. Get single advertisement request by ID
   * Enforces tenant isolation.
   */
  static async getRequestById(id: string, user: AuthUser): Promise<AdvertisementRequest> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    let query = `${this.getBaseSelectQuery()} WHERE ar.id = ?`;
    const params: any[] = [id];

    if (!isSuper) {
      if (!user.organizationId) {
        throw new ForbiddenError('Franchise user lacks valid organization affiliation');
      }
      query += ' AND ar.franchise_id = ?';
      params.push(user.organizationId);
    }

    const rows = await db.query<any>(`${query} LIMIT 1`, params);
    if (rows.length === 0) {
      throw new NotFoundError(`Advertisement request '${id}' not found or access denied`);
    }

    const request = rows[0] as AdvertisementRequest;
    if (!isSuper) {
      request.admin_notes = null;
    }

    return request;
  }

  /**
   * 3. List advertisement requests with search, filter, pagination
   * Super Admin sees all (or filtered).
   * Franchise sees only its own requests.
   */
  static async listRequests(
    filters: AdvertisementRequestFilters,
    user: AuthUser
  ): Promise<{ requests: AdvertisementRequest[]; total: number }> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = [];
    const params: any[] = [];

    // Tenant isolation
    if (!isSuper) {
      if (!user.organizationId) {
        return { requests: [], total: 0 };
      }
      conditions.push('ar.franchise_id = ?');
      params.push(user.organizationId);
    } else if (filters.franchise_id && filters.franchise_id !== 'all') {
      conditions.push('ar.franchise_id = ?');
      params.push(filters.franchise_id);
    }

    // Status filter
    if (filters.status && filters.status !== 'all' && filters.status !== 'ALL') {
      conditions.push('ar.status = ?');
      params.push(filters.status);
    }

    // Advertising type filter
    if (filters.advertising_type && filters.advertising_type !== 'all') {
      conditions.push('ar.advertising_type = ?');
      params.push(filters.advertising_type);
    }

    // Service filter
    if (filters.service_id && filters.service_id !== 'all') {
      conditions.push('ar.service_id = ?');
      params.push(filters.service_id);
    }

    // Search term
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(`(
        ar.request_number LIKE ? OR
        ar.title LIKE ? OR
        ar.description LIKE ? OR
        ar.advertising_type LIKE ? OR
        ar.target_location LIKE ? OR
        o.name LIKE ?
      )`);
      params.push(term, term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM advertisement_requests ar
      LEFT JOIN organizations o ON ar.franchise_id = o.id
      ${whereClause}
    `;
    const countRows = await db.query<any>(countSql, params);
    const total = countRows[0]?.total ? Number(countRows[0].total) : 0;

    // Sorting & Pagination
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const offset = (page - 1) * limit;

    const allowedSortFields: Record<string, string> = {
      created_at: 'ar.created_at',
      updated_at: 'ar.updated_at',
      title: 'ar.title',
      status: 'ar.status',
    };
    const sortField = allowedSortFields[filters.sort_by || 'created_at'] || 'ar.created_at';
    const sortOrder = filters.sort_order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const dataSql = `
      ${this.getBaseSelectQuery()}
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const requests = await db.query<AdvertisementRequest>(dataSql, params);
    if (!isSuper) {
      for (const r of requests) {
        r.admin_notes = null;
      }
    }
    return { requests, total };
  }

  /**
   * 4. Admin Review: Transition PENDING -> UNDER_REVIEW
   * Super Admin only.
   */
  static async reviewRequest(
    id: string,
    input: ReviewAdvertisementRequestInput,
    user: AuthUser
  ): Promise<AdvertisementRequest> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can review advertisement requests');
    }

    const existing = await this.getRequestById(id, user);

    if (
      existing.status !== ADVERTISEMENT_REQUEST_STATUS.PENDING &&
      existing.status !== ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW
    ) {
      throw new BadRequestError(
        `Cannot put request into review from current status '${existing.status}'. Expected 'PENDING'.`
      );
    }

    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE advertisement_requests
       SET status = ?,
           reviewed_by_user_id = ?,
           reviewed_at = ?,
           admin_notes = COALESCE(?, admin_notes),
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW,
        user.id,
        nowIso,
        input.notes || null,
        id,
      ]
    );

    // Record history
    const historyId = `adh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await db.execute(
      `INSERT INTO advertisement_request_history (
        id, request_id, author_user_id, action_type, previous_status, new_status, note, metadata, created_at
      ) VALUES (?, ?, ?, 'under_review', ?, ?, ?, ?, ?)`,
      [
        historyId,
        id,
        user.id,
        existing.status,
        ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW,
        input.notes || 'Request moved to Under Review by Super Admin',
        JSON.stringify({ reviewed_by: user.id }),
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'ADVERTISEMENT_REQUEST_UNDER_REVIEW',
      entityType: 'ADVERTISEMENT_REQUEST',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW,
        admin_notes: input.notes || null,
      },
    });

    return this.getRequestById(id, user);
  }

  /**
   * 5. Admin Approve: Transition UNDER_REVIEW (or PENDING) -> APPROVED
   * Super Admin only.
   * Explicitly decoupled: NO automatic campaign creation.
   */
  static async approveRequest(
    id: string,
    input: ApproveAdvertisementRequestInput,
    user: AuthUser
  ): Promise<AdvertisementRequest> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can approve advertisement requests');
    }

    const existing = await this.getRequestById(id, user);

    if (
      existing.status !== ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW &&
      existing.status !== ADVERTISEMENT_REQUEST_STATUS.PENDING
    ) {
      throw new BadRequestError(
        `Cannot approve advertisement request in status '${existing.status}'. Expected 'UNDER_REVIEW' or 'PENDING'.`
      );
    }

    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE advertisement_requests
       SET status = ?,
           approved_by_user_id = ?,
           approved_at = ?,
           admin_notes = COALESCE(?, admin_notes),
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        ADVERTISEMENT_REQUEST_STATUS.APPROVED,
        user.id,
        nowIso,
        input.admin_notes || null,
        id,
      ]
    );

    // Record history (lifecycle event note is public for franchise; internal admin_notes are kept separate)
    const historyId = `adh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await db.execute(
      `INSERT INTO advertisement_request_history (
        id, request_id, author_user_id, action_type, previous_status, new_status, note, metadata, created_at
      ) VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
      [
        historyId,
        id,
        user.id,
        existing.status,
        ADVERTISEMENT_REQUEST_STATUS.APPROVED,
        'Advertisement request approved by Super Admin',
        JSON.stringify({
          approved_by: user.id,
          admin_notes: input.admin_notes || null,
        }),
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'ADVERTISEMENT_REQUEST_APPROVED',
      entityType: 'ADVERTISEMENT_REQUEST',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: ADVERTISEMENT_REQUEST_STATUS.APPROVED,
        admin_notes: input.admin_notes || null,
      },
    });

    return this.getRequestById(id, user);
  }

  /**
   * 6. Admin Reject: Transition UNDER_REVIEW (or PENDING) -> REJECTED with reason
   * Super Admin only.
   */
  static async rejectRequest(
    id: string,
    input: RejectAdvertisementRequestInput,
    user: AuthUser
  ): Promise<AdvertisementRequest> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can reject advertisement requests');
    }

    if (!input.rejection_reason || !input.rejection_reason.trim()) {
      throw new BadRequestError('Rejection reason is mandatory when rejecting an advertisement request');
    }

    const existing = await this.getRequestById(id, user);

    if (
      existing.status === ADVERTISEMENT_REQUEST_STATUS.COMPLETED ||
      existing.status === ADVERTISEMENT_REQUEST_STATUS.REJECTED
    ) {
      throw new BadRequestError(
        `Cannot reject advertisement request in '${existing.status}' status.`
      );
    }

    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE advertisement_requests
       SET status = ?,
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = ?,
           admin_notes = COALESCE(?, admin_notes),
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        ADVERTISEMENT_REQUEST_STATUS.REJECTED,
        input.rejection_reason.trim(),
        user.id,
        nowIso,
        input.admin_notes || null,
        id,
      ]
    );

    // Record history
    const historyId = `adh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await db.execute(
      `INSERT INTO advertisement_request_history (
        id, request_id, author_user_id, action_type, previous_status, new_status, note, metadata, created_at
      ) VALUES (?, ?, ?, 'rejected', ?, ?, ?, ?, ?)`,
      [
        historyId,
        id,
        user.id,
        existing.status,
        ADVERTISEMENT_REQUEST_STATUS.REJECTED,
        `Rejected: ${input.rejection_reason.trim()}`,
        JSON.stringify({
          rejection_reason: input.rejection_reason.trim(),
          admin_notes: input.admin_notes || null,
        }),
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'ADVERTISEMENT_REQUEST_REJECTED',
      entityType: 'ADVERTISEMENT_REQUEST',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: ADVERTISEMENT_REQUEST_STATUS.REJECTED,
        rejection_reason: input.rejection_reason.trim(),
        admin_notes: input.admin_notes || null,
      },
    });

    return this.getRequestById(id, user);
  }

  /**
   * 7. Admin Lifecycle Status Updates:
   * APPROVED -> IN_PROGRESS
   * IN_PROGRESS -> COMPLETED
   * Super Admin only.
   */
  static async updateStatus(
    id: string,
    input: UpdateAdvertisementStatusInput,
    user: AuthUser
  ): Promise<AdvertisementRequest> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can update advertisement request execution status');
    }

    const existing = await this.getRequestById(id, user);
    const targetStatus = input.status;

    // Validate lifecycle transitions
    if (targetStatus === ADVERTISEMENT_REQUEST_STATUS.IN_PROGRESS) {
      if (
        existing.status !== ADVERTISEMENT_REQUEST_STATUS.APPROVED &&
        existing.status !== ADVERTISEMENT_REQUEST_STATUS.IN_PROGRESS
      ) {
        throw new BadRequestError(
          `Cannot mark request 'IN_PROGRESS' from status '${existing.status}'. Expected 'APPROVED'.`
        );
      }
    } else if (targetStatus === ADVERTISEMENT_REQUEST_STATUS.COMPLETED) {
      if (existing.status !== ADVERTISEMENT_REQUEST_STATUS.IN_PROGRESS) {
        throw new BadRequestError(
          `Cannot mark request 'COMPLETED' from status '${existing.status}'. Expected 'IN_PROGRESS'.`
        );
      }
    } else if (targetStatus === ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW) {
      if (existing.status !== ADVERTISEMENT_REQUEST_STATUS.PENDING) {
        throw new BadRequestError(
          `Cannot mark request 'UNDER_REVIEW' from status '${existing.status}'. Expected 'PENDING'.`
        );
      }
    } else {
      throw new BadRequestError(`Unsupported status transition to '${targetStatus}'`);
    }

    const nowIso = new Date().toISOString();
    const isCompletion = targetStatus === ADVERTISEMENT_REQUEST_STATUS.COMPLETED;

    await db.execute(
      `UPDATE advertisement_requests
       SET status = ?,
           completed_by_user_id = CASE WHEN ? THEN ? ELSE completed_by_user_id END,
           completed_at = CASE WHEN ? THEN ? ELSE completed_at END,
           admin_notes = COALESCE(?, admin_notes),
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        targetStatus,
        isCompletion ? 1 : 0,
        user.id,
        isCompletion ? 1 : 0,
        nowIso,
        input.notes || null,
        id,
      ]
    );

    // Record history
    const actionType =
      targetStatus === ADVERTISEMENT_REQUEST_STATUS.IN_PROGRESS
        ? 'in_progress'
        : targetStatus === ADVERTISEMENT_REQUEST_STATUS.COMPLETED
        ? 'completed'
        : 'status_change';

    const historyId = `adh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await db.execute(
      `INSERT INTO advertisement_request_history (
        id, request_id, author_user_id, action_type, previous_status, new_status, note, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        historyId,
        id,
        user.id,
        actionType,
        existing.status,
        targetStatus,
        input.notes || `Request status updated to ${targetStatus}`,
        JSON.stringify({ updated_by: user.id }),
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'ADVERTISEMENT_REQUEST_STATUS_UPDATED',
      entityType: 'ADVERTISEMENT_REQUEST',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: targetStatus,
        notes: input.notes || null,
      },
    });

    return this.getRequestById(id, user);
  }

  /**
   * 8. Add Admin Note to Request History
   * Super Admin only.
   */
  static async addAdminNote(
    id: string,
    input: AddAdvertisementNoteInput,
    user: AuthUser
  ): Promise<AdvertisementRequestHistory> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can add admin notes to advertisement requests');
    }

    if (!input.note || !input.note.trim()) {
      throw new BadRequestError('Admin note content cannot be empty');
    }

    const existing = await this.getRequestById(id, user);
    const nowIso = new Date().toISOString();
    const historyId = `adh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    await db.execute(
      `INSERT INTO advertisement_request_history (
        id, request_id, author_user_id, action_type, previous_status, new_status, note, metadata, created_at
      ) VALUES (?, ?, ?, 'admin_note', ?, ?, ?, ?, ?)`,
      [
        historyId,
        id,
        user.id,
        existing.status,
        existing.status,
        input.note.trim(),
        JSON.stringify({ note_by: user.id }),
        nowIso,
      ]
    );

    // Also update admin_notes on the request row for fast reference
    await db.execute(
      `UPDATE advertisement_requests
       SET admin_notes = ?,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [input.note.trim(), id]
    );

    return {
      id: historyId,
      request_id: id,
      author_user_id: user.id,
      author_name: `${user.firstName} ${user.lastName || ''}`.trim() || 'Super Admin',
      author_role: 'super_admin',
      action_type: 'admin_note',
      previous_status: existing.status,
      new_status: existing.status,
      note: input.note.trim(),
      metadata: { note_by: user.id },
      created_at: nowIso,
    };
  }

  /**
   * 9. Get Request History / Audit Trail
   * Franchise can view history for its own request (excluding internal admin notes).
   * Super Admin can view full history for any request including internal admin notes.
   */
  static async getRequestHistory(id: string, user: AuthUser): Promise<AdvertisementRequestHistory[]> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    // Validate request existence and tenant access
    await this.getRequestById(id, user);

    const conditions: string[] = ['h.request_id = ?'];
    const queryParams: any[] = [id];

    // Franchise Owner / Staff must NEVER see history entries with action_type = admin_note
    if (!isSuper) {
      conditions.push("h.action_type != 'admin_note'");
    }

    const rows = await db.query<any>(
      `SELECT 
        h.*,
        u.first_name || ' ' || u.last_name AS author_name,
        r.code AS author_role
       FROM advertisement_request_history h
       LEFT JOIN users u ON h.author_user_id = u.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY h.created_at ASC`,
      queryParams
    );

    return rows.map((r: any) => {
      let parsedMetadata = r.metadata ? JSON.parse(r.metadata) : null;
      if (!isSuper && parsedMetadata) {
        // Strip any internal admin notes captured in metadata
        if ('admin_notes' in parsedMetadata) {
          delete parsedMetadata.admin_notes;
        }
      }

      return {
        id: r.id,
        request_id: r.request_id,
        author_user_id: r.author_user_id,
        author_name: r.author_name || 'System',
        author_role: r.author_role || undefined,
        action_type: r.action_type,
        previous_status: r.previous_status,
        new_status: r.new_status,
        note: r.note,
        metadata: parsedMetadata,
        created_at: r.created_at,
      };
    });
  }

  /**
   * 10. Summary KPI metrics (scoped by tenant if franchise)
   */
  static async getSummary(user: AuthUser): Promise<AdvertisementRequestSummary> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    let whereClause = '';
    const params: any[] = [];

    if (!isSuper) {
      if (!user.organizationId) {
        return {
          total: 0,
          pending: 0,
          under_review: 0,
          approved: 0,
          in_progress: 0,
          completed: 0,
          rejected: 0,
        };
      }
      whereClause = 'WHERE franchise_id = ?';
      params.push(user.organizationId);
    }

    const rows = await db.query<any>(
      `SELECT status, COUNT(*) AS count
       FROM advertisement_requests
       ${whereClause}
       GROUP BY status`,
      params
    );

    const summary: AdvertisementRequestSummary = {
      total: 0,
      pending: 0,
      under_review: 0,
      approved: 0,
      in_progress: 0,
      completed: 0,
      rejected: 0,
    };

    for (const row of rows) {
      const cnt = Number(row.count || 0);
      summary.total += cnt;
      switch (row.status) {
        case ADVERTISEMENT_REQUEST_STATUS.PENDING:
          summary.pending = cnt;
          break;
        case ADVERTISEMENT_REQUEST_STATUS.UNDER_REVIEW:
          summary.under_review = cnt;
          break;
        case ADVERTISEMENT_REQUEST_STATUS.APPROVED:
          summary.approved = cnt;
          break;
        case ADVERTISEMENT_REQUEST_STATUS.IN_PROGRESS:
          summary.in_progress = cnt;
          break;
        case ADVERTISEMENT_REQUEST_STATUS.COMPLETED:
          summary.completed = cnt;
          break;
        case ADVERTISEMENT_REQUEST_STATUS.REJECTED:
          summary.rejected = cnt;
          break;
      }
    }

    return summary;
  }
}
