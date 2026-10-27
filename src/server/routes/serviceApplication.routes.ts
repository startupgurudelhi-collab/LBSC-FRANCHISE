import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { BadRequestError } from '../errors/AppError.js';
import { ServiceApplicationService } from '../serviceApplications/serviceApplicationService.js';
import {
  validateDocumentUrlForRedirect,
  detectFileTypeFromMagicBytes,
} from '../serviceApplications/documentSecurity.js';
import type { ApiResponse } from '../types/index.js';
import type {
  ServiceApplication,
  ServiceApplicationDocument,
  ServiceApplicationStatus,
  ServiceApplicationWorkNote,
  WorkQueueSummary,
  AssigneeOption,
} from '../serviceApplications/types.js';

export const serviceApplicationRouter = Router();

// All service application routes require authentication
serviceApplicationRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const createApplicationSchema = z.object({
  client_id: z.string().min(1, 'Client ID is required'),
  service_id: z.string().min(1, 'Service ID is required'),
  franchise_id: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
  custom_fields: z.record(z.string(), z.any()).optional().nullable(),
  notes: z.string().max(3000).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const updateApplicationSchema = z.object({
  custom_fields: z.record(z.string(), z.any()).optional().nullable(),
  notes: z.string().max(3000).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'ACTION_REQUIRED',
    'REJECTED',
    'APPROVED',
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
  ]),
  reason: z.string().max(1000).optional().nullable(),
});

const assignWorkSchema = z.object({
  assigned_to_user_id: z.string().min(1, 'Assignee user ID is required'),
  assignment_notes: z.string().max(2000).optional().nullable(),
  move_to_assigned_status: z.boolean().optional(),
});

const reassignWorkSchema = z.object({
  assigned_to_user_id: z.string().min(1, 'Assignee user ID is required'),
  reassignment_notes: z.string().max(2000).optional().nullable(),
  move_to_assigned_status: z.boolean().optional(),
});

const addWorkNoteSchema = z.object({
  note: z.string().min(1, 'Note content is required').max(5000),
  note_type: z.enum(['work_note', 'status_change', 'system']).optional(),
});

const uploadDocumentSchema = z.object({
  file_name: z.string().min(1, 'File name is required').max(255),
  file_type: z.string().max(128).optional().nullable(),
  file_size: z.number().int().nonnegative().optional().nullable(),
  file_url: z.string().max(2000).optional().nullable(),
  file_data: z.string().optional().nullable(),
});

const rejectDocumentSchema = z.object({
  rejection_reason: z.string().min(3, 'Rejection reason must be at least 3 characters').max(1000),
});

// ==========================================
// ROUTES
// ==========================================

/**
 * 1. GET /api/v1/service-applications/work-queue/summary
 * Operational work queue KPI summary metrics (Super Admin or Franchise scoped)
 */
serviceApplicationRouter.get(
  '/work-queue/summary',
  asyncHandler(async (req, res) => {
    const summary = await ServiceApplicationService.getWorkQueueSummary(req.user!);
    const response: ApiResponse<WorkQueueSummary> = {
      success: true,
      data: summary,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 2. GET /api/v1/service-applications/work-queue
 * Admin operational work queue with assignment, priority, status, search, and SLA filters
 */
serviceApplicationRouter.get(
  '/work-queue',
  asyncHandler(async (req, res) => {
    const filters = {
      assignment_status: (req.query.assignment_status as any) || 'all',
      assigned_to_user_id: typeof req.query.assigned_to_user_id === 'string' ? req.query.assigned_to_user_id : undefined,
      priority: (req.query.priority as any) || 'all',
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      sla_status: (req.query.sla_status as any) || 'all',
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      franchise_id: typeof req.query.franchise_id === 'string' ? req.query.franchise_id : undefined,
      service_id: typeof req.query.service_id === 'string' ? req.query.service_id : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      sort_by: (req.query.sort_by as any) || 'created_at',
      sort_order: (req.query.sort_order as any) || 'desc',
    };

    const result = await ServiceApplicationService.getWorkQueue(filters, req.user!);
    const response: ApiResponse<ServiceApplication[]> = {
      success: true,
      data: result.applications,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit) || 1,
        },
      },
    };
    res.json(response);
  })
);

/**
 * 3. GET /api/v1/service-applications/assignees
 * List available specialists / staff members for work assignment (Super Admin only)
 */
serviceApplicationRouter.get(
  '/assignees',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const assignees = await ServiceApplicationService.getAssignees(req.user!);
    const response: ApiResponse<AssigneeOption[]> = {
      success: true,
      data: assignees,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 4. GET /api/v1/service-applications
 * List service applications with filters and multi-tenant isolation
 */
serviceApplicationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      franchise_id: typeof req.query.franchise_id === 'string' ? req.query.franchise_id : undefined,
      client_id: typeof req.query.client_id === 'string' ? req.query.client_id : undefined,
      service_id: typeof req.query.service_id === 'string' ? req.query.service_id : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      commission_status:
        typeof req.query.commission_status === 'string' ? req.query.commission_status : undefined,
      assigned_to_user_id:
        typeof req.query.assigned_to_user_id === 'string' ? req.query.assigned_to_user_id : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await ServiceApplicationService.listApplications(filters, req.user!);
    const response: ApiResponse<ServiceApplication[]> = {
      success: true,
      data: result.applications,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit) || 1,
        },
      },
    };
    res.json(response);
  })
);

/**
 * 2. GET /api/v1/service-applications/:id
 * Get single service application by ID with full details and required documents
 */
serviceApplicationRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const application = await ServiceApplicationService.getApplicationById(req.params.id, req.user!);
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 3. POST /api/v1/service-applications
 * Create a new service application (DRAFT or SUBMITTED)
 */
serviceApplicationRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parseResult = createApplicationSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid application input');
    }

    const application = await ServiceApplicationService.createApplication(parseResult.data, req.user!);
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 4. PATCH /api/v1/service-applications/:id
 * Update service application metadata (custom fields, notes, priority)
 */
serviceApplicationRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parseResult = updateApplicationSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid update input');
    }

    const application = await ServiceApplicationService.updateApplication(
      req.params.id,
      parseResult.data,
      req.user!
    );
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 5. POST /api/v1/service-applications/:id/submit
 * Submit application (DRAFT -> SUBMITTED or ACTION_REQUIRED -> SUBMITTED)
 * Snapshots fee and commission value
 */
serviceApplicationRouter.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const application = await ServiceApplicationService.submitApplication(req.params.id, req.user!);
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 6. PATCH /api/v1/service-applications/:id/status
 * Transition application status
 */
serviceApplicationRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid status update input');
    }

    const application = await ServiceApplicationService.updateStatus(
      req.params.id,
      parseResult.data.status as ServiceApplicationStatus,
      parseResult.data.reason,
      req.user!
    );
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7. POST /api/v1/service-applications/:id/assign
 * Basic work assignment for approved applications (Super Admin only)
 */
serviceApplicationRouter.post(
  '/:id/assign',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = assignWorkSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid assignment input');
    }

    const application = await ServiceApplicationService.assignWork(
      req.params.id,
      parseResult.data,
      req.user!
    );
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7b. POST /api/v1/service-applications/:id/reassign
 * Reassign work to a different specialist (Super Admin only)
 */
serviceApplicationRouter.post(
  '/:id/reassign',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = reassignWorkSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid reassignment input');
    }

    const application = await ServiceApplicationService.reassignWork(
      req.params.id,
      parseResult.data,
      req.user!
    );
    const response: ApiResponse<ServiceApplication> = {
      success: true,
      data: application,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7c. GET /api/v1/service-applications/:id/work-notes
 * Get work notes & operational history (Franchise can view only for its own applications)
 */
serviceApplicationRouter.get(
  '/:id/work-notes',
  asyncHandler(async (req, res) => {
    const notes = await ServiceApplicationService.getWorkNotes(req.params.id, req.user!);
    const response: ApiResponse<ServiceApplicationWorkNote[]> = {
      success: true,
      data: notes,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7d. POST /api/v1/service-applications/:id/work-notes
 * Add an operational work note (Super Admin, assigned specialist, or franchise owner)
 */
serviceApplicationRouter.post(
  '/:id/work-notes',
  asyncHandler(async (req, res) => {
    const parseResult = addWorkNoteSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid work note input');
    }

    const note = await ServiceApplicationService.addWorkNote(
      req.params.id,
      parseResult.data,
      req.user!
    );
    const response: ApiResponse<ServiceApplicationWorkNote> = {
      success: true,
      data: note,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 8. POST /api/v1/service-applications/:id/release-commission
 * Explicit commission release by Super Admin after completion.
 * Enforces status === COMPLETED.
 * Idempotent: safe against duplicate calls.
 * Credits franchise account with snapshotted commission value and creates immutable ledger entry.
 */
serviceApplicationRouter.post(
  '/:id/release-commission',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const result = await ServiceApplicationService.releaseCommission(req.params.id, req.user!, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const response: ApiResponse<{
      application: ServiceApplication;
      ledger_entry_id: string;
      ledger_reference_id: string;
      amount: number;
      already_released: boolean;
      message: string;
    }> = {
      success: true,
      data: {
        application: result.application,
        ledger_entry_id: result.ledgerEntryId,
        ledger_reference_id: result.ledgerReferenceId,
        amount: result.amount,
        already_released: result.alreadyReleased,
        message: result.alreadyReleased
          ? `Commission of ₹${result.amount.toFixed(2)} was already released previously (Ref: ${result.ledgerReferenceId})`
          : `Commission of ₹${result.amount.toFixed(2)} released successfully (Ledger Ref: ${result.ledgerReferenceId})`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

// ==========================================
// DOCUMENT MANAGEMENT SUB-ROUTES
// ==========================================

/**
 * 9. POST /api/v1/service-applications/:id/documents/:docId/upload
 * Upload document file asset (Franchise or Admin)
 */
serviceApplicationRouter.post(
  '/:id/documents/:docId/upload',
  asyncHandler(async (req, res) => {
    const parseResult = uploadDocumentSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid document upload data');
    }

    const document = await ServiceApplicationService.uploadDocument(
      req.params.id,
      req.params.docId,
      parseResult.data,
      req.user!
    );
    const response: ApiResponse<ServiceApplicationDocument> = {
      success: true,
      data: document,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 10. PATCH /api/v1/service-applications/:id/documents/:docId/verify
 * Verify an uploaded document (Super Admin only)
 */
serviceApplicationRouter.patch(
  '/:id/documents/:docId/verify',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const document = await ServiceApplicationService.verifyDocument(
      req.params.id,
      req.params.docId,
      req.user!
    );
    const response: ApiResponse<ServiceApplicationDocument> = {
      success: true,
      data: document,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 11. PATCH /api/v1/service-applications/:id/documents/:docId/reject
 * Reject an uploaded document with reason (Super Admin only)
 */
serviceApplicationRouter.patch(
  '/:id/documents/:docId/reject',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = rejectDocumentSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Rejection reason is required');
    }

    const document = await ServiceApplicationService.rejectDocument(
      req.params.id,
      req.params.docId,
      parseResult.data.rejection_reason,
      req.user!
    );
    const response: ApiResponse<ServiceApplicationDocument> = {
      success: true,
      data: document,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 12. GET /api/v1/service-applications/:id/documents/:docId/download
 * Download/stream document file asset
 */
serviceApplicationRouter.get(
  '/:id/documents/:docId/download',
  asyncHandler(async (req, res) => {
    const doc = await ServiceApplicationService.getDocumentById(
      req.params.id,
      req.params.docId,
      req.user!,
      true // include file_data
    );

    if (doc.file_data) {
      let base64Content = doc.file_data;
      let contentType = doc.file_type || 'application/octet-stream';

      if (base64Content.startsWith('data:')) {
        const matches = base64Content.match(/^data:([^;]+);base64,(.+)$/s);
        if (matches) {
          contentType = matches[1];
          base64Content = matches[2];
        }
      }

      const cleanBase64 = base64Content.replace(/\s+/g, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');
      
      const detectedMime = detectFileTypeFromMagicBytes(fileBuffer);
      if (!detectedMime) {
        throw new BadRequestError('Document file content is corrupted or invalid format');
      }
      contentType = detectedMime;

      const filename = doc.file_name || `document-${doc.id}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      res.send(fileBuffer);
      return;
    }

    if (doc.file_url) {
      const safeUrl = validateDocumentUrlForRedirect(doc.file_url);
      res.redirect(safeUrl);
      return;
    }

    throw new BadRequestError('No downloadable asset available for this document');
  })
);
