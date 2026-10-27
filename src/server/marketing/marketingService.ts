import { randomUUID } from 'crypto';
import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { AuthenticatedUser as AuthUser } from '../types/index.js';
import type {
  MarketingMaterial,
  MarketingMaterialServiceMapping,
  CreateMarketingMaterialInput,
  UpdateMarketingMaterialInput,
  MarketingMaterialFilters,
} from './types.js';

export class MarketingService {
  /**
   * Helper to verify if user has Super Admin role
   */
  private static isSuperAdmin(user: AuthUser): boolean {
    return user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }

  /**
   * List marketing materials with filtering & role-based visibility
   * - Franchise Owner & Staff: Only published, non-archived materials (is_published = 1, is_archived = 0)
   * - Super Admin: Can view all, or filter by is_published and is_archived
   */
  static async listMaterials(
    filters: MarketingMaterialFilters,
    user: AuthUser
  ): Promise<{ materials: MarketingMaterial[]; total: number }> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = [];
    const params: any[] = [];

    // RBAC & Published status enforcement
    if (!isSuper) {
      // Franchise portal can strictly only access published and non-archived collateral
      conditions.push('m.is_published = 1');
      conditions.push('m.is_archived = 0');
    } else {
      // Super Admin custom filters
      if (filters.is_published !== undefined) {
        const pubVal =
          filters.is_published === true || filters.is_published === 'true' || String(filters.is_published) === '1'
            ? 1
            : 0;
        conditions.push('m.is_published = ?');
        params.push(pubVal);
      }
      if (filters.is_archived !== undefined) {
        const archVal =
          filters.is_archived === true || filters.is_archived === 'true' || String(filters.is_archived) === '1'
            ? 1
            : 0;
        conditions.push('m.is_archived = ?');
        params.push(archVal);
      } else {
        // By default, hide archived items from standard admin view unless explicitly filtered
        conditions.push('m.is_archived = 0');
      }
    }

    // Material type filter
    if (filters.material_type && filters.material_type !== 'all') {
      conditions.push('m.material_type = ?');
      params.push(filters.material_type);
    }

    // Search query filter (matches title and description)
    if (filters.search && filters.search.trim().length > 0) {
      const searchTerm = `%${filters.search.trim()}%`;
      conditions.push('(m.title LIKE ? OR m.description LIKE ?)');
      params.push(searchTerm, searchTerm);
    }

    // Applicable service filter
    if (filters.service_id && filters.service_id !== 'all') {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM marketing_material_services mms
          WHERE mms.material_id = m.id AND mms.service_id = ?
        )
      `);
      params.push(filters.service_id);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    // Count total matches
    const countSql = `
      SELECT COUNT(*) as cnt 
      FROM marketing_materials m 
      WHERE ${whereClause}
    `;
    const countResult = await db.query<{ cnt: number | string }>(countSql, params);
    const total = Number(countResult[0]?.cnt || 0);

    if (total === 0) {
      return { materials: [], total: 0 };
    }

    // Pagination
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const offset = (page - 1) * limit;

    // Fetch marketing materials (select file metadata, omit heavy raw file_data in list queries for performance)
    const selectSql = `
      SELECT 
        m.id,
        m.title,
        m.description,
        m.material_type,
        m.file_name,
        m.file_type,
        m.file_size,
        m.file_url,
        CASE WHEN m.file_data IS NOT NULL AND LENGTH(m.file_data) > 0 THEN 1 ELSE 0 END as has_file_data,
        m.is_published,
        m.is_archived,
        m.created_by_user_id,
        u.first_name || ' ' || u.last_name as created_by_name,
        m.created_at,
        m.updated_at
      FROM marketing_materials m
      LEFT JOIN users u ON m.created_by_user_id = u.id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rawMaterials = await db.query<any>(selectSql, [...params, limit, offset]);

    if (rawMaterials.length === 0) {
      return { materials: [], total };
    }

    // Batch load mapped services for the found materials
    const materialIds = rawMaterials.map((m: any) => m.id);
    const placeholders = materialIds.map(() => '?').join(',');
    const servicesSql = `
      SELECT 
        mms.material_id,
        mms.service_id,
        sm.name as service_name,
        sm.code as service_code,
        sc.name as category_name
      FROM marketing_material_services mms
      JOIN service_masters sm ON mms.service_id = sm.id
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE mms.material_id IN (${placeholders})
      ORDER BY sm.name ASC
    `;

    const rawServices = await db.query<any>(servicesSql, materialIds);
    const serviceMap = new Map<string, MarketingMaterialServiceMapping[]>();

    for (const row of rawServices) {
      if (!serviceMap.has(row.material_id)) {
        serviceMap.set(row.material_id, []);
      }
      serviceMap.get(row.material_id)!.push({
        service_id: row.service_id,
        service_name: row.service_name,
        service_code: row.service_code,
        category_name: row.category_name,
      });
    }

    const materials: MarketingMaterial[] = rawMaterials.map((m: any) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      material_type: m.material_type,
      file_name: m.file_name,
      file_type: m.file_type,
      file_size: m.file_size ? Number(m.file_size) : null,
      file_url: m.file_url,
      file_data: null, // Omitted in list view for fast bandwidth
      is_published: Boolean(m.is_published),
      is_archived: Boolean(m.is_archived),
      created_by_user_id: m.created_by_user_id,
      created_by_name: m.created_by_name?.trim() || 'Central Marketing Team',
      created_at: m.created_at,
      updated_at: m.updated_at,
      services: serviceMap.get(m.id) || [],
    }));

    return { materials, total };
  }

  /**
   * Get single marketing material with complete file payload and mapped services
   */
  static async getMaterialById(id: string, user: AuthUser): Promise<MarketingMaterial> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const query = `
      SELECT 
        m.id,
        m.title,
        m.description,
        m.material_type,
        m.file_name,
        m.file_type,
        m.file_size,
        m.file_url,
        m.file_data,
        m.is_published,
        m.is_archived,
        m.created_by_user_id,
        u.first_name || ' ' || u.last_name as created_by_name,
        m.created_at,
        m.updated_at
      FROM marketing_materials m
      LEFT JOIN users u ON m.created_by_user_id = u.id
      WHERE m.id = ?
    `;

    const rows = await db.query<any>(query, [id]);
    if (rows.length === 0) {
      throw new NotFoundError('Marketing material not found');
    }

    const material = rows[0];

    // Franchise users are blocked if material is unpublished or archived
    if (!isSuper && (!material.is_published || material.is_archived)) {
      throw new NotFoundError('Marketing material not found');
    }

    // Load mapped services
    const servicesSql = `
      SELECT 
        mms.service_id,
        sm.name as service_name,
        sm.code as service_code,
        sc.name as category_name
      FROM marketing_material_services mms
      JOIN service_masters sm ON mms.service_id = sm.id
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE mms.material_id = ?
      ORDER BY sm.name ASC
    `;
    const services = await db.query<MarketingMaterialServiceMapping>(servicesSql, [id]);

    return {
      id: material.id,
      title: material.title,
      description: material.description,
      material_type: material.material_type,
      file_name: material.file_name,
      file_type: material.file_type,
      file_size: material.file_size ? Number(material.file_size) : null,
      file_url: material.file_url,
      file_data: material.file_data,
      is_published: Boolean(material.is_published),
      is_archived: Boolean(material.is_archived),
      created_by_user_id: material.created_by_user_id,
      created_by_name: material.created_by_name?.trim() || 'Central Marketing Team',
      created_at: material.created_at,
      updated_at: material.updated_at,
      services,
    };
  }

  /**
   * Create new marketing material (Super Admin only)
   */
  static async createMaterial(
    input: CreateMarketingMaterialInput,
    user: AuthUser
  ): Promise<MarketingMaterial> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can create marketing materials');
    }

    const db = getDatabase();

    // Validation
    const title = input.title?.trim();
    if (!title || title.length < 3) {
      throw new BadRequestError('Material title must be at least 3 characters long');
    }

    if (!input.service_ids || !Array.isArray(input.service_ids) || input.service_ids.length === 0) {
      throw new BadRequestError('At least one applicable service must be selected');
    }

    if (!input.material_type) {
      throw new BadRequestError('Material type/category is required');
    }

    // Verify selected services exist in service_masters
    const placeholders = input.service_ids.map(() => '?').join(',');
    const checkServices = await db.query<{ id: string }>(
      `SELECT id FROM service_masters WHERE id IN (${placeholders})`,
      input.service_ids
    );
    if (checkServices.length !== input.service_ids.length) {
      throw new BadRequestError('One or more selected services do not exist in the catalog');
    }

    // Secure payload validation: ensure either file_data or file_url is provided
    const fileUrl = input.file_url ? input.file_url.trim() : null;
    const fileData = input.file_data ? input.file_data.trim() : null;
    if (!fileUrl && !fileData) {
      throw new BadRequestError('Either an uploaded file or a valid asset URL must be provided');
    }

    // Generate unique IDs
    const materialId = `mm_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const isPublished = input.is_published !== undefined ? (input.is_published ? 1 : 0) : 1;
    const isArchived = 0;
    const desc = input.description?.trim() || null;
    const fileName = input.file_name?.trim() || null;
    const fileType = input.file_type?.trim() || null;
    const fileSize = input.file_size ? Number(input.file_size) : null;

    // Insert into marketing_materials
    await db.execute(
      `INSERT INTO marketing_materials (
        id, title, description, material_type,
        file_name, file_type, file_size, file_url, file_data,
        is_published, is_archived, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        materialId,
        title,
        desc,
        input.material_type,
        fileName,
        fileType,
        fileSize,
        fileUrl,
        fileData,
        isPublished,
        isArchived,
        user.id,
      ]
    );

    // Insert service mappings
    for (const serviceId of input.service_ids) {
      const mappingId = `mms_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
      await db.execute(
        `INSERT INTO marketing_material_services (id, material_id, service_id) VALUES (?, ?, ?)`,
        [mappingId, materialId, serviceId]
      );
    }

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'MARKETING_MATERIAL_CREATED',
      entityType: 'MARKETING_MATERIAL',
      entityId: materialId,
      newValues: {
        title,
        material_type: input.material_type,
        is_published: isPublished,
        file_name: fileName,
        services: input.service_ids,
      },
    });

    return this.getMaterialById(materialId, user);
  }

  /**
   * Edit marketing material metadata & mappings (Super Admin only)
   */
  static async updateMaterial(
    id: string,
    input: UpdateMarketingMaterialInput,
    user: AuthUser
  ): Promise<MarketingMaterial> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can edit marketing materials');
    }

    const existing = await this.getMaterialById(id, user);
    const db = getDatabase();

    const newTitle = input.title !== undefined ? input.title.trim() : existing.title;
    if (newTitle.length < 3) {
      throw new BadRequestError('Material title must be at least 3 characters long');
    }

    const newDesc = input.description !== undefined ? input.description?.trim() || null : existing.description;
    const newType = input.material_type !== undefined ? input.material_type : existing.material_type;
    const newIsPublished =
      input.is_published !== undefined ? (input.is_published ? 1 : 0) : existing.is_published ? 1 : 0;
    const newIsArchived =
      input.is_archived !== undefined ? (input.is_archived ? 1 : 0) : existing.is_archived ? 1 : 0;

    const newFileName = input.file_name !== undefined ? input.file_name?.trim() || null : existing.file_name;
    const newFileType = input.file_type !== undefined ? input.file_type?.trim() || null : existing.file_type;
    const newFileSize = input.file_size !== undefined ? Number(input.file_size) : existing.file_size;
    const newFileUrl = input.file_url !== undefined ? input.file_url?.trim() || null : existing.file_url;
    const newFileData = input.file_data !== undefined ? input.file_data?.trim() || null : existing.file_data;

    await db.execute(
      `UPDATE marketing_materials 
       SET title = ?, description = ?, material_type = ?,
           file_name = ?, file_type = ?, file_size = ?, file_url = ?, file_data = ?,
           is_published = ?, is_archived = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        newTitle,
        newDesc,
        newType,
        newFileName,
        newFileType,
        newFileSize,
        newFileUrl,
        newFileData,
        newIsPublished,
        newIsArchived,
        id,
      ]
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
      await db.execute(`DELETE FROM marketing_material_services WHERE material_id = ?`, [id]);

      // Insert new mappings
      for (const serviceId of input.service_ids) {
        const mappingId = `mms_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
        await db.execute(
          `INSERT INTO marketing_material_services (id, material_id, service_id) VALUES (?, ?, ?)`,
          [mappingId, id, serviceId]
        );
      }
    }

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'MARKETING_MATERIAL_UPDATED',
      entityType: 'MARKETING_MATERIAL',
      entityId: id,
      oldValues: {
        title: existing.title,
        material_type: existing.material_type,
        is_published: existing.is_published,
        is_archived: existing.is_archived,
        services: existing.services.map((s) => s.service_id),
      },
      newValues: {
        title: newTitle,
        material_type: newType,
        is_published: newIsPublished,
        is_archived: newIsArchived,
        services: input.service_ids || existing.services.map((s) => s.service_id),
      },
    });

    return this.getMaterialById(id, user);
  }

  /**
   * Publish / Unpublish marketing material (Super Admin only)
   */
  static async setPublishStatus(id: string, isPublished: boolean, user: AuthUser): Promise<MarketingMaterial> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can change publish status');
    }

    const existing = await this.getMaterialById(id, user);
    const db = getDatabase();
    const pubVal = isPublished ? 1 : 0;

    await db.execute(
      `UPDATE marketing_materials SET is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [pubVal, id]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: isPublished ? 'MARKETING_MATERIAL_PUBLISHED' : 'MARKETING_MATERIAL_UNPUBLISHED',
      entityType: 'MARKETING_MATERIAL',
      entityId: id,
      oldValues: { is_published: existing.is_published },
      newValues: { is_published: pubVal },
    });

    return this.getMaterialById(id, user);
  }

  /**
   * Archive / Restore marketing material (Super Admin only)
   * Note: We use archival instead of permanent delete as per requirements
   */
  static async setArchiveStatus(id: string, isArchived: boolean, user: AuthUser): Promise<MarketingMaterial> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can archive marketing materials');
    }

    const existing = await this.getMaterialById(id, user);
    const db = getDatabase();
    const archVal = isArchived ? 1 : 0;

    await db.execute(
      `UPDATE marketing_materials SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [archVal, id]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: isArchived ? 'MARKETING_MATERIAL_ARCHIVED' : 'MARKETING_MATERIAL_RESTORED',
      entityType: 'MARKETING_MATERIAL',
      entityId: id,
      oldValues: { is_archived: existing.is_archived },
      newValues: { is_archived: archVal },
    });

    return this.getMaterialById(id, user);
  }
}
