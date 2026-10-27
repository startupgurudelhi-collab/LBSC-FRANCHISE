import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration018NotificationsBackgroundJobs: MigrationDefinition = {
  id: '018',
  name: '018_notifications_background_jobs',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. In-App Notifications table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        organization_id VARCHAR(64) DEFAULT NULL,
        type VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        entity_type VARCHAR(64) DEFAULT NULL,
        entity_id VARCHAR(64) DEFAULT NULL,
        reference_data TEXT DEFAULT NULL,
        is_read ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'BOOLEAN NOT NULL DEFAULT FALSE'},
        read_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );
    `);

    // Indexes for notifications
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
      ON notifications(user_id, is_read);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
      ON notifications(user_id, created_at);
    `);

    // 2. Background Jobs execution history table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id VARCHAR(64) PRIMARY KEY,
        job_name VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
        trigger_type VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
        run_key VARCHAR(128) DEFAULT NULL,
        started_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        completed_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        duration_ms INTEGER DEFAULT NULL,
        summary TEXT DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Indexes for background jobs
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_background_jobs_name_status 
      ON background_jobs(job_name, status);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_background_jobs_started_at 
      ON background_jobs(started_at);
    `);

    // 3. Distributed Job Locks table (DB-backed, concurrency protection without Redis)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_locks (
        lock_name VARCHAR(64) PRIMARY KEY,
        locked_by VARCHAR(64) NOT NULL,
        locked_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        expires_at ${isSqlite ? 'DATETIME NOT NULL' : 'TIMESTAMP WITH TIME ZONE NOT NULL'}
      );
    `);
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS job_locks;');
    await db.execute('DROP TABLE IF EXISTS background_jobs;');
    await db.execute('DROP TABLE IF EXISTS notifications;');
  },
};
