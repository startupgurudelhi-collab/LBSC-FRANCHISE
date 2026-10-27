import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { BadRequestError } from '../errors/AppError.js';
import { MarketingService } from '../marketing/marketingService.js';
import type { ApiResponse } from '../types/index.js';
import type { MarketingMaterial } from '../marketing/types.js';

export const marketingRouter = Router();

// All marketing endpoints require authentication
marketingRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const createMaterialSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().max(3000).optional().nullable(),
  material_type: z.enum([
    'flyer',
    'brochure',
    'social_media',
    'banner',
    'poster',
    'presentation',
    'video',
    'document',
    'other',
  ]),
  file_name: z.string().max(255).optional().nullable(),
  file_type: z.string().max(128).optional().nullable(),
  file_size: z.number().int().nonnegative().optional().nullable(),
  file_url: z.string().url().max(2000).optional().nullable().or(z.literal('')),
  file_data: z.string().optional().nullable(),
  is_published: z.boolean().optional().default(true),
  service_ids: z.array(z.string().min(1)).min(1, 'At least one applicable service must be selected'),
});

const updateMaterialSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().max(3000).optional().nullable(),
  material_type: z
    .enum([
      'flyer',
      'brochure',
      'social_media',
      'banner',
      'poster',
      'presentation',
      'video',
      'document',
      'other',
    ])
    .optional(),
  file_name: z.string().max(255).optional().nullable(),
  file_type: z.string().max(128).optional().nullable(),
  file_size: z.number().int().nonnegative().optional().nullable(),
  file_url: z.string().url().max(2000).optional().nullable().or(z.literal('')),
  file_data: z.string().optional().nullable(),
  is_published: z.boolean().optional(),
  is_archived: z.boolean().optional(),
  service_ids: z.array(z.string().min(1)).min(1).optional(),
});

const setPublishSchema = z.object({
  is_published: z.boolean(),
});

const setArchiveSchema = z.object({
  is_archived: z.boolean(),
});

// ==========================================
// ROUTES
// ==========================================

/**
 * 1. GET /api/v1/marketing-materials
 * List materials:
 * - Franchise users view published and unarchived materials only
 * - Super Admins view all with full filters
 */
marketingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      service_id: typeof req.query.service_id === 'string' ? req.query.service_id : undefined,
      material_type: typeof req.query.material_type === 'string' ? req.query.material_type : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      is_published: req.query.is_published !== undefined ? (req.query.is_published as string) : undefined,
      is_archived: req.query.is_archived !== undefined ? (req.query.is_archived as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await MarketingService.listMaterials(filters, req.user!);
    const response: ApiResponse<MarketingMaterial[]> = {
      success: true,
      data: result.materials,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit) || 1,
        },
      },
    };
    res.json(response);
  })
);

/**
 * 2. GET /api/v1/marketing-materials/:id
 * Get single marketing material with full file payload & service mappings
 */
marketingRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const material = await MarketingService.getMaterialById(req.params.id, req.user!);
    const response: ApiResponse<MarketingMaterial> = {
      success: true,
      data: material,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 3. GET /api/v1/marketing-materials/:id/download
 * Direct download or stream of the marketing material file
 */
marketingRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const material = await MarketingService.getMaterialById(req.params.id, req.user!);

    // Handle base64 durable file data
    if (material.file_data) {
      let base64Content = material.file_data;
      let contentType = material.file_type || 'application/octet-stream';

      if (base64Content.startsWith('data:')) {
        const matches = base64Content.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          base64Content = matches[2];
        }
      }

      const fileBuffer = Buffer.from(base64Content, 'base64');
      const filename = material.file_name || `marketing-material-${material.id}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
      return;
    }

    // Handle external URL
    if (material.file_url) {
      res.redirect(material.file_url);
      return;
    }

    throw new BadRequestError('No downloadable asset available for this marketing material');
  })
);

/**
 * 4. POST /api/v1/marketing-materials
 * Upload/Create new marketing material (Super Admin only)
 */
marketingRouter.post(
  '/',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = createMaterialSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid marketing material data');
    }

    const material = await MarketingService.createMaterial(parseResult.data, req.user!);
    const response: ApiResponse<MarketingMaterial> = {
      success: true,
      data: material,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 5. PATCH /api/v1/marketing-materials/:id
 * Edit marketing material metadata & mappings (Super Admin only)
 */
marketingRouter.patch(
  '/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = updateMaterialSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid marketing material update data');
    }

    const material = await MarketingService.updateMaterial(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<MarketingMaterial> = {
      success: true,
      data: material,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 6. PATCH /api/v1/marketing-materials/:id/publish
 * Publish / Unpublish marketing material (Super Admin only)
 */
marketingRouter.patch(
  '/:id/publish',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = setPublishSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid publish status data');
    }

    const material = await MarketingService.setPublishStatus(req.params.id, parseResult.data.is_published, req.user!);
    const response: ApiResponse<MarketingMaterial> = {
      success: true,
      data: material,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7. PATCH /api/v1/marketing-materials/:id/archive
 * Archive / Restore marketing material (Super Admin only)
 * Safe archive pattern instead of permanent deletion
 */
marketingRouter.patch(
  '/:id/archive',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = setArchiveSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid archive status data');
    }

    const material = await MarketingService.setArchiveStatus(req.params.id, parseResult.data.is_archived, req.user!);
    const response: ApiResponse<MarketingMaterial> = {
      success: true,
      data: material,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);
