import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requirePermissions, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '../auth/roles.js';
import { CampaignService } from '../campaigns/campaignService.js';
import { CAMPAIGN_STATUS, type CampaignStatus } from '../campaigns/types.js';

export const campaignRouter = Router();

// Require authentication for all campaign endpoints
campaignRouter.use(authenticate);

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createCampaignSchema = z.object({
  organizationId: z.string().optional(),
  serviceId: z.string().min(1, 'serviceId is required'),
  name: z.string().optional(),
  city: z.string().min(2, 'City is required (minimum 2 characters)'),
  district: z.string().min(2, 'District is required (minimum 2 characters)'),
  state: z.string().min(2, 'State is required (minimum 2 characters)'),
  startDate: z.string().regex(dateRegex, 'startDate must be in YYYY-MM-DD format').optional(),
  endDate: z.string().regex(dateRegex, 'endDate must be in YYYY-MM-DD format').optional().nullable(),
  status: z.enum([CAMPAIGN_STATUS.ACTIVE, CAMPAIGN_STATUS.PAUSED]).optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().optional(),
  city: z.string().min(2, 'City must have at least 2 characters').optional(),
  district: z.string().min(2, 'District must have at least 2 characters').optional(),
  state: z.string().min(2, 'State must have at least 2 characters').optional(),
  endDate: z.string().regex(dateRegex, 'endDate must be in YYYY-MM-DD format').optional().nullable(),
  status: z.enum([CAMPAIGN_STATUS.ACTIVE, CAMPAIGN_STATUS.PAUSED]).optional(),
});

const processDailyChargesSchema = z.object({
  date: z.string().regex(dateRegex, 'date must be in YYYY-MM-DD format').optional(),
});

// ==========================================
// ADMIN BATCH PROCESSING ROUTE
// (Placed before parameterized :id routes)
// ==========================================

/**
 * POST /api/v1/campaigns/process-daily-charges
 * Admin batch processor for daily campaign fee deductions across all active campaigns.
 */
campaignRouter.post(
  '/process-daily-charges',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = processDailyChargesSchema.parse(req.body || {});
      const result = await CampaignService.processDailyCharges(body.date, {
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: `Processed daily charges for date ${result.targetDate}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// CRUD CAMPAIGN ROUTES
// ==========================================

/**
 * POST /api/v1/campaigns
 * Create a new campaign for a franchise and service.
 * Enforces:
 * - ₹100/day fixed fee
 * - 5 leads/day max allocation
 * - Location: City, District, State
 */
campaignRouter.post(
  '/',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = createCampaignSchema.parse(req.body);
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));

      const campaign = await CampaignService.createCampaign(
        {
          ...validated,
          status: validated.status as CampaignStatus | undefined,
        },
        {
          userId: req.user?.id,
          organizationId: req.user?.organizationId || undefined,
          isSuperAdmin,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );

      res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/campaigns
 * List campaigns. Non-admins are scoped strictly to their assigned franchise.
 */
campaignRouter.get(
  '/',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const filter = {
        organizationId: isSuperAdmin ? (req.query.organizationId as string) : undefined,
        serviceId: req.query.serviceId as string,
        status: req.query.status as CampaignStatus,
        city: req.query.city as string,
        district: req.query.district as string,
        state: req.query.state as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await CampaignService.listCampaigns(filter, orgScope);

      res.json({
        success: true,
        data: result.campaigns,
        meta: {
          total: result.total,
          limit: filter.limit,
          offset: filter.offset,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/campaigns/:id
 * Retrieve a single campaign with details and remaining zero-balance grace days.
 */
campaignRouter.get(
  '/:id',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const campaign = await CampaignService.getCampaignById(req.params.id, orgScope);
      if (!campaign) {
        res.status(404).json({
          success: false,
          error: { message: `Campaign with ID '${req.params.id}' not found` },
        });
        return;
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/campaigns/:id
 * Update campaign details or status.
 */
campaignRouter.patch(
  '/:id',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = updateCampaignSchema.parse(req.body);
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const campaign = await CampaignService.updateCampaign(
        req.params.id,
        {
          ...validated,
          status: validated.status as CampaignStatus | undefined,
        },
        {
          userId: req.user?.id,
          orgScope,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );

      res.json({
        success: true,
        message: 'Campaign updated successfully',
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/pause
 * Pause an active campaign.
 */
campaignRouter.post(
  '/:id/pause',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);
      const reason = req.body?.reason || 'manual_pause';

      const campaign = await CampaignService.pauseCampaign(req.params.id, reason, {
        userId: req.user?.id,
        orgScope,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Campaign paused successfully',
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/resume
 * Resume a paused campaign (validates 3-day zero-balance rule).
 */
campaignRouter.post(
  '/:id/resume',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const campaign = await CampaignService.resumeCampaign(req.params.id, {
        userId: req.user?.id,
        orgScope,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Campaign resumed successfully',
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/campaigns/:id/charges
 * Get daily charges history for a campaign.
 */
campaignRouter.get(
  '/:id/charges',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      const charges = await CampaignService.listCampaignCharges(req.params.id, orgScope);

      res.json({
        success: true,
        data: charges,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/charge-daily
 * Trigger daily charge deduction for a single campaign.
 */
campaignRouter.post(
  '/:id/charge-daily',
  requirePermissions(SYSTEM_PERMISSIONS.CAMPAIGNS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const orgScope = isSuperAdmin ? undefined : (req.user?.organizationId || undefined);

      // Verify tenant ownership
      const existing = await CampaignService.getCampaignById(req.params.id, orgScope);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { message: `Campaign with ID '${req.params.id}' not found` },
        });
        return;
      }

      const body = processDailyChargesSchema.parse(req.body || {});
      const result = await CampaignService.deductDailyCharge(req.params.id, body.date, {
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);
