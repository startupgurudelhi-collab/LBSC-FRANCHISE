import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration009ClientDirectory: MigrationDefinition = {
  id: '009',
  name: '009_client_directory',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Clients Table (Franchise Client Directory)
    // Stores customer/client relationship details strictly linked to franchise organization
    await db.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(64) PRIMARY KEY,
        client_number VARCHAR(64) UNIQUE NOT NULL,
        franchise_id VARCHAR(64) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL DEFAULT '',
        full_name VARCHAR(200) NOT NULL,
        email VARCHAR(128) DEFAULT NULL,
        phone VARCHAR(32) NOT NULL,
        alternate_phone VARCHAR(32) DEFAULT NULL,
        business_name VARCHAR(200) DEFAULT NULL,
        pan VARCHAR(32) DEFAULT NULL,
        gstin VARCHAR(32) DEFAULT NULL,
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        pin VARCHAR(32) DEFAULT NULL,
        address TEXT DEFAULT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'archived'
        source VARCHAR(64) NOT NULL DEFAULT 'direct', -- 'direct', 'lead', 'referral', 'walk_in', 'other'
        initial_lead_id VARCHAR(64) DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        tags TEXT DEFAULT NULL,
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        updated_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (franchise_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (initial_lead_id) REFERENCES leads(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Indices for search and multi-tenancy filtering
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_franchise ON clients(franchise_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_number ON clients(client_number);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);`);

    // 2. Add client_id column to leads table if not present to establish relationship
    const tableInfo = await db.query<any>(
      isSqlite
        ? `PRAGMA table_info(leads);`
        : `SELECT column_name as name FROM information_schema.columns WHERE table_name = 'leads';`
    );
    const hasClientIdCol = tableInfo.some((col: any) => col.name === 'client_id');

    if (!hasClientIdCol) {
      await db.execute(`
        ALTER TABLE leads
        ADD COLUMN client_id VARCHAR(64) DEFAULT NULL REFERENCES clients(id) ON DELETE SET NULL;
      `);
    }

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS clients;`);
  },
};
