import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate, requireRoles, requirePermissions } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES, SYSTEM_PERMISSIONS } from '../auth/roles.js';
import type { ApiResponse } from '../types/index.js';

export const protectedRouter = Router();

// Require authentication for all sub-routes
protectedRouter.use(authenticate);

/**
 * GET /api/v1/protected/profile
 * Accessible by any authenticated user
 */
protectedRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const response: ApiResponse<{
      message: string;
      user: typeof req.user;
    }> = {
      success: true,
      data: {
        message: 'Successfully accessed protected user profile',
        user: req.user,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * GET /api/v1/protected/franchise-data
 * Requires franchise_owner or super_admin role
 */
protectedRouter.get(
  '/franchise-data',
  requireRoles(SYSTEM_ROLES.FRANCHISE_OWNER, SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const response: ApiResponse<{
      message: string;
      roleAuthorized: string[];
      organizationId: string | null;
    }> = {
      success: true,
      data: {
        message: 'Authorized access to franchise role-protected foundation',
        roleAuthorized: req.user?.roles || [],
        organizationId: req.user?.organizationId || null,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

/**
 * GET /api/v1/protected/audit-inspection
 * Requires 'audit:read' permission
 */
protectedRouter.get(
  '/audit-inspection',
  requirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ),
  asyncHandler(async (req, res) => {
    const response: ApiResponse<{
      message: string;
      permissionAuthorized: string;
    }> = {
      success: true,
      data: {
        message: 'Authorized access to permission-protected audit resource',
        permissionAuthorized: SYSTEM_PERMISSIONS.AUDIT_READ,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);
