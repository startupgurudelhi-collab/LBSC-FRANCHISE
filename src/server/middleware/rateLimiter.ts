import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { env } from '../config/env.js';
import type { ApiResponse } from '../types/index.js';

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  name?: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory bucket store partitioned by limiter name
const store = new Map<string, Map<string, RateLimitRecord>>();

/**
 * Resets all rate limit stores or a specific named limiter store.
 * Useful for automated tests and administrative clearing.
 */
export function resetAllRateLimits(limiterName?: string): void {
  if (limiterName) {
    store.get(limiterName)?.clear();
  } else {
    store.clear();
  }
}

/**
 * Resets rate limit for a specific client key within a named limiter.
 */
export function resetRateLimitKey(limiterName: string, key: string): void {
  store.get(limiterName)?.delete(key);
}

/**
 * Default client identifier extractor (prefers client IP or proxy header)
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Creates a rate limiting middleware with sliding window expiration.
 */
export function createRateLimiter(options: RateLimiterOptions = {}): RequestHandler {
  const windowMs = options.windowMs ?? 60000;
  const maxRequests = options.maxRequests ?? 10;
  const message = options.message ?? 'Too many requests. Please try again later.';
  const name = options.name ?? 'default';
  const keyGenerator = options.keyGenerator ?? getClientIp;

  if (!store.has(name)) {
    store.set(name, new Map<string, RateLimitRecord>());
  }
  const limiterMap = store.get(name)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyGenerator(req);

    // Clean up record if expired
    let record = limiterMap.get(key);
    if (!record || now >= record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      limiterMap.set(key, record);
    }

    record.count += 1;

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil(record.resetTime / 1000);
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

    // Standard rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', retryAfterSeconds);

      const errorResponse: ApiResponse = {
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message,
          details: {
            limit: maxRequests,
            windowMs,
            retryAfterSeconds,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      };

      res.status(429).json(errorResponse);
      return;
    }

    next();
  };
}

/**
 * 1. Auth Rate Limiter
 * Applied to POST /api/v1/auth/login and POST /api/v1/auth/register to protect against brute-force attacks.
 */
export const authRateLimiter: RequestHandler = (req, res, next) => {
  const handler = createRateLimiter({
    name: 'auth',
    windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_AUTH_MAX,
    message: 'Too many authentication attempts. Please try again later.',
  });
  return handler(req, res, next);
};

/**
 * 2. Lead Intake Webhook Rate Limiter
 * Applied to POST /api/v1/integrations/lead-intake/webhook to protect intake ingestion pipeline.
 */
export const leadIntakeRateLimiter: RequestHandler = (req, res, next) => {
  const handler = createRateLimiter({
    name: 'lead-intake',
    windowMs: env.RATE_LIMIT_WEBHOOK_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_WEBHOOK_MAX,
    message: 'Too many lead intake webhook requests. Please try again later.',
  });
  return handler(req, res, next);
};

/**
 * 3. Efilingg Webhook Rate Limiter
 * Applied to POST /api/v1/integrations/efilingg/webhook to protect external callback endpoint.
 */
export const efilinggRateLimiter: RequestHandler = (req, res, next) => {
  const handler = createRateLimiter({
    name: 'efilingg',
    windowMs: env.RATE_LIMIT_WEBHOOK_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_WEBHOOK_MAX,
    message: 'Too many Efilingg webhook requests. Please try again later.',
  });
  return handler(req, res, next);
};
