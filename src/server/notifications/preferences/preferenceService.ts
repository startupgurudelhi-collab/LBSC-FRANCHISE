import { getDatabase } from '../../db/connection.js';
import type { UserNotificationPreferences, UpdatePreferencesDto } from './preferenceTypes.js';

export class NotificationPreferenceService {
  /**
   * Default notification preferences for users who have not customized them yet
   */
  static getDefaultPreferences(userId: string): UserNotificationPreferences {
    return {
      userId,
      inAppEnabled: true,
      emailEnabled: true,
      whatsappEnabled: true,
      smsEnabled: true,
      categoryOverrides: null,
    };
  }

  /**
   * Fetch notification preferences for a user (returns default if not customized)
   */
  static async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    const db = getDatabase();
    const rows = await db.query<any>(
      `SELECT * FROM notification_preferences WHERE user_id = ?`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return this.getDefaultPreferences(userId);
    }

    const row = rows[0];
    return {
      userId: row.user_id,
      inAppEnabled: Boolean(row.in_app_enabled),
      emailEnabled: Boolean(row.email_enabled),
      whatsappEnabled: Boolean(row.whatsapp_enabled),
      smsEnabled: Boolean(row.sms_enabled),
      categoryOverrides: row.category_overrides ? JSON.parse(row.category_overrides) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update or insert notification preferences for a user
   */
  static async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto
  ): Promise<UserNotificationPreferences> {
    const db = getDatabase();
    const current = await this.getPreferences(userId);
    const nowIso = new Date().toISOString();

    const inAppEnabled = dto.inAppEnabled !== undefined ? dto.inAppEnabled : current.inAppEnabled;
    const emailEnabled = dto.emailEnabled !== undefined ? dto.emailEnabled : current.emailEnabled;
    const whatsappEnabled = dto.whatsappEnabled !== undefined ? dto.whatsappEnabled : current.whatsappEnabled;
    const smsEnabled = dto.smsEnabled !== undefined ? dto.smsEnabled : current.smsEnabled;
    const categoryOverrides =
      dto.categoryOverrides !== undefined ? dto.categoryOverrides : current.categoryOverrides;

    const existingRows = await db.query<any>(
      `SELECT id FROM notification_preferences WHERE user_id = ?`,
      [userId]
    );

    if (existingRows.length > 0) {
      await db.execute(
        `UPDATE notification_preferences
         SET in_app_enabled = ?,
             email_enabled = ?,
             whatsapp_enabled = ?,
             sms_enabled = ?,
             category_overrides = ?,
             updated_at = ?
         WHERE user_id = ?`,
        [
          inAppEnabled ? 1 : 0,
          emailEnabled ? 1 : 0,
          whatsappEnabled ? 1 : 0,
          smsEnabled ? 1 : 0,
          categoryOverrides ? JSON.stringify(categoryOverrides) : null,
          nowIso,
          userId,
        ]
      );
    } else {
      const id = `np_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await db.execute(
        `INSERT INTO notification_preferences (
          id, user_id, in_app_enabled, email_enabled, whatsapp_enabled, sms_enabled,
          category_overrides, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          inAppEnabled ? 1 : 0,
          emailEnabled ? 1 : 0,
          whatsappEnabled ? 1 : 0,
          smsEnabled ? 1 : 0,
          categoryOverrides ? JSON.stringify(categoryOverrides) : null,
          nowIso,
          nowIso,
        ]
      );
    }

    return {
      userId,
      inAppEnabled,
      emailEnabled,
      whatsappEnabled,
      smsEnabled,
      categoryOverrides,
      updatedAt: nowIso,
    };
  }

  /**
   * Reset preferences for a user back to defaults
   */
  static async resetPreferences(userId: string): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `DELETE FROM notification_preferences WHERE user_id = ?`,
      [userId]
    );
  }
}
