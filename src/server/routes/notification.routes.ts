import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../auth/authMiddleware.js';
import { NotificationService } from '../notifications/notificationService.js';
import { NotificationPreferenceService } from '../notifications/preferences/preferenceService.js';
import type { ApiResponse } from '../types/index.js';
import type { UserNotificationPreferences } from '../notifications/preferences/preferenceTypes.js';

export const notificationRouter = Router();

// All notification routes require authentication
notificationRouter.use(authenticate);

/**
 * 1. GET /api/v1/notifications
 * List notifications for the authenticated user
 */
notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const isRead = req.query.is_read !== undefined 
      ? req.query.is_read === 'true' || req.query.is_read === '1' 
      : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await NotificationService.getNotifications(user.id, {
      isRead,
      type,
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
 * 2. GET /api/v1/notifications/unread-count
 * Get count of unread notifications for authenticated user
 */
notificationRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const unreadCount = await NotificationService.getUnreadCount(user.id);

    const response: ApiResponse<{ unreadCount: number }> = {
      success: true,
      data: { unreadCount },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 3. PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read
 */
notificationRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { id } = req.params;

    const marked = await NotificationService.markAsRead(id, user.id);

    const response: ApiResponse<{ marked: boolean }> = {
      success: true,
      data: { marked },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 4. POST /api/v1/notifications/mark-all-read
 * Mark all notifications as read for authenticated user
 */
notificationRouter.post(
  '/mark-all-read',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const updatedCount = await NotificationService.markAllAsRead(user.id);

    const response: ApiResponse<{ markedCount: number }> = {
      success: true,
      data: { markedCount: updatedCount },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 5. GET /api/v1/notifications/preferences
 * Get notification preferences for authenticated user
 */
notificationRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const preferences = await NotificationPreferenceService.getPreferences(user.id);

    const response: ApiResponse<UserNotificationPreferences> = {
      success: true,
      data: preferences,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 6. PUT /api/v1/notifications/preferences
 * Update notification preferences for authenticated user
 */
notificationRouter.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { inAppEnabled, emailEnabled, whatsappEnabled, smsEnabled, categoryOverrides } = req.body;

    const updated = await NotificationPreferenceService.updatePreferences(user.id, {
      inAppEnabled: typeof inAppEnabled === 'boolean' ? inAppEnabled : undefined,
      emailEnabled: typeof emailEnabled === 'boolean' ? emailEnabled : undefined,
      whatsappEnabled: typeof whatsappEnabled === 'boolean' ? whatsappEnabled : undefined,
      smsEnabled: typeof smsEnabled === 'boolean' ? smsEnabled : undefined,
      categoryOverrides: categoryOverrides !== undefined ? categoryOverrides : undefined,
    });

    const response: ApiResponse<UserNotificationPreferences> = {
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

