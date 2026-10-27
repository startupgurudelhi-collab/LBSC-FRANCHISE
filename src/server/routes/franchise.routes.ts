import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRoles, requirePermissions } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES, SYSTEM_PERMISSIONS } from '../auth/roles.js';
import { FranchiseService } from '../franchise/franchiseService.js';
import { NotFoundError, ForbiddenError } from '../errors/AppError.js';
import type { ApiResponse } from '../types/index.js';

export const franchiseRouter = Router();

// Protect ALL franchise routes with authentication
franchiseRouter.use(authenticate);

// Zod Validation Schemas
const createApplicationSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  contactName: z.string().min(2, 'Contact name is required'),
  contactEmail: z.string().email('Valid email is required'),
  contactPhone: z.string().min(5, 'Valid phone is required'),
  city: z.string().min(2, 'City is required'),
  district: z.string().min(2, 'District is required'),
  state: z.string().min(2, 'State is required'),
  pin: z.string().min(2, 'PIN is required'),
});

const screeningSchema = z.object({
  notes: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(3, 'Rejection reason is required'),
});

const deactivateSchema = z.object({
  reason: z.string().optional(),
});

const updateProfileSchema = z.object({
  operatingName: z.string().min(2).optional(),
  legalName: z.string().min(2).optional(),
  taxId: z.string().optional().nullable(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(5).optional(),
  city: z.string().min(2).optional(),
  district: z.string().min(2).optional(),
  state: z.string().min(2).optional(),
  pin: z.string().min(2).optional(),
});

/**
 * Protected: POST /api/v1/franchise/applications
 * Submits a new franchise application (Requires authentication)
 */
franchiseRouter.post(
  '/applications',
  validate({ body: createApplicationSchema }),
  asyncHandler(async (req, res) => {
    const applicantUserId = req.user?.id || null;

    const application = await FranchiseService.createApplication(
      {
        ...req.body,
        applicantUserId,
      },
      {
        userId: applicantUserId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    const response: ApiResponse<typeof application> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.status(201).json(response);
  })
);

/**
 * Protected: GET /api/v1/franchise/applications
 * Admin & Auditor: List applications with optional filtering
 */
franchiseRouter.get(
  '/applications',
  requirePermissions(SYSTEM_PERMISSIONS.ORG_READ),
  asyncHandler(async (req, res) => {
    const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
    const status = req.query.status as string | undefined;
    const city = req.query.city as string | undefined;
    const district = req.query.district as string | undefined;
    const state = req.query.state as string | undefined;
    const pin = req.query.pin as string | undefined;

    const applications = await FranchiseService.listApplications(
      {
        status,
        city,
        district,
        state,
        pin,
      },
      {
        userId: req.user?.id,
        organizationId: req.user?.organizationId,
        isSuperAdmin,
      }
    );

    const response: ApiResponse<typeof applications> = {
      success: true,
      data: applications,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * Protected: GET /api/v1/franchise/applications/:id
 * Retrieve details of a specific application
 */
franchiseRouter.get(
  '/applications/:id',
  requirePermissions(SYSTEM_PERMISSIONS.ORG_READ),
  asyncHandler(async (req, res) => {
    const application = await FranchiseService.getApplicationById(req.params.id);
    if (!application) {
      throw new NotFoundError('Franchise application not found');
    }

    const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
    if (!isSuperAdmin) {
      const isApplicant = application.applicant_user_id === req.user?.id;
      const isOrgOwner = Boolean(
        req.user?.organizationId && application.organization_id === req.user?.organizationId
      );
      if (!isApplicant && !isOrgOwner) {
        throw new ForbiddenError('Access denied: You do not have permission to view this franchise application');
      }
    }

    const response: ApiResponse<typeof application> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * Protected Admin Action: POST /api/v1/franchise/applications/:id/screen
 * Moves application into SCREENING workflow stage
 */
franchiseRouter.post(
  '/applications/:id/screen',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: screeningSchema }),
  asyncHandler(async (req, res) => {
    const updated = await FranchiseService.moveToScreening(req.params.id, req.body.notes, {
      adminUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
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
 * Protected Admin Action: POST /api/v1/franchise/applications/:id/approve
 * Approves an application (Application/Screening -> Approved)
 */
franchiseRouter.post(
  '/applications/:id/approve',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const updated = await FranchiseService.approveApplication(req.params.id, {
      adminUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
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
 * Protected Admin Action: POST /api/v1/franchise/applications/:id/reject
 * Rejects an application with reason
 */
franchiseRouter.post(
  '/applications/:id/reject',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: rejectSchema }),
  asyncHandler(async (req, res) => {
    const updated = await FranchiseService.rejectApplication(req.params.id, req.body.reason, {
      adminUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
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
 * Protected Admin Action: POST /api/v1/franchise/applications/:id/activate
 * Activates franchise: provisions organization and creates franchise profile
 */
franchiseRouter.post(
  '/applications/:id/activate',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const result = await FranchiseService.activateFranchise(req.params.id, {
      adminUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * Protected Admin Action: POST /api/v1/franchise/:id/deactivate
 * Deactivates active franchise or application
 */
franchiseRouter.post(
  '/:id/deactivate',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  validate({ body: deactivateSchema }),
  asyncHandler(async (req, res) => {
    const result = await FranchiseService.deactivateFranchise(req.params.id, req.body.reason, {
      adminUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * Protected Profile Route: GET /api/v1/franchise/profile/:orgId
 * Franchise Owner (their own) or Admin (any)
 */
franchiseRouter.get(
  '/profile/:orgId',
  requirePermissions(SYSTEM_PERMISSIONS.ORG_READ),
  asyncHandler(async (req, res) => {
    const { orgId } = req.params;

    // Multi-tenant check: if franchise_owner, must match their assigned organization
    if (
      !req.user!.roles.includes(SYSTEM_ROLES.SUPER_ADMIN) &&
      req.user!.organizationId !== orgId
    ) {
      throw new ForbiddenError('You can only access your own franchise organization profile');
    }

    const profile = await FranchiseService.getProfileByOrganizationId(orgId);
    if (!profile) {
      throw new NotFoundError('Franchise profile not found for organization');
    }

    const response: ApiResponse<typeof profile> = {
      success: true,
      data: profile,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * Protected Profile Route: PUT /api/v1/franchise/profile/:orgId
 * Updates franchise profile and location mapping parameters (City, District, State, PIN)
 */
franchiseRouter.put(
  '/profile/:orgId',
  requirePermissions(SYSTEM_PERMISSIONS.ORG_WRITE),
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const { orgId } = req.params;

    // Multi-tenant check
    if (
      !req.user!.roles.includes(SYSTEM_ROLES.SUPER_ADMIN) &&
      req.user!.organizationId !== orgId
    ) {
      throw new ForbiddenError('You can only update your own franchise organization profile');
    }

    const updated = await FranchiseService.updateProfile(orgId, req.body, {
      userId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<typeof updated> = {
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
