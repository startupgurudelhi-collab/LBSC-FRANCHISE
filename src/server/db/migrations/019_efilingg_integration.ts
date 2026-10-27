import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration019EfilinggIntegration: MigrationDefinition = {
  id: '019',
  name: '019_efilingg_integration',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Add dedicated Efilingg & Government filing reference columns to service_applications
    if (isSqlite) {
      const tableInfo = await db.query<any>("PRAGMA table_info('service_applications')");
      const columnNames = tableInfo.map((col: any) => col.name);

      if (!columnNames.includes('external_filing_id')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN external_filing_id VARCHAR(128) DEFAULT NULL');
      }
      if (!columnNames.includes('arn_number')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN arn_number VARCHAR(128) DEFAULT NULL');
      }
      if (!columnNames.includes('srn_number')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN srn_number VARCHAR(128) DEFAULT NULL');
      }
      if (!columnNames.includes('challan_number')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN challan_number VARCHAR(128) DEFAULT NULL');
      }
      if (!columnNames.includes('efilingg_status')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN efilingg_status VARCHAR(64) DEFAULT NULL');
      }
      if (!columnNames.includes('efilingg_synced_at')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN efilingg_synced_at DATETIME DEFAULT NULL');
      }
      if (!columnNames.includes('efilingg_sync_error')) {
        await db.execute('ALTER TABLE service_applications ADD COLUMN efilingg_sync_error TEXT DEFAULT NULL');
      }
    } else {
      await db.execute(`
        ALTER TABLE service_applications 
        ADD COLUMN IF NOT EXISTS external_filing_id VARCHAR(128) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS arn_number VARCHAR(128) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS srn_number VARCHAR(128) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS challan_number VARCHAR(128) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS efilingg_status VARCHAR(64) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS efilingg_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS efilingg_sync_error TEXT DEFAULT NULL;
      `);
    }

    // 2. Query indices for fast lookup by external filing IDs and government references
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_external_filing_id ON service_applications(external_filing_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_arn_number ON service_applications(arn_number);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_srn_number ON service_applications(srn_number);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sa_efilingg_status ON service_applications(efilingg_status);');
  },
  down: async (_db: DatabaseAdapter) => {
    // In SQLite, dropping columns requires table recreation, so down migration is a no-op safe rollback
  },
};
