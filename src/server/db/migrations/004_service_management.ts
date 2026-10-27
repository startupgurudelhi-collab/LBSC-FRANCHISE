import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration004ServiceManagement: MigrationDefinition = {
  id: '004',
  name: '004_service_management',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // Drop previous definitions to apply clean schema
    await db.execute('DROP TABLE IF EXISTS service_masters;');
    await db.execute('DROP TABLE IF EXISTS service_categories;');

    // 1. Service Categories Table (Editable by super_admin)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'}
      );
    `);

    // 2. Service Master Table
    // Cleaned fields: Service fee, single commission value, required documents, timeline/processing info, active status
    await db.execute(`
      CREATE TABLE IF NOT EXISTS service_masters (
        id VARCHAR(64) PRIMARY KEY,
        category_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,

        -- Service Fee
        service_fee REAL NOT NULL DEFAULT 0.0,

        -- Service-wise Commission (Single configurable value)
        commission_value REAL NOT NULL DEFAULT 0.0,
        commission_notes TEXT DEFAULT NULL,

        -- Required Documents (JSON array)
        required_documents ${isSqlite ? 'TEXT' : 'JSONB'} NOT NULL DEFAULT '[]',

        -- Service Timeline / Processing Information
        turnaround_days INTEGER NOT NULL DEFAULT 3,
        sla_hours INTEGER NOT NULL DEFAULT 72,
        timeline_description TEXT DEFAULT NULL,

        -- Status (Active / Inactive)
        is_active ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},

        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},

        FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT
      );
    `);

    // Indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_cat_active ON service_categories(is_active);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_services_category ON service_masters(category_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_services_active ON service_masters(is_active);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_services_code ON service_masters(code);`);

    // 3. Seed Initial Foundational Categories
    const initialCategories = [
      { id: 'cat_registration', code: 'BUSINESS_REG', name: 'Business Registration & Licensing', description: 'Company incorporation, GST, MSME, shop establishment licensing', display_order: 1 },
      { id: 'cat_taxation', code: 'TAX_COMPLIANCE', name: 'Taxation & Accounting', description: 'Income tax returns, GST filings, TDS, financial bookkeeping', display_order: 2 },
      { id: 'cat_legal', code: 'LEGAL_IP', name: 'Legal & Intellectual Property', description: 'Trademark, copyright, patent filing, legal contracts and agreements', display_order: 3 },
      { id: 'cat_certifications', code: 'CERTIFICATIONS', name: 'Compliance & Certifications', description: 'ISO certifications, FSSAI licenses, import-export codes', display_order: 4 },
    ];

    for (const cat of initialCategories) {
      const existing = await db.query<any>('SELECT id FROM service_categories WHERE code = ?', [cat.code]);
      if (existing.length === 0) {
        await db.execute(
          `INSERT INTO service_categories (id, code, name, description, display_order, is_active)
           VALUES (?, ?, ?, ?, ?, ${isSqlite ? 1 : 'TRUE'})`,
          [cat.id, cat.code, cat.name, cat.description, cat.display_order]
        );
      }
    }
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS service_masters;');
    await db.execute('DROP TABLE IF EXISTS service_categories;');
  },
};
