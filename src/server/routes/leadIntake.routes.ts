import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env.js';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { LeadIntakeService } from '../integrations/leadIntake/leadIntakeService.js';
import { leadIntakeRateLimiter } from '../middleware/rateLimiter.js';
import { UnauthorizedError } from '../errors/AppError.js';
import type { ApiResponse } from '../types/index.js';

export const leadIntakeRouter = Router();

/**
 * 1. POST /api/v1/integrations/lead-intake/webhook
 * Public/Secured webhook listener to receive lead submissions from Meta, Google, landing pages, or aggregators.
 */
leadIntakeRouter.post(
  '/webhook',
  leadIntakeRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Verify Authentication (configured secret or HMAC signature)
      LeadIntakeService.verifyWebhookAuth(req);

      // 2. Process Intake (normalization, deduplication, and distribution)
      const result = await LeadIntakeService.handleWebhook(req.body, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      // 3. Return appropriate HTTP status: 200 for idempotent duplicate, 201 for fresh lead
      const statusCode = result.isDuplicate ? 200 : 201;

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      };

      res.status(statusCode).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 2. GET /api/v1/integrations/lead-intake/webhook
 * Handshake verification endpoint for Meta / Facebook Webhooks (hub.mode, hub.verify_token, hub.challenge)
 */
leadIntakeRouter.get(
  '/webhook',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe') {
        const configuredSecret = env.LEAD_WEBHOOK_SECRET ? env.LEAD_WEBHOOK_SECRET.trim() : '';
        if (configuredSecret && token === configuredSecret) {
          res.status(200).send(challenge);
          return;
        }
        throw new UnauthorizedError('Invalid hub.verify_token for lead intake webhook verification');
      }

      res.json({
        success: true,
        message: 'Lead intake webhook listener is active',
        endpoint: '/api/v1/integrations/lead-intake/webhook',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 3. GET /api/v1/integrations/lead-intake/status
 * Super Admin observability endpoint for gateway health and metrics
 */
leadIntakeRouter.get(
  '/status',
  authenticate,
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await LeadIntakeService.getStatus();

      const response: ApiResponse<typeof status> = {
        success: true,
        data: status,
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);
