import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Applies standard security headers to an Express response.
 * Enforces X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and HSTS in production.
 */
export function applySecurityHeaders(
  res: Response,
  isProduction: boolean
): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Clickjacking protection: SAMEORIGIN preserves frontend iframe preview while blocking cross-origin framing
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Control referrer information sent in HTTP headers
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Miscellaneous hardening
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');

  // Strict-Transport-Security (HSTS) in production
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/**
 * Standard security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const isProd =
    process.env.NODE_ENV === 'production' ||
    env.NODE_ENV === 'production' ||
    (req.app && req.app.get('env') === 'production');

  applySecurityHeaders(res, isProd);
  next();
}

/**
 * Factory for creating security headers middleware with explicit production flag override
 */
export function createSecurityHeadersMiddleware(isProduction?: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const isProd =
      typeof isProduction === 'boolean'
        ? isProduction
        : process.env.NODE_ENV === 'production' ||
          env.NODE_ENV === 'production' ||
          (req.app && req.app.get('env') === 'production');

    applySecurityHeaders(res, isProd);
    next();
  };
}
