import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { TicketService } from '../tickets/ticketService.js';
import { BadRequestError } from '../errors/AppError.js';
import type { ApiResponse } from '../types/index.js';
import type { Ticket, TicketDetail, TicketMessage, TicketStats } from '../tickets/types.js';

export const ticketRouter = Router();

// All ticket endpoints require authentication
ticketRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const createTicketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().min(5, 'Description must be at least 5 characters').max(5000),
  category: z.enum([
    'technical',
    'commission_billing',
    'lead_dispute',
    'service_inquiry',
    'general',
  ]),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  organizationId: z.string().optional(),
});

const addMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000),
  is_internal: z.boolean().optional().default(false),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

const updatePrioritySchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});

const assignTicketSchema = z.object({
  assignedToUserId: z.string().nullable(),
});

// ==========================================
// TICKET ENDPOINTS
// ==========================================

/**
 * 1. POST /api/v1/tickets
 * Raise a support ticket (Franchise Owner/Staff or Super Admin)
 */
ticketRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parseResult = createTicketSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid ticket data');
    }

    const ticket = await TicketService.createTicket(parseResult.data, req.user!);
    const response: ApiResponse<Ticket> = {
      success: true,
      data: ticket,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 2. GET /api/v1/tickets
 * List tickets with filtering, search, and strict tenant isolation
 */
ticketRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const criteria = {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      franchiseId: typeof req.query.franchiseId === 'string' ? req.query.franchiseId : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await TicketService.listTickets(criteria, req.user!);
    const response: ApiResponse<Ticket[]> = {
      success: true,
      data: result.tickets,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    };
    res.json(response);
  })
);

/**
 * 3. GET /api/v1/tickets/stats
 * Get overview counters (Open, In Progress, Resolved, Closed, Urgent)
 */
ticketRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const franchiseId = typeof req.query.franchiseId === 'string' ? req.query.franchiseId : undefined;
    const stats = await TicketService.getStats(req.user!, franchiseId);
    const response: ApiResponse<TicketStats> = {
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 4. GET /api/v1/tickets/assignees
 * Get list of assignable administrators (Super Admin / Support)
 */
ticketRouter.get(
  '/assignees',
  asyncHandler(async (req, res) => {
    const assignees = await TicketService.getAssignees();
    const response: ApiResponse<typeof assignees> = {
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
 * 5. GET /api/v1/tickets/:id
 * Get single ticket details and timeline messages
 */
ticketRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await TicketService.getTicketById(req.params.id, req.user!);
    const response: ApiResponse<TicketDetail> = {
      success: true,
      data: ticket,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 6. POST /api/v1/tickets/:id/messages
 * Add a public reply or internal admin note
 */
ticketRouter.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const parseResult = addMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid message data');
    }

    const message = await TicketService.addMessage(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<TicketMessage> = {
      success: true,
      data: message,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 7. PATCH /api/v1/tickets/:id/status
 * Transition ticket lifecycle status
 */
ticketRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid status');
    }

    const ticket = await TicketService.updateStatus(req.params.id, parseResult.data.status, req.user!);
    const response: ApiResponse<Ticket> = {
      success: true,
      data: ticket,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 8. PATCH /api/v1/tickets/:id/priority
 * Update ticket priority level (Super Admin only)
 */
ticketRouter.patch(
  '/:id/priority',
  asyncHandler(async (req, res) => {
    const parseResult = updatePrioritySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid priority');
    }

    const ticket = await TicketService.updatePriority(req.params.id, parseResult.data.priority, req.user!);
    const response: ApiResponse<Ticket> = {
      success: true,
      data: ticket,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 9. PATCH /api/v1/tickets/:id/assign
 * Assign ticket to a support administrator (Super Admin only)
 */
ticketRouter.patch(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const parseResult = assignTicketSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid assignment data');
    }

    const ticket = await TicketService.assignTicket(req.params.id, parseResult.data.assignedToUserId, req.user!);
    const response: ApiResponse<Ticket> = {
      success: true,
      data: ticket,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);
