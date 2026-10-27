import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import type { ApiResponse } from '../types/index.js';

export interface LbscModuleInfo {
  id: string;
  name: string;
  description: string;
  status: 'foundation_ready' | 'planned' | 'active';
  version: string;
  endpointsPrefix?: string;
}

// Foundation module registry for Phase 1
// Future phases will register route handlers dynamically into this structure
export const lbscModuleRegistry: LbscModuleInfo[] = [
  {
    id: 'core_foundation',
    name: 'Core Platform & Database Foundation',
    description: 'Shared database connection, migrations, multi-tenancy foundation, and error handling',
    status: 'foundation_ready',
    version: '1.0.0',
    endpointsPrefix: '/api/v1',
  },
  {
    id: 'auth_and_roles',
    name: 'Authentication & Roles Module (Phase 2)',
    description: 'Bcrypt password hashing, JWT authentication, RBAC middleware, and protected APIs',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/auth',
  },
  {
    id: 'franchise_portal',
    name: 'Franchise Management Module (Phase 3)',
    description: 'Franchise applications, screening workflow, profile management, City/District/State/PIN lead mapping, and admin actions',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/franchise',
  },
  {
    id: 'services',
    name: 'Service Management Module (Phase 4)',
    description: 'Service master, categories, fees, configurable commissions, required documents, timelines, and admin CRUD',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/services',
  },
  {
    id: 'campaigns',
    name: 'Campaign Management Module (Phase 6)',
    description: 'Franchise campaign creation, service & location targeting, fixed ₹100/day fees, 5 leads/day cap, commission balance deduction, and 3-day zero-balance grace tracking',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/campaigns',
  },
  {
    id: 'leads',
    name: 'Lead Distribution Engine (Phase 7)',
    description: 'Lead intake, service & location matching to active campaigns, 1-hour acceptance window, auto-release to next eligible franchise or Own Lead Center, 5 leads/day cap, immutable history & concurrency locks',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/leads',
  },
  {
    id: 'own_lead_center',
    name: 'Own Lead Center & Buy Leads (Phase 8)',
    description: 'Available unassigned lead pool, Buy Lead action at ₹20 per lead, commission deduction with negative balance support, zero-balance 3-lead purchase restriction with auto-reset, permanent ownership assignment, and concurrency locks',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/own-lead-center',
  },
  {
    id: 'client_directory',
    name: 'Client Directory Module (Phase 9)',
    description: 'Franchise client directory, customer profiles, contact & business details, linking clients to leads and services, multi-tenant isolation, search and filtering, and audit logging',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/clients',
  },
  {
    id: 'commissions',
    name: 'Commission Account & Ledger Module (Phase 5)',
    description: 'Franchise commission account balances, immutable ledger entries, running balance, and admin adjustments',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/commissions',
  },
  {
    id: 'admin_panel',
    name: 'Administrative Control Module',
    description: 'Platform super-admin controls, role assignments, audit inspection, and system metrics',
    status: 'planned',
    version: '0.1.0',
    endpointsPrefix: '/api/v1/admin',
  },
  {
    id: 'service_applications',
    name: 'Service Application & Applied Service Workflow (Phase 15B)',
    description: 'Applied services linked to clients and service masters, status workflow, required document tracking, work assignment, and explicit super admin commission release',
    status: 'active',
    version: '1.0.0',
    endpointsPrefix: '/api/v1/service-applications',
  },
];

export const modulesRouter = Router();

modulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const response: ApiResponse<{ modules: LbscModuleInfo[] }> = {
      success: true,
      data: {
        modules: lbscModuleRegistry,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);
