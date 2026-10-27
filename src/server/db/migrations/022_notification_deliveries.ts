import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration022NotificationDeliveries: MigrationDefinition = {
  id: '022',
  name: '022_notification_deliveries',
  up: async (db: DatabaseAdapter): Promise<void> => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Notification Deliveries Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id VARCHAR(64) PRIMARY KEY,
        idempotency_key VARCHAR(128) UNIQUE NOT NULL,
        channel VARCHAR(32) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        provider VARCHAR(64) DEFAULT NULL,
        provider_message_id VARCHAR(128) DEFAULT NULL,
        subject VARCHAR(255) DEFAULT NULL,
        body TEXT NOT NULL,
        error TEXT DEFAULT NULL,
        metadata TEXT DEFAULT NULL,
        organization_id VARCHAR(64) DEFAULT NULL,
        user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        sent_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Indexes for notification deliveries
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_deliv_idempotency
      ON notification_deliveries(idempotency_key);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notif_deliv_channel_status
      ON notification_deliveries(channel, status);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notif_deliv_org
      ON notification_deliveries(organization_id);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notif_deliv_user
      ON notification_deliveries(user_id);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notif_deliv_recipient
      ON notification_deliveries(recipient);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notif_deliv_created
      ON notification_deliveries(created_at);
    `);
  },
  down: async (db: DatabaseAdapter): Promise<void> => {
    await db.execute('DROP TABLE IF EXISTS notification_deliveries;');
  },
};
