import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requirePermissions, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '../auth/roles.js';
import { ClientService } from '../clients/clientService.js';
import { CLIENT_STATUS, CLIENT_SOURCE } from '../clients/types.js';

export const clientRouter = Router();

// All client routes require authentication
clientRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const createClientSchema = z.object({
  franchiseId: z.string().optional(),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().max(100).optional().default(''),
  email: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
  phone: z.string().min(7, 'Phone number must be at least 7 digits').max(20),
  alternatePhone: z.string().max(20).optional().nullable(),
  businessName: z.string().max(200).optional().nullable(),
  pan: z.string().max(32).optional().nullable(),
  gstin: z.string().max(32).optional().nullable(),
  city: z.string().min(1, 'City is required').max(100),
  district: z.string().min(1, 'District is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pin: z.string().max(32).optional().nullable(),
  address: z.string().optional().nullable(),
  source: z.enum(['direct', 'lead', 'referral', 'walk_in', 'other']).optional(),
  initialLeadId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.union([z.array(z.string()), z.string()]).optional().nullable(),
});

const updateClientSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
  phone: z.string().min(7).max(20).optional(),
  alternatePhone: z.string().max(20).optional().nullable(),
  businessName: z.string().max(200).optional().nullable(),
  pan: z.string().max(32).optional().nullable(),
  gstin: z.string().max(32).optional().nullable(),
  city: z.string().min(1).max(100).optional(),
  district: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  pin: z.string().max(32).optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  notes: z.string().optional().nullable(),
  tags: z.union([z.array(z.string()), z.string()]).optional().nullable(),
});

// ==========================================
// CLIENT DIRECTORY ENDPOINTS
// ==========================================

/**
 * GET /api/v1/clients
 * List and search clients with tenant isolation.
 * Franchises can only view their own clients; Super Admins can view all or filter by franchiseId.
 */
clientRouter.get(
  '/',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
      const franchiseId = req.user?.organizationId || undefined;

      const filter = {
        franchiseId: req.query.franchiseId as string | undefined,
        search: req.query.search as string | undefined,
        city: req.query.city as string | undefined,
        district: req.query.district as string | undefined,
        state: req.query.state as string | undefined,
        status: req.query.status as any,
        source: req.query.source as any,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await ClientService.listClients(filter, {
        franchiseId,
        isSuperAdmin,
      });

      res.json({
        success: true,
        data: result.clients,
        meta: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/clients/stats
 * Get overview metrics for client directory
 */
clientRouter.get(
  '/stats',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = Boolean(req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN));
      // Non-Super-Admin users must always use their own organizationId; query parameter is ignored
      const franchiseId = isSuperAdmin
        ? (req.query.franchiseId as string) || req.user?.organizationId || undefined
        : req.user?.organizationId || undefined;

      const stats = await ClientService.getClientStats(franchiseId, isSuperAdmin);

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/clients/:id
 * Retrieve client profile by ID with linked leads & service history
 */
clientRouter.get(
  '/:id',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
      const franchiseId = req.user?.organizationId || undefined;

      const result = await ClientService.getClientById(req.params.id, {
        franchiseId,
        isSuperAdmin,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/clients
 * Create a new client profile linked to the franchise
 */
clientRouter.post(
  '/',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = createClientSchema.parse(req.body);
      const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
      const franchiseId = req.user?.organizationId || undefined;

      const client = await ClientService.createClient(
        {
          ...validated,
          email: validated.email || null,
        },
        {
          userId: req.user?.id,
          franchiseId,
          isSuperAdmin,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      res.status(201).json({
        success: true,
        data: client,
        message: 'Client profile successfully created',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/clients/:id
 * Update an existing client profile
 */
clientRouter.put(
  '/:id',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = updateClientSchema.parse(req.body);
      const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
      const franchiseId = req.user?.organizationId || undefined;

      const client = await ClientService.updateClient(
        req.params.id,
        {
          ...validated,
          email: validated.email === '' ? null : validated.email,
        },
        {
          userId: req.user?.id,
          franchiseId,
          isSuperAdmin,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      res.json({
        success: true,
        data: client,
        message: 'Client profile successfully updated',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/clients/:id
 * Partial update for client profile
 */
clientRouter.patch(
  '/:id',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = updateClientSchema.parse(req.body);
      const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
      const franchiseId = req.user?.organizationId || undefined;

      const client = await ClientService.updateClient(
        req.params.id,
        {
          ...validated,
          email: validated.email === '' ? null : validated.email,
        },
        {
          userId: req.user?.id,
          franchiseId,
          isSuperAdmin,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      res.json({
        success: true,
        data: client,
        message: 'Client profile successfully updated',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/clients/:id/link-lead/:leadId
 * Manually link an assigned lead to a client profile
 */
clientRouter.post(
  '/:id/link-lead/:leadId',
  requirePermissions(SYSTEM_PERMISSIONS.CLIENTS_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = req.user?.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
      const franchiseId = req.user?.organizationId || undefined;

      const result = await ClientService.linkLeadToClient(req.params.id, req.params.leadId, {
        userId: req.user?.id,
        franchiseId,
        isSuperAdmin,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);
