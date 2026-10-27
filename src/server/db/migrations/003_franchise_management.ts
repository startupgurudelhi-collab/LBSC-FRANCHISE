import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration003FranchiseManagement: MigrationDefinition = {
  id: '003',
  name: '003_franchise_management',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // Drop previous definitions if exists to apply clean schema
    await db.execute('DROP TABLE IF EXISTS franchise_profiles;');
    await db.execute('DROP TABLE IF EXISTS franchise_applications;');

    // 1. Franchise Applications Table
    // Workflow: Application -> Screening -> Approved (or Rejected) -> Active / Deactivated
    // Location limited strictly to: city, district, state, pin
    await db.execute(`
      CREATE TABLE IF NOT EXISTS franchise_applications (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) DEFAULT NULL,
        applicant_user_id VARCHAR(64) DEFAULT NULL,
        business_name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(50) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'application',
        
        -- Location fields for lead mapping (City, District, State, PIN)
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        pin VARCHAR(32) NOT NULL,

        screening_notes TEXT DEFAULT NULL,
        rejection_reason TEXT DEFAULT NULL,
        reviewed_by_user_id VARCHAR(64) DEFAULT NULL,
        reviewed_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        activated_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        deactivated_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},

        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
        FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Franchise Profiles Table
    // Location limited strictly to: city, district, state, pin
    await db.execute(`
      CREATE TABLE IF NOT EXISTS franchise_profiles (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) UNIQUE NOT NULL,
        application_id VARCHAR(64) DEFAULT NULL,
        franchise_code VARCHAR(64) UNIQUE NOT NULL,
        operating_name VARCHAR(255) NOT NULL,
        legal_name VARCHAR(255) NOT NULL,
        tax_id VARCHAR(64) DEFAULT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(50) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',

        -- Location fields for lead mapping (City, District, State, PIN)
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        pin VARCHAR(32) NOT NULL,

        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},

        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (application_id) REFERENCES franchise_applications(id) ON DELETE SET NULL
      );
    `);

    // Indices for performance & lead mapping lookup
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_apps_status ON franchise_applications(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_apps_pin ON franchise_applications(pin);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_apps_city ON franchise_applications(city);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_apps_org ON franchise_applications(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_profiles_org ON franchise_profiles(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_profiles_status ON franchise_profiles(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_profiles_pin ON franchise_profiles(pin);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_profiles_city ON franchise_profiles(city);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_franchise_profiles_code ON franchise_profiles(franchise_code);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS franchise_profiles;');
    await db.execute('DROP TABLE IF EXISTS franchise_applications;');
  },
};
