import crypto from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { env } from '../config/env.js';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../errors/AppError.js';
import { EfilinggIntegrationService } from '../integrations/efilingg/efilinggService.js';
import { efilinggRateLimiter } from '../middleware/rateLimiter.js';

export const efilinggRouter = Router();

/**
 * Timing-safe string comparison to protect against timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Validation Schemas
const updateReferencesSchema = z.object({
  arn_number: z.string().optional().nullable(),
  srn_number: z.string().optional().nullable(),
  challan_number: z.string().optional().nullable(),
  efilingg_status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const webhookPayloadSchema = z.object({
  event: z.string().min(1, 'event is required'),
  timestamp: z.string().optional().default(() => new Date().toISOString()),
  externalFilingId: z.string().optional().default(''),
  applicationNumber: z.string().optional(),
  arnNumber: z.string().optional().nullable(),
  srnNumber: z.string().optional().nullable(),
  challanNumber: z.string().optional().nullable(),
  status: z.string().min(1, 'status is required'),
  statusReason: z.string().optional().nullable(),
  isSimulated: z.boolean().optional(),
});

/**
 * 1. GET /api/v1/integrations/efilingg/status
 * Super Admin & Operations monitoring endpoint for Efilingg integration gateway
 */
efilinggRouter.get(
  '/status',
  authenticate,
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await EfilinggIntegrationService.getIntegrationStatus();
      res.json({
        success: true,
        data: status,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 2. POST /api/v1/integrations/efilingg/sync/:id
 * Trigger integration sync for a specific service application
 */
efilinggRouter.post(
  '/sync/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const applicationId = req.params.id;
      if (!applicationId) {
        throw new BadRequestError('Application ID is required');
      }

      const result = await EfilinggIntegrationService.syncApplication(applicationId, req.user!);
      res.json({
        success: true,
        message: result.syncResult.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 3. PATCH /api/v1/integrations/efilingg/references/:id
 * Manually update filing references (ARN, SRN, Challan) on a service application
 */
efilinggRouter.patch(
  '/references/:id',
  authenticate,
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const applicationId = req.params.id;
      const validated = updateReferencesSchema.parse(req.body);

      const updated = await EfilinggIntegrationService.updateFilingReferences(
        applicationId,
        validated,
        req.user!
      );

      res.json({
        success: true,
        message: 'Filing references updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 4. POST /api/v1/integrations/efilingg/webhook
 * Public/Secured webhook listener to receive callback notifications from Efilingg
 */
efilinggRouter.post(
  '/webhook',
  efilinggRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configuredSecret = env.EFILINGG_WEBHOOK_SECRET ? env.EFILINGG_WEBHOOK_SECRET.trim() : '';

      // Production fail-closed: If webhook secret is not configured in production, block access
      if (env.NODE_ENV === 'production' && configuredSecret.length === 0) {
        throw new ForbiddenError(
          'Efilingg webhook secret is not configured in production environment. Webhook access blocked.'
        );
      }

      // If a webhook secret is configured, validate using timing-safe comparison
      if (configuredSecret.length > 0) {
        const receivedSecret =
          (req.headers['x-efilingg-secret'] as string) ||
          (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
            ? req.headers.authorization.replace('Bearer ', '').trim()
            : (req.headers.authorization as string) || '');

        if (!receivedSecret || !safeCompare(receivedSecret, configuredSecret)) {
          throw new UnauthorizedError('Invalid or missing Efilingg webhook secret');
        }
      }

      const validated = webhookPayloadSchema.parse(req.body);
      const result = await EfilinggIntegrationService.handleWebhook(validated as any);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);
