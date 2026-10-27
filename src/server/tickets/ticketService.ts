import { randomUUID } from 'crypto';
import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { AuthenticatedUser as AuthUser } from '../types/index.js';
import type {
  Ticket,
  TicketDetail,
  TicketMessage,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  CreateTicketInput,
  AddMessageInput,
  TicketFilterCriteria,
  TicketStats,
} from './types.js';

export class TicketService {
  /**
   * Helper to determine if user has Super Admin authority
   */
  private static isSuperAdmin(user?: AuthUser): boolean {
    if (!user) return false;
    return Boolean(
      user.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN) ||
      (user as any).role === SYSTEM_ROLES.SUPER_ADMIN ||
      user.email === 'admin@lbsc.internal'
    );
  }

  /**
   * 1. Create a new support ticket
   * Franchise staff/owners raise tickets for their own organization.
   * Super Admins can raise tickets or raise on behalf of any organization.
   */
  static async createTicket(input: CreateTicketInput, user: AuthUser): Promise<Ticket> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    let organizationId = user.organizationId;
    if (isSuper && input.organizationId) {
      organizationId = input.organizationId;
    }

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required to raise a support ticket');
    }

    // Verify organization exists
    const orgs = await db.query<any>('SELECT id, name FROM organizations WHERE id = ?', [organizationId]);
    if (orgs.length === 0) {
      throw new NotFoundError(`Organization '${organizationId}' not found`);
    }

    // Generate unique ticket number
    const countResult = await db.query<any>('SELECT COUNT(*) as cnt FROM tickets');
    const seq = Number(countResult[0]?.cnt || 0) + 1;
    const year = new Date().getFullYear();
    const ticketNumber = `TKT-${year}-${String(seq).padStart(4, '0')}`;

    const id = `tkt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const priority = input.priority || 'medium';
    const status: TicketStatus = 'open';

    await db.execute(
      `INSERT INTO tickets (
        id, ticket_number, organization_id, created_by_user_id, assigned_to_user_id,
        title, description, category, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ticketNumber,
        organizationId,
        user.id,
        input.title.trim(),
        input.description.trim(),
        input.category,
        priority,
        status,
        now,
        now,
      ]
    );

    // Record audit log
    await AuditService.log({
      organizationId,
      userId: user.id,
      action: 'ticket.created',
      entityType: 'ticket',
      entityId: id,
      newValues: {
        ticketNumber,
        title: input.title,
        category: input.category,
        priority,
        status,
      },
    });

    const ticket = await this.getTicketById(id, user);
    return ticket;
  }

  /**
   * 2. List tickets with filtering, pagination, and strict tenant isolation
   */
  static async listTickets(
    criteria: TicketFilterCriteria,
    user: AuthUser
  ): Promise<{ tickets: Ticket[]; total: number; page: number; limit: number; totalPages: number }> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // Tenant Isolation: Franchise users ONLY see their own organization's tickets
    if (!isSuper) {
      if (!user.organizationId) {
        throw new ForbiddenError('Franchise user must belong to an organization to view tickets');
      }
      conditions.push('t.organization_id = ?');
      params.push(user.organizationId);
    } else if (criteria.franchiseId && criteria.franchiseId !== 'all') {
      conditions.push('t.organization_id = ?');
      params.push(criteria.franchiseId);
    }

    if (criteria.status && criteria.status !== 'all') {
      conditions.push('t.status = ?');
      params.push(criteria.status);
    }

    if (criteria.priority && criteria.priority !== 'all') {
      conditions.push('t.priority = ?');
      params.push(criteria.priority);
    }

    if (criteria.category && criteria.category !== 'all') {
      conditions.push('t.category = ?');
      params.push(criteria.category);
    }

    if (criteria.search && criteria.search.trim() !== '') {
      const q = `%${criteria.search.trim()}%`;
      conditions.push(
        `(LOWER(t.ticket_number) LIKE LOWER(?) OR LOWER(t.title) LIKE LOWER(?) OR LOWER(t.description) LIKE LOWER(?) OR LOWER(COALESCE(fp.operating_name, fa.business_name, o.name, '')) LIKE LOWER(?))`
      );
      params.push(q, q, q, q);
    }

    if (criteria.startDate) {
      conditions.push('t.created_at >= ?');
      params.push(criteria.startDate);
    }

    if (criteria.endDate) {
      conditions.push('t.created_at <= ?');
      params.push(criteria.endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countSql = `
      SELECT COUNT(*) as total
      FROM tickets t
      JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      WHERE ${whereClause}
    `;
    const countRows = await db.query<any>(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    // Pagination
    const page = Math.max(1, criteria.page || 1);
    const limit = Math.max(1, Math.min(100, criteria.limit || 50));
    const offset = (page - 1) * limit;

    const selectSql = `
      SELECT 
        t.*,
        COALESCE(fp.operating_name, fa.business_name, o.name) as organization_name,
        COALESCE(fp.franchise_code, o.code) as franchise_code,
        COALESCE(fp.city, fa.city, '') as city,
        (u_created.first_name || ' ' || COALESCE(u_created.last_name, '')) as creator_name,
        u_created.email as creator_email,
        (u_assigned.first_name || ' ' || COALESCE(u_assigned.last_name, '')) as assignee_name,
        u_assigned.email as assignee_email,
        (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id ${isSuper ? '' : 'AND tm.is_internal = 0'}) as message_count,
        (SELECT MAX(created_at) FROM ticket_messages tm WHERE tm.ticket_id = t.id ${isSuper ? '' : 'AND tm.is_internal = 0'}) as last_message_at
      FROM tickets t
      JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      LEFT JOIN users u_created ON t.created_by_user_id = u_created.id
      LEFT JOIN users u_assigned ON t.assigned_to_user_id = u_assigned.id
      WHERE ${whereClause}
      ORDER BY 
        CASE t.status
          WHEN 'open' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'resolved' THEN 3
          WHEN 'closed' THEN 4
          ELSE 5
        END,
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const tickets = await db.query<Ticket>(selectSql, [...params, limit, offset]);

    return {
      tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * 3. Get ticket details with messages history
   * Enforces tenant isolation and hides internal notes from franchise users
   */
  static async getTicketById(ticketId: string, user: AuthUser): Promise<TicketDetail> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const ticketSql = `
      SELECT 
        t.*,
        COALESCE(fp.operating_name, fa.business_name, o.name) as organization_name,
        COALESCE(fp.franchise_code, o.code) as franchise_code,
        COALESCE(fp.city, fa.city, '') as city,
        (u_created.first_name || ' ' || COALESCE(u_created.last_name, '')) as creator_name,
        u_created.email as creator_email,
        (u_assigned.first_name || ' ' || COALESCE(u_assigned.last_name, '')) as assignee_name,
        u_assigned.email as assignee_email
      FROM tickets t
      JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      LEFT JOIN users u_created ON t.created_by_user_id = u_created.id
      LEFT JOIN users u_assigned ON t.assigned_to_user_id = u_assigned.id
      WHERE t.id = ?
    `;

    const tickets = await db.query<Ticket>(ticketSql, [ticketId]);
    if (tickets.length === 0) {
      throw new NotFoundError(`Ticket '${ticketId}' not found`);
    }

    const ticket = tickets[0];

    // Strict Tenant Isolation check
    if (!isSuper && ticket.organization_id !== user.organizationId) {
      throw new ForbiddenError('Unauthorized: You do not have permission to view tickets for another organization');
    }

    // Fetch messages: Super Admin gets all messages; Franchise gets ONLY public messages (is_internal = 0)
    const messagesSql = `
      SELECT 
        tm.*,
        (u.first_name || ' ' || COALESCE(u.last_name, '')) as author_name,
        u.email as author_email,
        r.code as author_role
      FROM ticket_messages tm
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE tm.ticket_id = ? ${isSuper ? '' : 'AND tm.is_internal = 0'}
      ORDER BY tm.created_at ASC
    `;

    const messages = await db.query<TicketMessage>(messagesSql, [ticketId]);

    return {
      ...ticket,
      messages,
    };
  }

  /**
   * 4. Add a reply or internal note to a ticket
   */
  static async addMessage(
    ticketId: string,
    input: AddMessageInput,
    user: AuthUser
  ): Promise<TicketMessage> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    // Verify ticket existence and tenant authorization
    const ticket = await this.getTicketById(ticketId, user);

    if (!input.message || input.message.trim() === '') {
      throw new BadRequestError('Message body cannot be empty');
    }

    // Franchise users are NEVER allowed to create internal admin notes
    const isInternal = isSuper ? (input.is_internal ? 1 : 0) : 0;

    const id = `tmsg_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO ticket_messages (
        id, ticket_id, user_id, message, is_internal, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, ticketId, user.id, input.message.trim(), isInternal, now]
    );

    // Update ticket updated_at timestamp, and automatically transition 'open' to 'in_progress' if admin replies
    let newStatus = ticket.status;
    if (isSuper && ticket.status === 'open' && !isInternal) {
      newStatus = 'in_progress';
      await db.execute(
        `UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?`,
        [now, ticketId]
      );
    } else {
      await db.execute(`UPDATE tickets SET updated_at = ? WHERE id = ?`, [now, ticketId]);
    }

    // Audit log
    await AuditService.log({
      organizationId: ticket.organization_id,
      userId: user.id,
      action: isInternal ? 'ticket.internal_note_added' : 'ticket.reply_added',
      entityType: 'ticket',
      entityId: ticketId,
      newValues: {
        messageId: id,
        isInternal: Boolean(isInternal),
        ticketStatus: newStatus,
      },
    });

    const msgRows = await db.query<TicketMessage>(
      `SELECT 
        tm.*,
        (u.first_name || ' ' || COALESCE(u.last_name, '')) as author_name,
        u.email as author_email,
        r.code as author_role
      FROM ticket_messages tm
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE tm.id = ?`,
      [id]
    );

    return msgRows[0];
  }

  /**
   * 5. Update ticket status (Open → In Progress → Resolved → Closed)
   */
  static async updateStatus(
    ticketId: string,
    status: TicketStatus,
    user: AuthUser
  ): Promise<Ticket> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const validStatuses: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
    }

    const ticket = await this.getTicketById(ticketId, user);
    const oldStatus = ticket.status;

    // Franchise owners/staff can close their resolved tickets or re-open their closed tickets
    if (!isSuper) {
      if (status !== 'closed' && status !== 'open') {
        throw new ForbiddenError('Franchise partners may only mark tickets as closed or re-open them');
      }
    }

    const now = new Date().toISOString();
    let resolvedAt = ticket.resolved_at;
    let closedAt = ticket.closed_at;

    if (status === 'resolved' && !resolvedAt) {
      resolvedAt = now;
    }
    if (status === 'closed' && !closedAt) {
      closedAt = now;
    }
    if (status === 'open' || status === 'in_progress') {
      closedAt = null;
      if (status === 'open') {
        resolvedAt = null;
      }
    }

    await db.execute(
      `UPDATE tickets 
       SET status = ?, resolved_at = ?, closed_at = ?, updated_at = ? 
       WHERE id = ?`,
      [status, resolvedAt, closedAt, now, ticketId]
    );

    // Audit log
    await AuditService.log({
      organizationId: ticket.organization_id,
      userId: user.id,
      action: 'ticket.status_updated',
      entityType: 'ticket',
      entityId: ticketId,
      oldValues: { status: oldStatus },
      newValues: { status, resolvedAt, closedAt },
    });

    return this.getTicketById(ticketId, user);
  }

  /**
   * 6. Update ticket priority (Super Admin only)
   */
  static async updatePriority(
    ticketId: string,
    priority: TicketPriority,
    user: AuthUser
  ): Promise<Ticket> {
    const isSuper = this.isSuperAdmin(user);
    if (!isSuper) {
      throw new ForbiddenError('Only Super Administrators can change ticket priority');
    }

    const validPriorities: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
      throw new BadRequestError(`Invalid priority '${priority}'. Must be one of: ${validPriorities.join(', ')}`);
    }

    const ticket = await this.getTicketById(ticketId, user);
    const oldPriority = ticket.priority;

    const db = getDatabase();
    const now = new Date().toISOString();

    await db.execute(
      `UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ?`,
      [priority, now, ticketId]
    );

    await AuditService.log({
      organizationId: ticket.organization_id,
      userId: user.id,
      action: 'ticket.priority_updated',
      entityType: 'ticket',
      entityId: ticketId,
      oldValues: { priority: oldPriority },
      newValues: { priority },
    });

    return this.getTicketById(ticketId, user);
  }

  /**
   * 7. Assign ticket to admin/staff (Super Admin only)
   */
  static async assignTicket(
    ticketId: string,
    assignedToUserId: string | null,
    user: AuthUser
  ): Promise<Ticket> {
    const isSuper = this.isSuperAdmin(user);
    if (!isSuper) {
      throw new ForbiddenError('Only Super Administrators can reassign support tickets');
    }

    const db = getDatabase();
    const ticket = await this.getTicketById(ticketId, user);
    const oldAssignee = ticket.assigned_to_user_id;

    if (assignedToUserId) {
      const users = await db.query<any>('SELECT id, first_name, last_name, email FROM users WHERE id = ?', [assignedToUserId]);
      if (users.length === 0) {
        throw new NotFoundError(`User '${assignedToUserId}' not found for assignment`);
      }
    }

    const now = new Date().toISOString();
    await db.execute(
      `UPDATE tickets SET assigned_to_user_id = ?, updated_at = ? WHERE id = ?`,
      [assignedToUserId || null, now, ticketId]
    );

    await AuditService.log({
      organizationId: ticket.organization_id,
      userId: user.id,
      action: 'ticket.assigned',
      entityType: 'ticket',
      entityId: ticketId,
      oldValues: { assignedToUserId: oldAssignee },
      newValues: { assignedToUserId },
    });

    return this.getTicketById(ticketId, user);
  }

  /**
   * 8. Get ticket dashboard statistics
   */
  static async getStats(user: AuthUser, franchiseId?: string): Promise<TicketStats> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (!isSuper) {
      if (!user.organizationId) {
        return { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, urgent: 0 };
      }
      conditions.push('organization_id = ?');
      params.push(user.organizationId);
    } else if (franchiseId && franchiseId !== 'all') {
      conditions.push('organization_id = ?');
      params.push(franchiseId);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) as open_count,
        COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) as in_progress_count,
        COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0) as resolved_count,
        COALESCE(SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END), 0) as closed_count,
        COALESCE(SUM(CASE WHEN priority = 'urgent' AND status IN ('open', 'in_progress') THEN 1 ELSE 0 END), 0) as urgent_count
      FROM tickets
      WHERE ${whereClause}
    `;

    const rows = await db.query<any>(sql, params);
    const row = rows[0] || {};

    return {
      total: Number(row.total || 0),
      open: Number(row.open_count || 0),
      in_progress: Number(row.in_progress_count || 0),
      resolved: Number(row.resolved_count || 0),
      closed: Number(row.closed_count || 0),
      urgent: Number(row.urgent_count || 0),
    };
  }

  /**
   * 9. Get assignable admin users for ticket delegation
   */
  static async getAssignees(): Promise<{ id: string; name: string; email: string; role: string }[]> {
    const db = getDatabase();
    const sql = `
      SELECT DISTINCT 
        u.id, 
        (u.first_name || ' ' || COALESCE(u.last_name, '')) as name, 
        u.email, 
        r.code as role
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.code IN ('super_admin', 'auditor') AND u.status = 'active'
      ORDER BY u.first_name ASC
    `;
    return db.query(sql);
  }
}
