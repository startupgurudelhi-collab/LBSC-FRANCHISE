import cors from 'cors';
import type { RequestHandler } from 'express';
import { validateProductionCorsOrigin } from '../config/env.js';

export { validateProductionCorsOrigin };

/**
 * Creates configured CORS middleware enforcing strict production rules:
 * - Rejects wildcard '*' in production
 * - Accepts only explicitly configured origin(s)
 * - Retains permissive development behavior
 */
export function createCorsMiddleware(corsOriginConfig: string, isProduction: boolean): RequestHandler {
  if (isProduction) {
    validateProductionCorsOrigin(corsOriginConfig);
  }

  const allowedOrigins = corsOriginConfig
    ? corsOriginConfig.split(',').map((o) => o.trim().toLowerCase())
    : ['*'];

  return cors({
    origin: (requestOrigin, callback) => {
      // Allow requests without Origin header (curl, mobile apps, same-origin, server-to-server)
      if (!requestOrigin) {
        return callback(null, true);
      }

      const normalizedRequestOrigin = requestOrigin.trim().toLowerCase();

      if (!isProduction) {
        if (allowedOrigins.includes('*') || allowedOrigins.includes(normalizedRequestOrigin)) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in dev
      }

      // Production: must strictly match configured allowed origins
      if (allowedOrigins.includes(normalizedRequestOrigin)) {
        return callback(null, true);
      }

      // Disallowed origin in production
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-efilingg-secret',
      'x-lead-secret',
      'x-webhook-secret',
    ],
  });
}
