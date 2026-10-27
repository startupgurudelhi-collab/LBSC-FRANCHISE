import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { AuthService } from '../auth/authService.js';
import { authenticate } from '../auth/authMiddleware.js';
import type { ApiResponse, AuthenticatedUser } from '../types/index.js';

export const authRouter = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials and issues token
 */
authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<{ token: string; user: AuthenticatedUser }> = {
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
 * POST /api/v1/auth/register
 * Public registration for new platform users.
 * Client-controlled roleCode and organizationId are omitted to prevent privilege escalation.
 */
authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    const result = await AuthService.register(
      {
        email,
        password,
        firstName,
        lastName,
        // Public registration never creates privileged roles or sets organizationId
        roleCode: undefined,
        organizationId: null,
      },
      {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    const response: ApiResponse<{ token: string; user: AuthenticatedUser }> = {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.status(201).json(response);
  })
);

/**
 * GET /api/v1/auth/me
 * Retrieves the currently authenticated user with their roles and permissions
 */
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const response: ApiResponse<AuthenticatedUser> = {
      success: true,
      data: req.user,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

/**
 * POST /api/v1/auth/change-password
 * Changes user password and invalidates all existing JWT sessions by incrementing token_version
 */
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await AuthService.changePassword(req.user!.id, currentPassword, newPassword);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: 'Password changed successfully. All previous sessions have been invalidated.',
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
 * POST /api/v1/auth/logout
 * Logs out the user and invalidates current JWT session by incrementing token_version
 */
authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await AuthService.revokeUserTokens(req.user!.id);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: 'Logged out successfully. Session has been revoked.',
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
 * POST /api/v1/auth/revoke
 * Explicit token/session revocation endpoint
 */
authRouter.post(
  '/revoke',
  authenticate,
  asyncHandler(async (req, res) => {
    await AuthService.revokeUserTokens(req.user!.id);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: 'Token session revoked successfully.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.json(response);
  })
);

