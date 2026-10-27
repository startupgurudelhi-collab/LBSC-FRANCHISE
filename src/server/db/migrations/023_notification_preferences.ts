import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration023NotificationPreferences: MigrationDefinition = {
  id: '023',
  name: '023_notification_preferences',
  up: async (db: DatabaseAdapter): Promise<void> => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Notification Preferences Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) UNIQUE NOT NULL,
        in_app_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        email_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        whatsapp_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        sms_enabled ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        category_overrides TEXT DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 2. Index for unique user_id lookups
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_pref_user
      ON notification_preferences(user_id);
    `);
  },
  down: async (db: DatabaseAdapter): Promise<void> => {
    await db.execute('DROP TABLE IF EXISTS notification_preferences;');
  },
};
