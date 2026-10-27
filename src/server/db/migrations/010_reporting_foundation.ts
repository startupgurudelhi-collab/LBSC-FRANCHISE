import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration010ReportingFoundation: MigrationDefinition = {
  id: '010',
  name: '010_reporting_foundation',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Saved Custom Reports table for Super Admin custom reporting definitions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS saved_custom_reports (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        dataset VARCHAR(64) NOT NULL,
        selected_fields TEXT NOT NULL, -- JSON array of field IDs
        filter_criteria TEXT NOT NULL, -- JSON object of filters
        group_by VARCHAR(64) DEFAULT NULL,
        aggregations TEXT DEFAULT NULL, -- JSON array of aggregations
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. High-performance composite indexes for report filters and aggregations
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_leads_report_filter ON leads(created_at, status, service_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_leads_geo_filter ON leads(state, district, city);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_comm_ledger_report ON commission_ledger_entries(created_at, entry_type, organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_camp_status ON franchise_campaigns(status, organization_id);`);
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS saved_custom_reports;`);
  },
};
