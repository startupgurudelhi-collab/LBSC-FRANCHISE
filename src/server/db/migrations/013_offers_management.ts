import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration013OffersManagement: MigrationDefinition = {
  id: '013',
  name: '013_offers_management',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Offers Table
    // Rules:
    // - Title and description
    // - Applicable service(s) mapped in offer_services
    // - Start date and end date
    // - Active / inactive status control
    // - No discount/coupon/redemption/pricing/commission fields
    await db.execute(`
      CREATE TABLE IF NOT EXISTS offers (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        start_date VARCHAR(64) NOT NULL,
        end_date VARCHAR(64) NOT NULL,
        is_active ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Offer-to-Service Mapping Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS offer_services (
        id VARCHAR(64) PRIMARY KEY,
        offer_id VARCHAR(64) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE CASCADE,
        UNIQUE (offer_id, service_id)
      );
    `);

    // 3. Performance & Lookup Indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_offers_dates ON offers(start_date, end_date);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_offers_created ON offers(created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_offer_services_offer ON offer_services(offer_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_offer_services_service ON offer_services(service_id);`);
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS offer_services;`);
    await db.execute(`DROP TABLE IF EXISTS offers;`);
  },
};
