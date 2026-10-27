import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from '../errors/AppError.js';
import {
  CLIENT_STATUS,
  CLIENT_SOURCE,
  type ClientModel,
  type ClientWithDetails,
  type CreateClientDto,
  type UpdateClientDto,
  type ClientFilterQuery,
  type ClientDetailResponse,
  type LinkedLeadItem,
} from './types.js';

export class ClientService {
  /**
   * Create a new client profile linked to a franchise organization.
   * Enforces tenant isolation: Franchise users can only create clients for their own franchise.
   */
  static async createClient(
    dto: CreateClientDto,
    context: {
      userId?: string;
      franchiseId?: string;
      isSuperAdmin?: boolean;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<ClientModel> {
    const db = getDatabase();

    // 1. Determine target franchise ID with tenant isolation
    let targetFranchiseId = context.franchiseId;

    if (context.isSuperAdmin) {
      targetFranchiseId = dto.franchiseId || context.franchiseId;
    } else {
      if (!context.franchiseId) {
        throw new BadRequestError('Franchise association required to create a client profile');
      }
      if (dto.franchiseId && dto.franchiseId !== context.franchiseId) {
        throw new ForbiddenError('Access denied: Cannot create a client profile for another franchise');
      }
    }

    if (!targetFranchiseId) {
      throw new BadRequestError('Franchise organization ID is required');
    }

    // 2. Verify target franchise exists and is of type 'franchise'
    const orgs = await db.query<any>(
      `SELECT id, name FROM organizations WHERE id = ? AND type = 'franchise' LIMIT 1`,
      [targetFranchiseId]
    );
    if (orgs.length === 0) {
      throw new NotFoundError('Franchise organization not found');
    }

    // 3. Normalize input values
    const firstName = dto.firstName.trim();
    const lastName = (dto.lastName || '').trim();
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const phone = dto.phone.trim();
    const email = dto.email ? dto.email.trim().toLowerCase() : null;

    if (!firstName) {
      throw new BadRequestError('First name is required');
    }
    if (!phone) {
      throw new BadRequestError('Primary phone number is required');
    }

    // 4. Duplicate prevention within franchise
    const existing = await db.query<any>(
      `SELECT id, client_number, full_name FROM clients WHERE franchise_id = ? AND phone = ? LIMIT 1`,
      [targetFranchiseId, phone]
    );
    if (existing.length > 0) {
      throw new ConflictError(
        `A client profile with phone ${phone} already exists in this franchise (${existing[0].client_number} - ${existing[0].full_name})`
      );
    }

    // 5. Verify initial lead if provided
    let verifiedLeadId: string | null = null;
    if (dto.initialLeadId) {
      const leadRows = await db.query<any>(
        `SELECT id, lead_number, customer_name, assigned_franchise_id FROM leads WHERE id = ? LIMIT 1`,
        [dto.initialLeadId]
      );
      if (leadRows.length === 0) {
        throw new NotFoundError('Specified initial lead does not exist');
      }
      if (!context.isSuperAdmin && leadRows[0].assigned_franchise_id !== targetFranchiseId) {
        throw new ForbiddenError('Specified lead is not assigned to this franchise organization');
      }
      verifiedLeadId = leadRows[0].id;
    }

    // 6. Generate client ID and human-friendly client number
    const clientId = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const clientNumber = `CLI-${Date.now().toString().slice(-6)}-${randomSuffix}`;
    const now = new Date().toISOString();

    const tagsJson = Array.isArray(dto.tags)
      ? JSON.stringify(dto.tags)
      : typeof dto.tags === 'string'
      ? dto.tags
      : null;

    let validUserId: string | null = null;
    if (context.userId) {
      const userExists = await db.query<any>(`SELECT id FROM users WHERE id = ? LIMIT 1`, [context.userId]);
      if (userExists.length > 0) {
        validUserId = context.userId;
      }
    }

    // 7. Insert client record
    await db.execute(
      `INSERT INTO clients (
        id, client_number, franchise_id, first_name, last_name, full_name,
        email, phone, alternate_phone, business_name, pan, gstin,
        city, district, state, pin, address, status, source,
        initial_lead_id, notes, tags, created_by_user_id, updated_by_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        clientNumber,
        targetFranchiseId,
        firstName,
        lastName,
        fullName,
        email,
        phone,
        dto.alternatePhone?.trim() || null,
        dto.businessName?.trim() || null,
        dto.pan?.trim()?.toUpperCase() || null,
        dto.gstin?.trim()?.toUpperCase() || null,
        dto.city.trim(),
        dto.district.trim(),
        dto.state.trim(),
        dto.pin?.trim() || null,
        dto.address?.trim() || null,
        CLIENT_STATUS.ACTIVE,
        dto.source || (verifiedLeadId ? CLIENT_SOURCE.LEAD : CLIENT_SOURCE.DIRECT),
        verifiedLeadId,
        dto.notes || null,
        tagsJson,
        validUserId,
        validUserId,
        now,
        now,
      ]
    );

    // 8. Link initial lead if explicitly specified
    if (verifiedLeadId) {
      await db.execute(`UPDATE leads SET client_id = ? WHERE id = ?`, [clientId, verifiedLeadId]);
    }

    // 9. Record audit entry
    await AuditService.log({
      organizationId: targetFranchiseId,
      userId: validUserId,
      action: 'client_created',
      entityType: 'client',
      entityId: clientId,
      newValues: {
        clientNumber,
        fullName,
        phone,
        email,
        city: dto.city,
        state: dto.state,
        initialLeadId: verifiedLeadId,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const created = await this.getRawClientById(clientId);
    return created!;
  }

  /**
   * Update an existing client profile with tenant isolation
   */
  static async updateClient(
    id: string,
    dto: UpdateClientDto,
    context: {
      userId?: string;
      franchiseId?: string;
      isSuperAdmin?: boolean;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<ClientModel> {
    const db = getDatabase();
    const existing = await this.getRawClientById(id);
    if (!existing) {
      throw new NotFoundError('Client not found');
    }

    // Tenant isolation
    if (!context.isSuperAdmin && existing.franchise_id !== context.franchiseId) {
      throw new ForbiddenError('Access denied: Client belongs to another franchise organization');
    }

    // Check duplicate phone if phone is being modified
    if (dto.phone && dto.phone.trim() !== existing.phone) {
      const dup = await db.query<any>(
        `SELECT id, client_number FROM clients WHERE franchise_id = ? AND phone = ? AND id != ? LIMIT 1`,
        [existing.franchise_id, dto.phone.trim(), id]
      );
      if (dup.length > 0) {
        throw new ConflictError(
          `Another client with phone ${dto.phone.trim()} already exists in this franchise (${dup[0].client_number})`
        );
      }
    }

    const firstName = dto.firstName !== undefined ? dto.firstName.trim() : existing.first_name;
    const lastName = dto.lastName !== undefined ? dto.lastName.trim() : existing.last_name;
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const now = new Date().toISOString();

    const tagsJson =
      dto.tags !== undefined
        ? Array.isArray(dto.tags)
          ? JSON.stringify(dto.tags)
          : dto.tags
        : existing.tags;

    let validUserId: string | null = null;
    if (context.userId) {
      const userExists = await db.query<any>(`SELECT id FROM users WHERE id = ? LIMIT 1`, [context.userId]);
      if (userExists.length > 0) {
        validUserId = context.userId;
      }
    }

    await db.execute(
      `UPDATE clients SET
        first_name = ?,
        last_name = ?,
        full_name = ?,
        email = ?,
        phone = ?,
        alternate_phone = ?,
        business_name = ?,
        pan = ?,
        gstin = ?,
        city = ?,
        district = ?,
        state = ?,
        pin = ?,
        address = ?,
        status = ?,
        notes = ?,
        tags = ?,
        updated_by_user_id = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        firstName,
        lastName,
        fullName,
        dto.email !== undefined ? (dto.email ? dto.email.trim().toLowerCase() : null) : existing.email,
        dto.phone !== undefined ? dto.phone.trim() : existing.phone,
        dto.alternatePhone !== undefined ? (dto.alternatePhone ? dto.alternatePhone.trim() : null) : existing.alternate_phone,
        dto.businessName !== undefined ? (dto.businessName ? dto.businessName.trim() : null) : existing.business_name,
        dto.pan !== undefined ? (dto.pan ? dto.pan.trim().toUpperCase() : null) : existing.pan,
        dto.gstin !== undefined ? (dto.gstin ? dto.gstin.trim().toUpperCase() : null) : existing.gstin,
        dto.city !== undefined ? dto.city.trim() : existing.city,
        dto.district !== undefined ? dto.district.trim() : existing.district,
        dto.state !== undefined ? dto.state.trim() : existing.state,
        dto.pin !== undefined ? (dto.pin ? dto.pin.trim() : null) : existing.pin,
        dto.address !== undefined ? (dto.address ? dto.address.trim() : null) : existing.address,
        dto.status !== undefined ? dto.status : existing.status,
        dto.notes !== undefined ? dto.notes : existing.notes,
        tagsJson,
        validUserId,
        now,
        id,
      ]
    );

    // Audit log
    await AuditService.log({
      organizationId: existing.franchise_id,
      userId: validUserId,
      action: 'client_updated',
      entityType: 'client',
      entityId: id,
      oldValues: {
        fullName: existing.full_name,
        phone: existing.phone,
        email: existing.email,
        status: existing.status,
      },
      newValues: {
        fullName,
        phone: dto.phone !== undefined ? dto.phone.trim() : existing.phone,
        email: dto.email,
        status: dto.status,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const updated = await this.getRawClientById(id);
    return updated!;
  }

  /**
   * Retrieve single client with franchise profile details and full linked leads/services history
   */
  static async getClientById(
    id: string,
    context: { franchiseId?: string; isSuperAdmin?: boolean }
  ): Promise<ClientDetailResponse> {
    const db = getDatabase();

    const rows = await db.query<any>(
      `SELECT 
        c.*,
        o.name as franchise_name,
        fp.franchise_code,
        init_lead.lead_number as initial_lead_number,
        s_init.name as initial_service_name
       FROM clients c
       LEFT JOIN organizations o ON c.franchise_id = o.id
       LEFT JOIN franchise_profiles fp ON c.franchise_id = fp.organization_id
       LEFT JOIN leads init_lead ON c.initial_lead_id = init_lead.id
       LEFT JOIN service_masters s_init ON init_lead.service_id = s_init.id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundError('Client profile not found');
    }

    const clientRow = rows[0];

    // Enforce tenant isolation
    if (!context.isSuperAdmin && clientRow.franchise_id !== context.franchiseId) {
      throw new ForbiddenError('Access denied: Client belongs to another franchise organization');
    }

    // Query linked leads & services
    const linkedLeads = await db.query<LinkedLeadItem>(
      `SELECT 
        l.id,
        l.lead_number,
        l.customer_name,
        l.customer_phone,
        l.customer_email,
        l.service_id,
        s.name as service_name,
        s.code as service_code,
        s.service_fee,
        s.commission_value,
        l.city,
        l.district,
        l.state,
        l.status,
        l.assigned_franchise_id,
        l.assigned_at,
        l.created_at
       FROM leads l
       LEFT JOIN service_masters s ON l.service_id = s.id
       WHERE l.client_id = ?
       ORDER BY l.created_at DESC`,
      [id]
    );

    const clientDetails: ClientWithDetails = {
      ...clientRow,
      leads_count: linkedLeads.length,
      latest_lead_at: linkedLeads[0]?.created_at || null,
    };

    return {
      client: clientDetails,
      linkedLeads,
    };
  }

  /**
   * List and search clients with tenant isolation, search, filtering, and pagination.
   */
  static async listClients(
    filter: ClientFilterQuery,
    context: { franchiseId?: string; isSuperAdmin?: boolean }
  ): Promise<{
    clients: ClientWithDetails[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const db = getDatabase();

    // Determine target franchise filter
    let effectiveFranchiseId: string | undefined = undefined;

    if (!context.isSuperAdmin) {
      if (!context.franchiseId) {
        throw new ForbiddenError('Franchise association required to view client directory');
      }
      effectiveFranchiseId = context.franchiseId;
    } else {
      effectiveFranchiseId = filter.franchiseId || undefined;
    }

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (effectiveFranchiseId) {
      conditions.push('c.franchise_id = ?');
      params.push(effectiveFranchiseId);
    }

    if (filter.status) {
      conditions.push('c.status = ?');
      params.push(filter.status);
    }

    if (filter.source) {
      conditions.push('c.source = ?');
      params.push(filter.source);
    }

    if (filter.city) {
      conditions.push('LOWER(c.city) = LOWER(?)');
      params.push(filter.city.trim());
    }

    if (filter.district) {
      conditions.push('LOWER(c.district) = LOWER(?)');
      params.push(filter.district.trim());
    }

    if (filter.state) {
      conditions.push('LOWER(c.state) = LOWER(?)');
      params.push(filter.state.trim());
    }

    if (filter.search) {
      const s = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(
        `(LOWER(c.full_name) LIKE ? OR c.phone LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.client_number) LIKE ? OR LOWER(c.business_name) LIKE ? OR c.pan LIKE ? OR c.gstin LIKE ?)`
      );
      params.push(s, s, s, s, s, s, s);
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countRows = await db.query<any>(
      `SELECT COUNT(*) as total FROM clients c WHERE ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
    const offset = Math.max(filter.offset || 0, 0);

    // List query with lead counts and franchise details
    const rows = await db.query<any>(
      `SELECT 
        c.*,
        o.name as franchise_name,
        fp.franchise_code,
        (
          SELECT COUNT(*) 
          FROM leads l 
          WHERE l.client_id = c.id
        ) as leads_count,
        (
          SELECT MAX(l.created_at) 
          FROM leads l 
          WHERE l.client_id = c.id
        ) as latest_lead_at
       FROM clients c
       LEFT JOIN organizations o ON c.franchise_id = o.id
       LEFT JOIN franchise_profiles fp ON c.franchise_id = fp.organization_id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const clients: ClientWithDetails[] = rows.map((r) => ({
      ...r,
      leads_count: Number(r.leads_count || 0),
    }));

    return {
      clients,
      total,
      limit,
      offset,
    };
  }

  /**
   * Explicitly link an assigned lead to a client profile
   */
  static async linkLeadToClient(
    clientId: string,
    leadId: string,
    context: {
      userId?: string;
      franchiseId?: string;
      isSuperAdmin?: boolean;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    const db = getDatabase();
    const client = await this.getRawClientById(clientId);
    if (!client) {
      throw new NotFoundError('Client profile not found');
    }

    // Tenant isolation on client
    if (!context.isSuperAdmin && client.franchise_id !== context.franchiseId) {
      throw new ForbiddenError('Access denied: Client belongs to another franchise organization');
    }

    // Verify lead
    const leadRows = await db.query<any>(
      `SELECT id, lead_number, assigned_franchise_id FROM leads WHERE id = ? LIMIT 1`,
      [leadId]
    );
    if (leadRows.length === 0) {
      throw new NotFoundError('Lead not found');
    }

    const lead = leadRows[0];
    if (!context.isSuperAdmin && lead.assigned_franchise_id !== client.franchise_id) {
      throw new ForbiddenError('Lead is not assigned to this client’s franchise organization');
    }

    await db.execute(`UPDATE leads SET client_id = ? WHERE id = ?`, [clientId, leadId]);

    let validUserId: string | null = null;
    if (context.userId) {
      const userExists = await db.query<any>(`SELECT id FROM users WHERE id = ? LIMIT 1`, [context.userId]);
      if (userExists.length > 0) {
        validUserId = context.userId;
      }
    }

    // Audit log
    await AuditService.log({
      organizationId: client.franchise_id,
      userId: validUserId,
      action: 'client_lead_linked',
      entityType: 'client',
      entityId: clientId,
      newValues: {
        leadId,
        leadNumber: lead.lead_number,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      success: true,
      message: `Lead ${lead.lead_number} successfully linked to client ${client.client_number}`,
    };
  }

  /**
   * Summary metrics for client directory
   */
  static async getClientStats(
    franchiseId?: string,
    isSuperAdmin?: boolean
  ): Promise<{
    totalClients: number;
    activeClients: number;
    clientsWithLeads: number;
    newClientsThisMonth: number;
  }> {
    const db = getDatabase();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (franchiseId && !isSuperAdmin) {
      conditions.push('c.franchise_id = ?');
      params.push(franchiseId);
    } else if (franchiseId && isSuperAdmin) {
      conditions.push('c.franchise_id = ?');
      params.push(franchiseId);
    }

    const whereClause = conditions.join(' AND ');

    const totalRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM clients c WHERE ${whereClause}`,
      params
    );
    const activeRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM clients c WHERE ${whereClause} AND c.status = 'active'`,
      params
    );

    const withLeadsRows = await db.query<any>(
      `SELECT COUNT(DISTINCT c.id) as cnt
       FROM clients c
       JOIN leads l ON l.client_id = c.id
       WHERE ${whereClause}`,
      params
    );

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM clients c WHERE ${whereClause} AND c.created_at >= ?`,
      [...params, startOfMonth.toISOString()]
    );

    return {
      totalClients: Number(totalRows[0]?.cnt || 0),
      activeClients: Number(activeRows[0]?.cnt || 0),
      clientsWithLeads: Number(withLeadsRows[0]?.cnt || 0),
      newClientsThisMonth: Number(thisMonthRows[0]?.cnt || 0),
    };
  }

  private static async getRawClientById(id: string): Promise<ClientModel | null> {
    const db = getDatabase();
    const rows = await db.query<ClientModel>(`SELECT * FROM clients WHERE id = ? LIMIT 1`, [id]);
    return rows[0] || null;
  }
}
