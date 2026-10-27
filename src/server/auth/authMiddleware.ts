import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from './security.js';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';
import { AuthService } from './authService.js';

/**
 * Authentication Middleware: Validates Bearer token and attaches user to request
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }

  const token = authHeader.substring(7).trim();

  try {
    const payload = verifyToken(token);

    // Populate user from token payload (fast path)
    const user = await AuthService.getUserWithPermissions(payload.userId);
    if (!user) {
      return next(new UnauthorizedError('User account not found'));
    }

    if (user.status !== 'active') {
      return next(new UnauthorizedError('User account is inactive'));
    }

    // Token revocation / session versioning verification
    if (payload.tokenVersion === undefined || payload.tokenVersion !== user.tokenVersion) {
      return next(new UnauthorizedError('Token has been revoked or invalidated. Please sign in again.'));
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token has expired'));
    }
    return next(new UnauthorizedError('Invalid authentication token'));
  }
}

/**
 * Role-Based Access Control Middleware
 * Requires the authenticated user to possess AT LEAST ONE of the specified roles
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Super admin bypasses role checks
    if (req.user.roles.includes('super_admin')) {
      return next();
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      return next(
        new ForbiddenError(
          `Access forbidden: requires one of [${allowedRoles.join(', ')}] roles`
        )
      );
    }

    next();
  };
}

/**
 * Permission-Based Access Control Middleware
 * Requires the authenticated user to possess ALL specified permissions
 */
export function requirePermissions(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Super admin bypasses permission checks
    if (req.user.roles.includes('super_admin')) {
      return next();
    }

    const userPermissions = new Set(req.user.permissions);
    const missingPermissions = requiredPermissions.filter(
      (perm) => !userPermissions.has(perm)
    );

    if (missingPermissions.length > 0) {
      return next(
        new ForbiddenError(
          `Access forbidden: missing required permission(s): [${missingPermissions.join(', ')}]`
        )
      );
    }

    next();
  };
}
