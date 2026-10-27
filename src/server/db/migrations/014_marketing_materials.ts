import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration014MarketingMaterials: MigrationDefinition = {
  id: '014',
  name: '014_marketing_materials',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Marketing Materials Table
    // Stores metadata, categorization, publish status, and durable file content/URL
    await db.execute(`
      CREATE TABLE IF NOT EXISTS marketing_materials (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        material_type VARCHAR(64) NOT NULL,
        file_name VARCHAR(255) DEFAULT NULL,
        file_type VARCHAR(128) DEFAULT NULL,
        file_size INTEGER DEFAULT NULL,
        file_url TEXT DEFAULT NULL,
        file_data TEXT DEFAULT NULL,
        is_published ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        is_archived ${isSqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'BOOLEAN NOT NULL DEFAULT FALSE'},
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Marketing Material to Service Mapping Table (Many-to-Many)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS marketing_material_services (
        id VARCHAR(64) PRIMARY KEY,
        material_id VARCHAR(64) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (material_id) REFERENCES marketing_materials(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE CASCADE,
        UNIQUE (material_id, service_id)
      );
    `);

    // 3. Performance & Lookup Indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_marketing_published ON marketing_materials(is_published);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_marketing_archived ON marketing_materials(is_archived);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_marketing_type ON marketing_materials(material_type);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_marketing_created ON marketing_materials(created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_mms_material ON marketing_material_services(material_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_mms_service ON marketing_material_services(service_id);`);
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS marketing_material_services;`);
    await db.execute(`DROP TABLE IF EXISTS marketing_materials;`);
  },
};
