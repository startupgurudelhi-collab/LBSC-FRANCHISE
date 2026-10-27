import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration016WorkAssignmentOperations: MigrationDefinition = {
  id: '016',
  name: '016_work_assignment_operations',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Add SLA & Operational tracking columns to service_applications if not existing
    if (isSqlite) {
      const tableInfo = await db.query<any>("PRAGMA table_info('service_applications')");
      const columnNames = tableInfo.map((col: any) => col.name);

      if (!columnNames.includes('sla_due_at')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN sla_due_at DATETIME DEFAULT NULL');
      }
      if (!columnNames.includes('last_reassigned_at')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN last_reassigned_at DATETIME DEFAULT NULL');
      }
      if (!columnNames.includes('reassigned_count')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN reassigned_count INTEGER DEFAULT 0');
      }
    } else {
      await db.execute(`
        ALTER TABLE service_applications 
        ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_reassigned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS reassigned_count INTEGER DEFAULT 0;
      `);
    }

    // 2. Operational Work Notes & Activity History Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS service_application_work_notes (
        id VARCHAR(64) PRIMARY KEY,
        application_id VARCHAR(64) NOT NULL,
        author_user_id VARCHAR(64) NOT NULL,
        note_type VARCHAR(32) NOT NULL DEFAULT 'work_note',
        note TEXT NOT NULL,
        metadata TEXT DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},

        FOREIGN KEY (application_id) REFERENCES service_applications(id) ON DELETE CASCADE,
        FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 3. Performance indices for operational queue querying
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_work_notes_app_id ON service_application_work_notes(application_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_work_notes_created_at ON service_application_work_notes(created_at);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_work_notes_author ON service_application_work_notes(author_user_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_work_queue_assigned ON service_applications(assigned_to_user_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_work_queue_sla ON service_applications(sla_due_at);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_work_queue_priority ON service_applications(priority);');
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS service_application_work_notes;');
  },
};
