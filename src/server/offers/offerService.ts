import { randomUUID } from 'crypto';
import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { AuthenticatedUser as AuthUser } from '../types/index.js';
import type {
  Offer,
  OfferServiceMapping,
  CreateOfferInput,
  UpdateOfferInput,
  OfferFilters,
} from './types.js';

export class OfferService {
  private static isSuperAdmin(user?: AuthUser): boolean {
    if (!user) return false;
    return user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }

  private static validateDates(startDateStr: string, endDateStr: string): void {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime())) {
      throw new BadRequestError('Invalid start date format. Please use YYYY-MM-DD');
    }
    if (isNaN(end.getTime())) {
      throw new BadRequestError('Invalid end date format. Please use YYYY-MM-DD');
    }

    // Normalizing date strings (YYYY-MM-DD) for direct comparison
    const startIso = startDateStr.split('T')[0];
    const endIso = endDateStr.split('T')[0];

    if (endIso < startIso) {
      throw new BadRequestError('End date must not be earlier than start date');
    }
  }

  /**
   * List offers with filtering:
   * - Super Admin sees all offers or filtered by active status
   * - Franchise users (Owner/Staff) STRICTLY see active offers only
   */
  static async listOffers(
    filters: OfferFilters = {},
    user: AuthUser
  ): Promise<{ offers: Offer[]; total: number }> {
    const db = getDatabase();
    const isAdmin = this.isSuperAdmin(user);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // Non-admin franchise users are strictly restricted to active offers only
    if (!isAdmin) {
      conditions.push('o.is_active = 1');
    } else if (filters.is_active !== undefined) {
      const activeVal =
        filters.is_active === true || filters.is_active === 'true' || String(filters.is_active) === '1'
          ? 1
          : 0;
      conditions.push('o.is_active = ?');
      params.push(activeVal);
    }

    // Filter by applicable service
    if (filters.service_id) {
      conditions.push(
        `EXISTS (SELECT 1 FROM offer_services os WHERE os.offer_id = o.id AND os.service_id = ?)`
      );
      params.push(filters.service_id);
    }

    // Search by title or description
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(`(LOWER(o.title) LIKE ? OR LOWER(COALESCE(o.description, '')) LIKE ?)`);
      params.push(term, term);
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countSql = `SELECT COUNT(*) as cnt FROM offers o WHERE ${whereClause}`;
    const countRes = await db.query<{ cnt: number }>(countSql, params);
    const total = countRes[0]?.cnt || 0;

    // Fetch offers
    const selectSql = `
      SELECT 
        o.id,
        o.title,
        o.description,
        o.start_date,
        o.end_date,
        o.is_active,
        o.created_by_user_id,
        u.first_name || ' ' || u.last_name as created_by_name,
        o.created_at,
        o.updated_at
      FROM offers o
      LEFT JOIN users u ON o.created_by_user_id = u.id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
    `;

    const rawOffers = await db.query<any>(selectSql, params);

    if (rawOffers.length === 0) {
      return { offers: [], total: 0 };
    }

    // Batch load mapped services for the found offers
    const offerIds = rawOffers.map((o: any) => o.id);
    const placeholders = offerIds.map(() => '?').join(',');
    const servicesSql = `
      SELECT 
        os.offer_id,
        os.service_id,
        sm.name as service_name,
        sm.code as service_code,
        sc.name as category_name
      FROM offer_services os
      JOIN service_masters sm ON os.service_id = sm.id
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE os.offer_id IN (${placeholders})
      ORDER BY sm.name ASC
    `;

    const rawServices = await db.query<any>(servicesSql, offerIds);
    const serviceMap = new Map<string, OfferServiceMapping[]>();

    for (const row of rawServices) {
      if (!serviceMap.has(row.offer_id)) {
        serviceMap.set(row.offer_id, []);
      }
      serviceMap.get(row.offer_id)!.push({
        service_id: row.service_id,
        service_name: row.service_name,
        service_code: row.service_code,
        category_name: row.category_name || null,
      });
    }

    const offers: Offer[] = rawOffers.map((o: any) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      start_date: o.start_date,
      end_date: o.end_date,
      is_active: Number(o.is_active),
      created_by_user_id: o.created_by_user_id,
      created_by_name: o.created_by_name || null,
      created_at: o.created_at,
      updated_at: o.updated_at,
      services: serviceMap.get(o.id) || [],
    }));

    return { offers, total };
  }

  /**
   * Get single offer detail by ID
   */
  static async getOfferById(id: string, user: AuthUser): Promise<Offer> {
    const db = getDatabase();
    const isAdmin = this.isSuperAdmin(user);

    const sql = `
      SELECT 
        o.id,
        o.title,
        o.description,
        o.start_date,
        o.end_date,
        o.is_active,
        o.created_by_user_id,
        u.first_name || ' ' || u.last_name as created_by_name,
        o.created_at,
        o.updated_at
      FROM offers o
      LEFT JOIN users u ON o.created_by_user_id = u.id
      WHERE o.id = ?
    `;

    const rows = await db.query<any>(sql, [id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundError(`Offer with ID '${id}' not found`);
    }

    const offerRow = rows[0];

    // Franchise users cannot view inactive offers
    if (!isAdmin && Number(offerRow.is_active) !== 1) {
      throw new NotFoundError(`Offer with ID '${id}' is not available or inactive`);
    }

    // Fetch mapped services
    const servicesSql = `
      SELECT 
        os.service_id,
        sm.name as service_name,
        sm.code as service_code,
        sc.name as category_name
      FROM offer_services os
      JOIN service_masters sm ON os.service_id = sm.id
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE os.offer_id = ?
      ORDER BY sm.name ASC
    `;

    const services = await db.query<OfferServiceMapping>(servicesSql, [id]);

    return {
      id: offerRow.id,
      title: offerRow.title,
      description: offerRow.description,
      start_date: offerRow.start_date,
      end_date: offerRow.end_date,
      is_active: Number(offerRow.is_active),
      created_by_user_id: offerRow.created_by_user_id,
      created_by_name: offerRow.created_by_name || null,
      created_at: offerRow.created_at,
      updated_at: offerRow.updated_at,
      services: services || [],
    };
  }

  /**
   * Create new offer (Super Admin only)
   */
  static async createOffer(input: CreateOfferInput, user: AuthUser): Promise<Offer> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can create offers');
    }

    const title = input.title?.trim();
    if (!title || title.length < 3) {
      throw new BadRequestError('Offer title must be at least 3 characters long');
    }

    if (!input.service_ids || !Array.isArray(input.service_ids) || input.service_ids.length === 0) {
      throw new BadRequestError('At least one applicable service must be selected');
    }

    // Validate dates
    this.validateDates(input.start_date, input.end_date);

    const db = getDatabase();

    // Verify all service_ids exist
    const placeholders = input.service_ids.map(() => '?').join(',');
    const checkServices = await db.query<{ id: string }>(
      `SELECT id FROM service_masters WHERE id IN (${placeholders})`,
      input.service_ids
    );
    if (checkServices.length !== input.service_ids.length) {
      throw new BadRequestError('One or more selected services do not exist in the catalog');
    }

    const offerId = `ofr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : 1;
    const desc = input.description?.trim() || null;
    const startDate = input.start_date.split('T')[0];
    const endDate = input.end_date.split('T')[0];

    // Insert offer
    await db.execute(
      `INSERT INTO offers (
        id, title, description, start_date, end_date, is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [offerId, title, desc, startDate, endDate, isActive, user.id]
    );

    // Insert service mappings
    for (const serviceId of input.service_ids) {
      const mappingId = `os_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
      await db.execute(
        `INSERT INTO offer_services (id, offer_id, service_id) VALUES (?, ?, ?)`,
        [mappingId, offerId, serviceId]
      );
    }

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'OFFER_CREATED',
      entityType: 'OFFER',
      entityId: offerId,
      newValues: {
        title,
        start_date: startDate,
        end_date: endDate,
        is_active: isActive,
        services: input.service_ids,
      },
    });

    return this.getOfferById(offerId, user);
  }

  /**
   * Edit offer (Super Admin only)
   */
  static async updateOffer(id: string, input: UpdateOfferInput, user: AuthUser): Promise<Offer> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can update offers');
    }

    const existing = await this.getOfferById(id, user);
    const db = getDatabase();

    const newStartDate = input.start_date ? input.start_date.split('T')[0] : existing.start_date;
    const newEndDate = input.end_date ? input.end_date.split('T')[0] : existing.end_date;

    if (input.start_date || input.end_date) {
      this.validateDates(newStartDate, newEndDate);
    }

    const newTitle = input.title !== undefined ? input.title.trim() : existing.title;
    if (newTitle.length < 3) {
      throw new BadRequestError('Offer title must be at least 3 characters long');
    }

    const newDesc = input.description !== undefined ? input.description?.trim() || null : existing.description;
    const newIsActive =
      input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active;

    await db.execute(
      `UPDATE offers 
       SET title = ?, description = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newTitle, newDesc, newStartDate, newEndDate, newIsActive, id]
    );

    // Update service mappings if provided
    if (input.service_ids !== undefined) {
      if (!Array.isArray(input.service_ids) || input.service_ids.length === 0) {
        throw new BadRequestError('At least one applicable service must be selected');
      }

      // Verify services exist
      const placeholders = input.service_ids.map(() => '?').join(',');
      const checkServices = await db.query<{ id: string }>(
        `SELECT id FROM service_masters WHERE id IN (${placeholders})`,
        input.service_ids
      );
      if (checkServices.length !== input.service_ids.length) {
        throw new BadRequestError('One or more selected services do not exist in the catalog');
      }

      // Clear previous mappings
      await db.execute(`DELETE FROM offer_services WHERE offer_id = ?`, [id]);

      // Insert new mappings
      for (const serviceId of input.service_ids) {
        const mappingId = `os_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
        await db.execute(
          `INSERT INTO offer_services (id, offer_id, service_id) VALUES (?, ?, ?)`,
          [mappingId, id, serviceId]
        );
      }
    }

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'OFFER_UPDATED',
      entityType: 'OFFER',
      entityId: id,
      oldValues: {
        title: existing.title,
        start_date: existing.start_date,
        end_date: existing.end_date,
        is_active: existing.is_active,
        services: existing.services.map((s) => s.service_id),
      },
      newValues: {
        title: newTitle,
        start_date: newStartDate,
        end_date: newEndDate,
        is_active: newIsActive,
        services: input.service_ids || existing.services.map((s) => s.service_id),
      },
    });

    return this.getOfferById(id, user);
  }

  /**
   * Activate / Deactivate offer (Super Admin only)
   */
  static async setOfferStatus(id: string, isActive: boolean, user: AuthUser): Promise<Offer> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can change offer status');
    }

    const existing = await this.getOfferById(id, user);
    const db = getDatabase();
    const activeVal = isActive ? 1 : 0;

    await db.execute(
      `UPDATE offers SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [activeVal, id]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: isActive ? 'OFFER_ACTIVATED' : 'OFFER_DEACTIVATED',
      entityType: 'OFFER',
      entityId: id,
      oldValues: { is_active: existing.is_active },
      newValues: { is_active: activeVal },
    });

    return this.getOfferById(id, user);
  }
}

