import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration020LeadIntakeGateway: MigrationDefinition = {
  id: '020',
  name: '020_lead_intake_gateway',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Lead Intake Idempotency & Deduplication Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS lead_intake_idempotency (
        id VARCHAR(64) PRIMARY KEY,
        idempotency_key VARCHAR(128) UNIQUE NOT NULL,
        lead_id VARCHAR(64) NOT NULL,
        source VARCHAR(64) NOT NULL,
        source_reference VARCHAR(128) DEFAULT NULL,
        customer_phone_normalized VARCHAR(32) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        response_status VARCHAR(32) NOT NULL DEFAULT 'processed',
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE RESTRICT
      );
    `);

    // Indices for rapid deduplication lookup
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_idem_key ON lead_intake_idempotency(idempotency_key);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_idem_phone_srv ON lead_intake_idempotency(customer_phone_normalized, service_id, created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_idem_lead_id ON lead_intake_idempotency(lead_id);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS lead_intake_idempotency;`);
  },
};
