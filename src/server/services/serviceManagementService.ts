import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  NotFoundError,
  ConflictError,
} from '../errors/AppError.js';
import type {
  ServiceCategoryModel,
  ServiceMasterModel,
  ServiceMasterDetail,
  RequiredDocumentItem,
} from './types.js';

export interface CreateServiceCategoryDto {
  code: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateServiceCategoryDto {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface CreateServiceMasterDto {
  categoryId: string;
  code: string;
  name: string;
  description?: string | null;

  // Single service fee
  serviceFee: number;

  // Single configurable commission value
  commissionValue?: number;
  commissionNotes?: string | null;

  // Required documents
  requiredDocuments?: RequiredDocumentItem[];

  // Timeline / Processing
  turnaroundDays?: number;
  slaHours?: number;
  timelineDescription?: string | null;

  // Status
  isActive?: boolean;
}

export interface UpdateServiceMasterDto {
  categoryId?: string;
  name?: string;
  description?: string | null;

  // Single service fee
  serviceFee?: number;

  // Single configurable commission value
  commissionValue?: number;
  commissionNotes?: string | null;

  // Required documents
  requiredDocuments?: RequiredDocumentItem[];

  // Timeline / Processing
  turnaroundDays?: number;
  slaHours?: number;
  timelineDescription?: string | null;

  // Status
  isActive?: boolean;
}

export class ServiceManagementService {
  /**
   * Normalize database record into detail model
   */
  private static mapToDetail(row: ServiceMasterModel & { category_name?: string; category_code?: string }): ServiceMasterDetail {
    let parsedDocs: RequiredDocumentItem[] = [];
    try {
      parsedDocs = JSON.parse(row.required_documents || '[]');
    } catch {
      parsedDocs = [];
    }

    return {
      id: row.id,
      category_id: row.category_id,
      code: row.code,
      name: row.name,
      description: row.description,
      service_fee: Number(row.service_fee),
      commission_value: Number(row.commission_value),
      commission_notes: row.commission_notes,
      required_documents: parsedDocs,
      turnaround_days: Number(row.turnaround_days),
      sla_hours: Number(row.sla_hours),
      timeline_description: row.timeline_description,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at,
      category_name: row.category_name,
      category_code: row.category_code,
    };
  }

  // ==========================================
  // SERVICE CATEGORY METHODS (Super Admin editable)
  // ==========================================

  static async listCategories(includeInactive = false): Promise<ServiceCategoryModel[]> {
    const db = getDatabase();
    let sql = `SELECT * FROM service_categories`;
    const params: unknown[] = [];

    if (!includeInactive) {
      sql += ` WHERE is_active = ${db.getDialect() === 'sqlite' ? '1' : 'TRUE'}`;
    }

    sql += ` ORDER BY display_order ASC, name ASC`;
    const rows = await db.query<ServiceCategoryModel>(sql, params);
    return rows.map((r) => ({
      ...r,
      is_active: Boolean(r.is_active),
    }));
  }

  static async getCategoryById(id: string): Promise<ServiceCategoryModel | null> {
    const db = getDatabase();
    const rows = await db.query<ServiceCategoryModel>(
      `SELECT * FROM service_categories WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) return null;
    return {
      ...rows[0],
      is_active: Boolean(rows[0].is_active),
    };
  }

  static async createCategory(
    dto: CreateServiceCategoryDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ServiceCategoryModel> {
    const db = getDatabase();
    const code = dto.code.trim().toUpperCase();

    const existing = await db.query<any>(
      `SELECT id FROM service_categories WHERE code = ? LIMIT 1`,
      [code]
    );
    if (existing.length > 0) {
      throw new ConflictError(`Service category code '${code}' already exists`);
    }

    const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isActive = dto.isActive !== undefined ? dto.isActive : true;
    const isSqlite = db.getDialect() === 'sqlite';

    await db.execute(
      `INSERT INTO service_categories (
        id, code, name, description, display_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        code,
        dto.name.trim(),
        dto.description || null,
        dto.displayOrder || 0,
        isSqlite ? (isActive ? 1 : 0) : isActive,
      ]
    );

    await AuditService.log({
      userId: context?.userId,
      action: 'SERVICE_CATEGORY_CREATED',
      entityType: 'service_category',
      entityId: id,
      newValues: { code, name: dto.name, isActive },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return (await this.getCategoryById(id))!;
  }

  static async updateCategory(
    id: string,
    dto: UpdateServiceCategoryDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ServiceCategoryModel> {
    const db = getDatabase();
    const existing = await this.getCategoryById(id);
    if (!existing) {
      throw new NotFoundError('Service category not found');
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const isSqlite = db.getDialect() === 'sqlite';

    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name.trim());
    }
    if (dto.description !== undefined) {
      updates.push('description = ?');
      params.push(dto.description);
    }
    if (dto.displayOrder !== undefined) {
      updates.push('display_order = ?');
      params.push(dto.displayOrder);
    }
    if (dto.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isSqlite ? (dto.isActive ? 1 : 0) : dto.isActive);
    }

    if (updates.length > 0) {
      updates.push(
        `updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`
      );
      params.push(id);

      await db.execute(
        `UPDATE service_categories SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      await AuditService.log({
        userId: context?.userId,
        action: 'SERVICE_CATEGORY_UPDATED',
        entityType: 'service_category',
        entityId: id,
        oldValues: { name: existing.name, isActive: existing.is_active },
        newValues: dto as Record<string, unknown>,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    }

    return (await this.getCategoryById(id))!;
  }

  // ==========================================
  // SERVICE MASTER METHODS
  // ==========================================

  static async listServices(filter?: {
    categoryId?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<ServiceMasterDetail[]> {
    const db = getDatabase();
    let sql = `
      SELECT s.*, c.name as category_name, c.code as category_code
      FROM service_masters s
      JOIN service_categories c ON s.category_id = c.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filter?.categoryId) {
      sql += ` AND s.category_id = ?`;
      params.push(filter.categoryId);
    }

    if (filter?.isActive !== undefined) {
      sql += ` AND s.is_active = ?`;
      params.push(db.getDialect() === 'sqlite' ? (filter.isActive ? 1 : 0) : filter.isActive);
    }

    if (filter?.search) {
      sql += ` AND (LOWER(s.name) LIKE ? OR LOWER(s.code) LIKE ?)`;
      const term = `%${filter.search.toLowerCase()}%`;
      params.push(term, term);
    }

    sql += ` ORDER BY s.name ASC`;
    const rows = await db.query<ServiceMasterModel & { category_name?: string; category_code?: string }>(sql, params);
    return rows.map((r) => this.mapToDetail(r));
  }

  static async getServiceById(id: string): Promise<ServiceMasterDetail | null> {
    const db = getDatabase();
    const rows = await db.query<ServiceMasterModel & { category_name?: string; category_code?: string }>(
      `SELECT s.*, c.name as category_name, c.code as category_code
       FROM service_masters s
       JOIN service_categories c ON s.category_id = c.id
       WHERE s.id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapToDetail(rows[0]);
  }

  static async getServiceByCode(code: string): Promise<ServiceMasterDetail | null> {
    const db = getDatabase();
    const rows = await db.query<ServiceMasterModel & { category_name?: string; category_code?: string }>(
      `SELECT s.*, c.name as category_name, c.code as category_code
       FROM service_masters s
       JOIN service_categories c ON s.category_id = c.id
       WHERE UPPER(s.code) = UPPER(?) LIMIT 1`,
      [code.trim()]
    );
    if (rows.length === 0) return null;
    return this.mapToDetail(rows[0]);
  }

  static async createService(
    dto: CreateServiceMasterDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ServiceMasterDetail> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Verify category exists
    const category = await this.getCategoryById(dto.categoryId);
    if (!category) {
      throw new NotFoundError(`Service category with ID '${dto.categoryId}' not found`);
    }

    // 2. Check code uniqueness
    const code = dto.code.trim().toUpperCase();
    const existing = await this.getServiceByCode(code);
    if (existing) {
      throw new ConflictError(`Service code '${code}' is already in use`);
    }

    // 3. Service fee & configurable commission value
    const serviceFee = Number(dto.serviceFee) || 0;
    const commissionValue = Number(dto.commissionValue) || 0;

    // 4. Serialize Required Documents
    const requiredDocs = dto.requiredDocuments || [];
    const requiredDocsJson = JSON.stringify(requiredDocs);

    const id = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    await db.execute(
      `INSERT INTO service_masters (
        id, category_id, code, name, description,
        service_fee, commission_value, commission_notes,
        required_documents, turnaround_days, sla_hours, timeline_description,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.categoryId,
        code,
        dto.name.trim(),
        dto.description || null,
        serviceFee,
        commissionValue,
        dto.commissionNotes || null,
        requiredDocsJson,
        dto.turnaroundDays || 3,
        dto.slaHours || 72,
        dto.timelineDescription || null,
        isSqlite ? (isActive ? 1 : 0) : isActive,
      ]
    );

    await AuditService.log({
      userId: context?.userId,
      action: 'SERVICE_MASTER_CREATED',
      entityType: 'service_master',
      entityId: id,
      newValues: {
        code,
        name: dto.name,
        categoryId: dto.categoryId,
        serviceFee,
        commissionValue,
        isActive,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return (await this.getServiceById(id))!;
  }

  static async updateService(
    id: string,
    dto: UpdateServiceMasterDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ServiceMasterDetail> {
    const db = getDatabase();
    const existing = await this.getServiceById(id);
    if (!existing) {
      throw new NotFoundError('Service master not found');
    }

    const isSqlite = db.getDialect() === 'sqlite';
    const updates: string[] = [];
    const params: unknown[] = [];

    // Verify category if changed
    if (dto.categoryId && dto.categoryId !== existing.category_id) {
      const cat = await this.getCategoryById(dto.categoryId);
      if (!cat) throw new NotFoundError('Target service category not found');
      updates.push('category_id = ?');
      params.push(dto.categoryId);
    }

    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name.trim());
    }

    if (dto.description !== undefined) {
      updates.push('description = ?');
      params.push(dto.description);
    }

    if (dto.serviceFee !== undefined) {
      updates.push('service_fee = ?');
      params.push(Number(dto.serviceFee));
    }

    if (dto.commissionValue !== undefined) {
      updates.push('commission_value = ?');
      params.push(Number(dto.commissionValue));
    }

    if (dto.commissionNotes !== undefined) {
      updates.push('commission_notes = ?');
      params.push(dto.commissionNotes);
    }

    if (dto.requiredDocuments !== undefined) {
      updates.push('required_documents = ?');
      params.push(JSON.stringify(dto.requiredDocuments));
    }

    if (dto.turnaroundDays !== undefined) {
      updates.push('turnaround_days = ?');
      params.push(Number(dto.turnaroundDays));
    }

    if (dto.slaHours !== undefined) {
      updates.push('sla_hours = ?');
      params.push(Number(dto.slaHours));
    }

    if (dto.timelineDescription !== undefined) {
      updates.push('timeline_description = ?');
      params.push(dto.timelineDescription);
    }

    if (dto.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isSqlite ? (dto.isActive ? 1 : 0) : dto.isActive);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`);
      params.push(id);

      await db.execute(
        `UPDATE service_masters SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      await AuditService.log({
        userId: context?.userId,
        action: 'SERVICE_MASTER_UPDATED',
        entityType: 'service_master',
        entityId: id,
        oldValues: {
          name: existing.name,
          serviceFee: existing.service_fee,
          commissionValue: existing.commission_value,
          isActive: existing.is_active,
        },
        newValues: dto as Record<string, unknown>,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    }

    return (await this.getServiceById(id))!;
  }

  /**
   * Safe status toggle: Deactivate or Activate (no permanent deletion)
   */
  static async setServiceStatus(
    id: string,
    isActive: boolean,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ServiceMasterDetail> {
    return this.updateService(id, { isActive }, context);
  }
}
