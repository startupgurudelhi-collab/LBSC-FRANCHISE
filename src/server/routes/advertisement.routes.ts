import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { BadRequestError } from '../errors/AppError.js';
import { AdvertisementService } from '../advertisements/advertisementService.js';
import type { ApiResponse } from '../types/index.js';
import type {
  AdvertisementRequest,
  AdvertisementRequestHistory,
  AdvertisementRequestSummary,
} from '../advertisements/types.js';

export const advertisementRouter = Router();

// All advertisement request routes require authentication
advertisementRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const createRequestSchema = z.object({
  franchise_id: z.string().optional(),
  title: z.string().min(2, 'Title must be at least 2 characters').max(255),
  description: z.string().min(5, 'Description must be at least 5 characters').max(5000),
  advertising_type: z.string().min(2, 'Advertising type is required').max(64),
  service_id: z.string().optional().nullable(),
  target_audience: z.string().max(255).optional().nullable(),
  target_location: z.string().max(255).optional().nullable(),
  preferred_timeline: z.string().max(128).optional().nullable(),
  notes: z.string().max(3000).optional().nullable(),
  reference_details: z.string().max(5000).optional().nullable(),
});

const reviewRequestSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

const approveRequestSchema = z.object({
  admin_notes: z.string().max(2000).optional().nullable(),
});

const rejectRequestSchema = z.object({
  rejection_reason: z.string().min(3, 'Rejection reason must be at least 3 characters').max(2000),
  admin_notes: z.string().max(2000).optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'IN_PROGRESS', 'COMPLETED']),
  notes: z.string().max(2000).optional().nullable(),
});

const addAdminNoteSchema = z.object({
  note: z.string().min(1, 'Note content is required').max(5000),
});

// ==========================================
// ROUTES
// ==========================================

/**
 * 1. GET /api/v1/advertisement-requests/summary
 * KPI summary metrics (scoped by tenant if franchise, global if admin)
 */
advertisementRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const summary = await AdvertisementService.getSummary(req.user!);
    const response: ApiResponse<AdvertisementRequestSummary> = {
      success: true,
      data: summary,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 2. GET /api/v1/advertisement-requests
 * List advertisement requests with filters and pagination
 */
advertisementRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      franchise_id: typeof req.query.franchise_id === 'string' ? req.query.franchise_id : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      advertising_type: typeof req.query.advertising_type === 'string' ? req.query.advertising_type : undefined,
      service_id: typeof req.query.service_id === 'string' ? req.query.service_id : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      sort_by: (req.query.sort_by as any) || 'created_at',
      sort_order: (req.query.sort_order as any) || 'desc',
    };

    const result = await AdvertisementService.listRequests(filters, req.user!);
    const response: ApiResponse<AdvertisementRequest[]> = {
      success: true,
      data: result.requests,
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
 * 3. GET /api/v1/advertisement-requests/:id
 * Retrieve single advertisement request details
 */
advertisementRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const request = await AdvertisementService.getRequestById(req.params.id, req.user!);
    const response: ApiResponse<AdvertisementRequest> = {
      success: true,
      data: request,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 4. GET /api/v1/advertisement-requests/:id/history
 * Retrieve full chronological audit & status history trail
 */
advertisementRouter.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const history = await AdvertisementService.getRequestHistory(req.params.id, req.user!);
    const response: ApiResponse<AdvertisementRequestHistory[]> = {
      success: true,
      data: history,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 5. POST /api/v1/advertisement-requests
 * Create a new advertisement request (Franchise for own org, Super Admin for any)
 */
advertisementRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parseResult = createRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid advertisement request input');
    }

    const created = await AdvertisementService.createRequest(parseResult.data, req.user!);
    const response: ApiResponse<AdvertisementRequest> = {
      success: true,
      data: created,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 6. POST /api/v1/advertisement-requests/:id/review
 * Put request UNDER_REVIEW (Super Admin only)
 */
advertisementRouter.post(
  '/:id/review',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = reviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid review input');
    }

    const updated = await AdvertisementService.reviewRequest(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<AdvertisementRequest> = {
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7. POST /api/v1/advertisement-requests/:id/approve
 * Approve advertisement request (Super Admin only)
 * Decoupled: NO automatic campaign creation.
 */
advertisementRouter.post(
  '/:id/approve',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = approveRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid approval input');
    }

    const updated = await AdvertisementService.approveRequest(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<AdvertisementRequest> = {
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 8. POST /api/v1/advertisement-requests/:id/reject
 * Reject advertisement request with mandatory reason (Super Admin only)
 */
advertisementRouter.post(
  '/:id/reject',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = rejectRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid rejection input');
    }

    const updated = await AdvertisementService.rejectRequest(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<AdvertisementRequest> = {
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 9. PATCH /api/v1/advertisement-requests/:id/status
 * Lifecycle status transitions: APPROVED -> IN_PROGRESS -> COMPLETED (Super Admin only)
 */
advertisementRouter.patch(
  '/:id/status',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid status transition input');
    }

    const updated = await AdvertisementService.updateStatus(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<AdvertisementRequest> = {
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 10. POST /api/v1/advertisement-requests/:id/admin-notes
 * Add internal admin note to request history (Super Admin only)
 */
advertisementRouter.post(
  '/:id/admin-notes',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = addAdminNoteSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid note input');
    }

    const historyEntry = await AdvertisementService.addAdminNote(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<AdvertisementRequestHistory> = {
      success: true,
      data: historyEntry,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);
