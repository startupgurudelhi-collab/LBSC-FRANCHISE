import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { ServiceManagementService } from '../services/serviceManagementService.js';
import { NotFoundError } from '../errors/AppError.js';
import type { ApiResponse } from '../types/index.js';

export const serviceRouter = Router();

// Protect ALL service endpoints with authentication
serviceRouter.use(authenticate);

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

const requiredDocumentItemSchema = z.object({
  code: z.string().min(2, 'Document code is required'),
  name: z.string().min(2, 'Document name is required'),
  description: z.string().optional(),
  is_mandatory: z.boolean(),
  document_type: z.string().optional(),
});

const createCategorySchema = z.object({
  code: z.string().min(2, 'Category code is required'),
  name: z.string().min(2, 'Category name is required'),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const createServiceSchema = z.object({
  categoryId: z.string().min(2, 'Category ID is required'),
  code: z.string().min(2, 'Service code is required'),
  name: z.string().min(2, 'Service name is required'),
  description: z.string().optional().nullable(),

  // Single service fee
  serviceFee: z.number().min(0, 'Service fee must be >= 0'),

  // Configurable single commission value
  commissionValue: z.number().min(0, 'Commission value must be >= 0').optional(),
  commissionNotes: z.string().optional().nullable(),

  // Required documents
  requiredDocuments: z.array(requiredDocumentItemSchema).optional(),

  // Timeline / Processing
  turnaroundDays: z.number().int().min(0).optional(),
  slaHours: z.number().int().min(0).optional(),
  timelineDescription: z.string().optional().nullable(),

  // Status
  isActive: z.boolean().optional(),
});

const updateServiceSchema = z.object({
  categoryId: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),

  serviceFee: z.number().min(0).optional(),

  commissionValue: z.number().min(0).optional(),
  commissionNotes: z.string().optional().nullable(),

  requiredDocuments: z.array(requiredDocumentItemSchema).optional(),

  turnaroundDays: z.number().int().min(0).optional(),
  slaHours: z.number().int().min(0).optional(),
  timelineDescription: z.string().optional().nullable(),

  isActive: z.boolean().optional(),
});

const statusToggleSchema = z.object({
  isActive: z.boolean(),
});

// ==========================================
// CATEGORY ROUTES
// ==========================================

/**
 * GET /api/v1/services/categories
 * List categories (Read access for all authenticated users/franchises)
 */
serviceRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true' && req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
    const categories = await ServiceManagementService.listCategories(includeInactive);

    const response: ApiResponse<typeof categories> = {
      success: true,
      data: categories,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * GET /api/v1/services/categories/:id
 * Retrieve a specific category
 */
serviceRouter.get(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const category = await ServiceManagementService.getCategoryById(req.params.id);
    if (!category) {
      throw new NotFoundError('Service category not found');
    }

    const response: ApiResponse<typeof category> = {
      success: true,
      data: category,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * Admin Action: POST /api/v1/services/categories
 * Create a new service category (Super Admin only)
 */
serviceRouter.post(
  '/categories',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: createCategorySchema }),
  asyncHandler(async (req, res) => {
    const created = await ServiceManagementService.createCategory(req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof created> = {
      success: true,
      data: created,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.status(201).json(response);
  })
);

/**
 * Admin Action: PUT /api/v1/services/categories/:id
 * Update category details (Super Admin only)
 */
serviceRouter.put(
  '/categories/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: updateCategorySchema }),
  asyncHandler(async (req, res) => {
    const updated = await ServiceManagementService.updateCategory(req.params.id, req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

// ==========================================
// SERVICE MASTER CRUD ROUTES
// (Safe deactivation instead of permanent delete)
// ==========================================

/**
 * GET /api/v1/services
 * List service catalog (All authenticated users can list services; inactive hidden unless super_admin requests)
 */
serviceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
    const categoryId = req.query.categoryId as string | undefined;
    const search = req.query.search as string | undefined;
    
    let isActive: boolean | undefined = true;
    if (isSuperAdmin && req.query.includeInactive === 'true') {
      isActive = undefined;
    } else if (isSuperAdmin && req.query.isActive !== undefined) {
      isActive = req.query.isActive === 'true';
    }

    const services = await ServiceManagementService.listServices({
      categoryId,
      isActive,
      search,
    });

    const response: ApiResponse<typeof services> = {
      success: true,
      data: services,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * GET /api/v1/services/:id
 * Retrieve a specific service by ID
 */
serviceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const service = await ServiceManagementService.getServiceById(req.params.id);
    if (!service) {
      throw new NotFoundError('Service master not found');
    }

    if (!service.is_active && !req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
      throw new NotFoundError('Service master not found or currently inactive');
    }

    const response: ApiResponse<typeof service> = {
      success: true,
      data: service,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * Admin Action: POST /api/v1/services
 * Create a new service master (Super Admin only)
 */
serviceRouter.post(
  '/',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: createServiceSchema }),
  asyncHandler(async (req, res) => {
    const created = await ServiceManagementService.createService(req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof created> = {
      success: true,
      data: created,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.status(201).json(response);
  })
);

/**
 * Admin Action: PUT /api/v1/services/:id
 * Update service master fee, commission, documents, timeline, status (Super Admin only)
 */
serviceRouter.put(
  '/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: updateServiceSchema }),
  asyncHandler(async (req, res) => {
    const updated = await ServiceManagementService.updateService(req.params.id, req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);

/**
 * Admin Action: PATCH /api/v1/services/:id/status
 * Toggle service active/inactive status (Super Admin only)
 * Replaces permanent delete to keep historical records safe.
 */
serviceRouter.patch(
  '/:id/status',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: statusToggleSchema }),
  asyncHandler(async (req, res) => {
    const updated = await ServiceManagementService.setServiceStatus(req.params.id, req.body.isActive, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    };
    res.json(response);
  })
);
