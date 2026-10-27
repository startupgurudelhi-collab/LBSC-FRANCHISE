import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { JobEngine } from '../jobs/jobEngine.js';
import { CampaignDailyChargeJob } from '../jobs/handlers/campaignDailyChargeJob.js';
import { LeadOpportunityExpiryJob } from '../jobs/handlers/leadOpportunityExpiryJob.js';
import { ServiceApplicationSlaJob } from '../jobs/handlers/serviceApplicationSlaJob.js';
import { BackgroundScheduler } from '../jobs/scheduler.js';
import type { ApiResponse } from '../types/index.js';

export const jobRouter = Router();

// Super Admin only for all job triggers and observability
jobRouter.use(authenticate);
jobRouter.use(requireRoles(SYSTEM_ROLES.SUPER_ADMIN));

/**
 * 1. POST /api/v1/jobs/campaign-daily-charges
 * Trigger campaign daily charges job
 */
jobRouter.post(
  '/campaign-daily-charges',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const targetDate = typeof req.body?.targetDate === 'string' ? req.body.targetDate : undefined;

    const result = await CampaignDailyChargeJob.run(targetDate, {
      triggerType: 'MANUAL',
      userId: user.id,
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
 * 2. POST /api/v1/jobs/lead-opportunity-expiry
 * Trigger lead opportunity expiry processing job
 */
jobRouter.post(
  '/lead-opportunity-expiry',
  asyncHandler(async (req, res) => {
    const user = req.user!;

    const result = await LeadOpportunityExpiryJob.run({
      triggerType: 'MANUAL',
      userId: user.id,
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
 * 3. POST /api/v1/jobs/service-application-sla
 * Trigger service application SLA detection and notification job
 */
jobRouter.post(
  '/service-application-sla',
  asyncHandler(async (req, res) => {
    const user = req.user!;

    const result = await ServiceApplicationSlaJob.run({
      triggerType: 'MANUAL',
      userId: user.id,
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
 * 4. GET /api/v1/jobs/history
 * List historical job execution records with filtering and pagination
 */
jobRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const jobName = typeof req.query.job_name === 'string' ? req.query.job_name : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await JobEngine.getJobHistory({
      jobName,
      status,
      limit,
      offset,
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
 * 5. GET /api/v1/jobs/status
 * Get active locks and runner status
 */
jobRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const activeLocks = await JobEngine.getActiveLocks();
    const scheduler = BackgroundScheduler.getStatus();

    const response: ApiResponse<{ activeLocks: typeof activeLocks; scheduler: typeof scheduler }> = {
      success: true,
      data: { activeLocks, scheduler },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);
