import { getDatabase } from '../db/connection.js';
import type { DatabaseTransaction } from '../types/index.js';
import type {
  NotificationModel,
  CreateNotificationDto,
  ListNotificationsFilter,
} from './types.js';
import { NotificationPreferenceService } from './preferences/preferenceService.js';
import { NotificationRouter } from './routing/notificationRouter.js';

export class NotificationService {
  /**
   * 1. Create a persistent in-app notification for a specific recipient user
   * and route eligible events to external channels respecting preferences.
   */
  static async createNotification(
    dto: CreateNotificationDto,
    txOrDb?: DatabaseTransaction
  ): Promise<NotificationModel> {
    const db = txOrDb || getDatabase();
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = new Date().toISOString();

    // Check user preferences for in-app delivery
    let inAppEnabled = true;
    try {
      const prefs = await NotificationPreferenceService.getPreferences(dto.userId);
      inAppEnabled = prefs.inAppEnabled;
    } catch {
      // Default to true on any preference query issue
      inAppEnabled = true;
    }

    // Only insert into notifications table if in-app delivery is enabled or forced
    if (inAppEnabled || dto.forceInApp) {
      await db.execute(
        `INSERT INTO notifications (
          id, user_id, organization_id, type, title, message,
          entity_type, entity_id, reference_data, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          id,
          dto.userId,
          dto.organizationId || null,
          dto.type,
          dto.title.trim(),
          dto.message.trim(),
          dto.entityType || null,
          dto.entityId || null,
          dto.referenceData ? JSON.stringify(dto.referenceData) : null,
          nowIso,
        ]
      );
    }

    const createdNotification: NotificationModel = {
      id,
      user_id: dto.userId,
      organization_id: dto.organizationId || null,
      type: dto.type,
      title: dto.title.trim(),
      message: dto.message.trim(),
      entity_type: dto.entityType || null,
      entity_id: dto.entityId || null,
      reference_data: dto.referenceData || null,
      is_read: false,
      read_at: null,
      created_at: nowIso,
    };

    // Route eligible external delivery events safely (never breaks business flow)
    if (!dto.skipExternalRouting) {
      try {
        await NotificationRouter.routeNotification(createdNotification);
      } catch (routingErr: any) {
        console.error('[NotificationService] Notification routing error (non-fatal):', routingErr?.message);
      }
    }

    return createdNotification;
  }

  /**
   * 2. Send notification to multiple users
   */
  static async notifyUsers(
    userIds: string[],
    data: Omit<CreateNotificationDto, 'userId'>
  ): Promise<void> {
    if (!userIds || userIds.length === 0) return;
    const uniqueIds = Array.from(new Set(userIds));
    for (const uid of uniqueIds) {
      try {
        await this.createNotification({ ...data, userId: uid });
      } catch (err: any) {
        console.error(`Failed to deliver notification to user ${uid}:`, err?.message);
      }
    }
  }

  /**
   * 3. Notify all users belonging to a franchise organization
   */
  static async notifyOrganization(
    orgId: string,
    data: Omit<CreateNotificationDto, 'userId' | 'organizationId'>
  ): Promise<void> {
    const db = getDatabase();
    const users = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE organization_id = ? AND status = 'active'`,
      [orgId]
    );
    const userIds = users.map((u) => u.id);
    await this.notifyUsers(userIds, { ...data, organizationId: orgId });
  }

  /**
   * 4. Notify all Super Administrators
   */
  static async notifySuperAdmins(
    data: Omit<CreateNotificationDto, 'userId'>
  ): Promise<void> {
    const db = getDatabase();
    const admins = await db.query<{ id: string }>(
      `SELECT DISTINCT u.id 
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'super_admin' AND u.status = 'active'`
    );
    const adminIds = admins.map((a) => a.id);
    await this.notifyUsers(adminIds, data);
  }

  /**
   * 5. Get list of notifications for a recipient user (with pagination and filters)
   */
  static async getNotifications(
    userId: string,
    filter: ListNotificationsFilter = {}
  ): Promise<{ notifications: NotificationModel[]; total: number; unreadCount: number }> {
    const db = getDatabase();
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [userId];

    if (filter.isRead !== undefined) {
      conditions.push('is_read = ?');
      params.push(filter.isRead ? 1 : 0);
    }

    if (filter.type) {
      conditions.push('type = ?');
      params.push(filter.type);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Total filtered count
    const countRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notifications ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.cnt || 0);

    // Total unread count for user
    const unreadRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    const unreadCount = Number(unreadRows[0]?.cnt || 0);

    // Pagination
    const limit = Math.max(1, Math.min(100, filter.limit || 50));
    const offset = Math.max(0, filter.offset || 0);

    const rows = await db.query<any>(
      `SELECT * FROM notifications 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const notifications: NotificationModel[] = rows.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      organization_id: r.organization_id || null,
      type: r.type,
      title: r.title,
      message: r.message,
      entity_type: r.entity_type || null,
      entity_id: r.entity_id || null,
      reference_data: r.reference_data ? JSON.parse(r.reference_data) : null,
      is_read: Boolean(r.is_read),
      read_at: r.read_at || null,
      created_at: r.created_at,
    }));

    return { notifications, total, unreadCount };
  }

  /**
   * 6. Get unread count for user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const db = getDatabase();
    const rows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    return Number(rows[0]?.cnt || 0);
  }

  /**
   * 7. Mark single notification as read
   */
  static async markAsRead(id: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();

    const res = await db.execute(
      `UPDATE notifications 
       SET is_read = 1, read_at = ? 
       WHERE id = ? AND user_id = ?`,
      [nowIso, id, userId]
    );

    const affected = res.rowsAffected !== undefined ? res.rowsAffected : (res as any).rowCount || 0;
    return affected > 0;
  }

  /**
   * 8. Mark all unread notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<number> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();

    const res = await db.execute(
      `UPDATE notifications 
       SET is_read = 1, read_at = ? 
       WHERE user_id = ? AND is_read = 0`,
      [nowIso, userId]
    );

    return res.rowsAffected !== undefined ? res.rowsAffected : (res as any).rowCount || 0;
  }
}
