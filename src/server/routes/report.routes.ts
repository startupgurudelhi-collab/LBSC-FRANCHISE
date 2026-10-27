import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { ReportService } from '../reports/reportService.js';
import type { ApiResponse } from '../types/index.js';
import type {
  FranchiseSummaryReport,
  LeadMetricsReport,
  CommissionMetricsReport,
  ServiceMetricsReport,
  CustomReportResult,
  CustomReportDatasetSchema,
  ReportFilterCriteria,
  NetworkRevenueReport,
  NetworkRevenueFilterCriteria,
} from '../reports/types.js';

export const reportRouter = Router();

// Super Admin access ONLY for all reporting endpoints
reportRouter.use(authenticate);
reportRouter.use(requireRoles(SYSTEM_ROLES.SUPER_ADMIN));

/**
 * 0. GET /api/v1/reports/network-revenue
 * Corporate Network Revenue & Retained Margin Report (Super Admin only)
 * Filters: startDate, endDate, district, service
 */
reportRouter.get(
  '/network-revenue',
  asyncHandler(async (req, res) => {
    const criteria: NetworkRevenueFilterCriteria = {
      startDate: typeof req.query.startDate === 'string' && req.query.startDate ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' && req.query.endDate ? req.query.endDate : undefined,
      district: typeof req.query.district === 'string' && req.query.district ? req.query.district : undefined,
      service: typeof req.query.service === 'string' && req.query.service ? req.query.service : undefined,
    };

    const data = await ReportService.getNetworkRevenue(criteria, {
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<NetworkRevenueReport> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

// Helper to extract criteria from query
function extractCriteria(query: any): ReportFilterCriteria {
  return {
    startDate: typeof query.startDate === 'string' && query.startDate ? query.startDate : undefined,
    endDate: typeof query.endDate === 'string' && query.endDate ? query.endDate : undefined,
    franchise: typeof query.franchise === 'string' && query.franchise ? query.franchise : undefined,
    service: typeof query.service === 'string' && query.service ? query.service : undefined,
    status: typeof query.status === 'string' && query.status ? query.status : undefined,
    city: typeof query.city === 'string' && query.city ? query.city : undefined,
    district: typeof query.district === 'string' && query.district ? query.district : undefined,
    state: typeof query.state === 'string' && query.state ? query.state : undefined,
    search: typeof query.search === 'string' && query.search ? query.search : undefined,
  };
}

/**
 * 1. GET /api/v1/reports/franchise-summary
 * Database-level aggregations and KPIs for franchises
 */
reportRouter.get(
  '/franchise-summary',
  asyncHandler(async (req, res) => {
    const criteria = extractCriteria(req.query);
    const data = await ReportService.getFranchiseSummary(criteria);

    const response: ApiResponse<FranchiseSummaryReport> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 2. GET /api/v1/reports/lead-metrics
 * Database-level aggregations and KPIs for leads
 */
reportRouter.get(
  '/lead-metrics',
  asyncHandler(async (req, res) => {
    const criteria = extractCriteria(req.query);
    const data = await ReportService.getLeadMetrics(criteria);

    const response: ApiResponse<LeadMetricsReport> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 3. GET /api/v1/reports/commission-metrics
 * Database-level aggregations and KPIs for commission ledger
 */
reportRouter.get(
  '/commission-metrics',
  asyncHandler(async (req, res) => {
    const criteria = extractCriteria(req.query);
    const data = await ReportService.getCommissionMetrics(criteria);

    const response: ApiResponse<CommissionMetricsReport> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 4. GET /api/v1/reports/service-metrics
 * Database-level aggregations and KPIs for services and catalog demand
 */
reportRouter.get(
  '/service-metrics',
  asyncHandler(async (req, res) => {
    const criteria = extractCriteria(req.query);
    const data = await ReportService.getServiceMetrics(criteria);

    const response: ApiResponse<ServiceMetricsReport> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 5. GET /api/v1/reports/custom/schema
 * Return available datasets, fields, and filter options for custom report builder
 */
reportRouter.get(
  '/custom/schema',
  asyncHandler(async (_req, res) => {
    const schemas = ReportService.getCustomReportDatasets();
    const response: ApiResponse<CustomReportDatasetSchema[]> = {
      success: true,
      data: schemas,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 6. POST /api/v1/reports/custom
 * Execute custom query with chosen fields, filters, and database GROUP BY/aggregations
 */
const customReportSchema = z.object({
  dataset: z.enum(['leads', 'franchises', 'commission_ledger', 'services']),
  fields: z.array(z.string()).default([]),
  filters: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      franchise: z.string().optional(),
      service: z.string().optional(),
      status: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      state: z.string().optional(),
      search: z.string().optional(),
    })
    .optional(),
  groupBy: z.string().optional(),
  aggregations: z
    .array(
      z.object({
        field: z.string(),
        func: z.enum(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']),
        alias: z.string().optional(),
      })
    )
    .optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['ASC', 'DESC']).optional(),
});

reportRouter.post(
  '/custom',
  asyncHandler(async (req, res) => {
    const parsed = customReportSchema.parse(req.body);
    const result = await ReportService.executeCustomReport(parsed as any);

    const response: ApiResponse<CustomReportResult> = {
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
 * 7. Saved Custom Reports
 */
reportRouter.get(
  '/saved',
  asyncHandler(async (_req, res) => {
    const reports = await ReportService.getSavedReports();
    res.json({
      success: true,
      data: reports,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  })
);

const saveCustomReportSchema = z.object({
  name: z.string().min(2, 'Report name is required'),
  description: z.string().optional(),
  dataset: z.enum(['leads', 'franchises', 'commission_ledger', 'services']),
  selectedFields: z.array(z.string()),
  filterCriteria: z.record(z.string(), z.any()).default({}),
  groupBy: z.string().optional(),
  aggregations: z.array(z.any()).optional(),
});

reportRouter.post(
  '/saved',
  asyncHandler(async (req, res) => {
    const parsed = saveCustomReportSchema.parse(req.body);
    const saved = await ReportService.saveCustomReport(
      parsed.name,
      parsed.description || null,
      parsed.dataset,
      parsed.selectedFields,
      parsed.filterCriteria as any,
      parsed.groupBy,
      parsed.aggregations,
      req.user?.id
    );

    res.json({
      success: true,
      data: saved,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  })
);

reportRouter.delete(
  '/saved/:id',
  asyncHandler(async (req, res) => {
    const success = await ReportService.deleteSavedReport(req.params.id);
    res.json({
      success,
      data: { deleted: success },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  })
);
