import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { BadRequestError } from '../errors/AppError.js';
import { OfferService } from '../offers/offerService.js';
import type { ApiResponse } from '../types/index.js';
import type { Offer } from '../offers/types.js';

export const offerRouter = Router();

// All offer endpoints require authentication
offerRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const createOfferSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().max(2000).optional().nullable(),
  start_date: z.string().min(8, 'Valid start date is required'),
  end_date: z.string().min(8, 'Valid end date is required'),
  is_active: z.boolean().optional().default(true),
  service_ids: z.array(z.string().min(1)).min(1, 'At least one applicable service must be selected'),
});

const updateOfferSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  start_date: z.string().min(8).optional(),
  end_date: z.string().min(8).optional(),
  is_active: z.boolean().optional(),
  service_ids: z.array(z.string().min(1)).min(1).optional(),
});

const setStatusSchema = z.object({
  is_active: z.boolean(),
});

// ==========================================
// OFFER ENDPOINTS
// ==========================================

/**
 * 1. GET /api/v1/offers
 * List offers:
 * - Franchise users view active offers only (can filter by service_id and search)
 * - Super Admins view all offers with full filters
 */
offerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      service_id: typeof req.query.service_id === 'string' ? req.query.service_id : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      is_active: req.query.is_active !== undefined ? (req.query.is_active as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await OfferService.listOffers(filters, req.user!);
    const response: ApiResponse<Offer[]> = {
      success: true,
      data: result.offers,
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
 * 2. GET /api/v1/offers/:id
 * Get single offer detail (Franchise users can only view if active)
 */
offerRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const offer = await OfferService.getOfferById(req.params.id, req.user!);
    const response: ApiResponse<Offer> = {
      success: true,
      data: offer,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 3. POST /api/v1/offers
 * Create new offer (Super Admin only)
 */
offerRouter.post(
  '/',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = createOfferSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid offer data');
    }

    const offer = await OfferService.createOffer(parseResult.data, req.user!);
    const response: ApiResponse<Offer> = {
      success: true,
      data: offer,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 4. PATCH /api/v1/offers/:id
 * Edit existing offer (Super Admin only)
 */
offerRouter.patch(
  '/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = updateOfferSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid offer update data');
    }

    const offer = await OfferService.updateOffer(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<Offer> = {
      success: true,
      data: offer,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 5. PATCH /api/v1/offers/:id/status
 * Activate / Deactivate offer (Super Admin only)
 */
offerRouter.patch(
  '/:id/status',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = setStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid status data');
    }

    const offer = await OfferService.setOfferStatus(req.params.id, parseResult.data.is_active, req.user!);
    const response: ApiResponse<Offer> = {
      success: true,
      data: offer,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

