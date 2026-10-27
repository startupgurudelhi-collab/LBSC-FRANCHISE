import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requirePermissions, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '../auth/roles.js';
import { OwnLeadCenterService } from '../leads/ownLeadCenterService.js';

export const ownLeadCenterRouter = Router();

// All Own Lead Center routes require authentication
ownLeadCenterRouter.use(authenticate);

// ==========================================
// FRANCHISE-SCOPED & COMMON ENDPOINTS
// ==========================================

/**
 * GET /api/v1/own-lead-center/available
 * List available/buyable leads in the Own Lead Center.
 * Accessible to Franchises (to browse and buy) and Admins.
 */
ownLeadCenterRouter.get(
  '/available',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = {
        serviceId: req.query.serviceId as string,
        city: req.query.city as string,
        district: req.query.district as string,
        state: req.query.state as string,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await OwnLeadCenterService.listAvailableLeads(filter);

      res.json({
        success: true,
        data: result.leads,
        meta: {
          total: result.total,
          buyLeadPrice: result.buyLeadPrice,
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
 * GET /api/v1/own-lead-center/available/:id
 * Get single buyable lead details from Own Lead Center.
 */
ownLeadCenterRouter.get(
  '/available/:id',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await OwnLeadCenterService.getAvailableLeadById(req.params.id);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: { message: `Lead with ID '${req.params.id}' is not available in the Own Lead Center` },
        });
        return;
      }

      res.json({
        success: true,
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/own-lead-center/leads/:id/buy
 * Buy a lead from the Own Lead Center.
 * Deducts fixed ₹20 from franchise's commission balance.
 * Concurrency protected.
 */
ownLeadCenterRouter.post(
  '/leads/:id/buy',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.organizationId;
      if (!franchiseId) {
        res.status(400).json({
          success: false,
          error: { message: 'Authenticated user is not linked to a franchise organization' },
        });
        return;
      }

      const result = await OwnLeadCenterService.buyLead(req.params.id, franchiseId, {
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: `Lead ${result.lead.lead_number} successfully purchased for ₹${result.purchase.price.toFixed(
          2
        )} and permanently assigned to your franchise`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/own-lead-center/purchases
 * List purchase history.
 * Franchises see their own purchases. Super Admin sees all purchases.
 */
ownLeadCenterRouter.get(
  '/purchases',
  requirePermissions(SYSTEM_PERMISSIONS.LEADS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      const franchiseId = isSuperAdmin
        ? (req.query.franchiseId as string) || undefined
        : req.user?.organizationId || undefined;

      const filter = {
        franchiseId,
        leadId: req.query.leadId as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await OwnLeadCenterService.listPurchases(filter);

      res.json({
        success: true,
        data: result.purchases,
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

// ==========================================
// ADMIN OWN LEAD CENTER MANAGEMENT ENDPOINTS
// ==========================================

/**
 * GET /api/v1/own-lead-center/admin/stats
 * Admin dashboard overview of Own Lead Center performance and revenue.
 */
ownLeadCenterRouter.get(
  '/admin/stats',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await OwnLeadCenterService.getOwnLeadCenterStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
);
