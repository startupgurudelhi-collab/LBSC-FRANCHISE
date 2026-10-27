import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration015ServiceApplications: MigrationDefinition = {
  id: '015',
  name: '015_service_applications',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Service Applications Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS service_applications (
        id VARCHAR(64) PRIMARY KEY,
        application_number VARCHAR(64) UNIQUE NOT NULL,
        franchise_id VARCHAR(64) NOT NULL,
        client_id VARCHAR(64) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        status_reason TEXT DEFAULT NULL,
        custom_fields TEXT DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        priority VARCHAR(32) NOT NULL DEFAULT 'normal',

        -- Snapshots captured at submission
        service_fee_snapshot REAL NOT NULL DEFAULT 0.0,
        commission_value_snapshot REAL NOT NULL DEFAULT 0.0,
        commission_notes_snapshot TEXT DEFAULT NULL,

        -- Lifecycle actor & timestamp tracking
        submitted_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        submitted_by_user_id VARCHAR(64) DEFAULT NULL,
        reviewed_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        reviewed_by_user_id VARCHAR(64) DEFAULT NULL,
        approved_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        approved_by_user_id VARCHAR(64) DEFAULT NULL,
        completed_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        completed_by_user_id VARCHAR(64) DEFAULT NULL,

        -- Assignment details
        assigned_to_user_id VARCHAR(64) DEFAULT NULL,
        assigned_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        assigned_by_user_id VARCHAR(64) DEFAULT NULL,
        assignment_notes TEXT DEFAULT NULL,

        -- Commission release tracking
        commission_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        commission_released_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        commission_released_by_user_id VARCHAR(64) DEFAULT NULL,
        ledger_entry_id VARCHAR(64) DEFAULT NULL,
        ledger_reference_id VARCHAR(100) UNIQUE DEFAULT NULL,

        -- General metadata
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},

        FOREIGN KEY (franchise_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE RESTRICT,
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (commission_released_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (ledger_entry_id) REFERENCES commission_ledger_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Service Application Documents Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS service_application_documents (
        id VARCHAR(64) PRIMARY KEY,
        application_id VARCHAR(64) NOT NULL,
        document_name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        is_required ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        status VARCHAR(32) NOT NULL DEFAULT 'MISSING',

        -- Uploaded file details
        file_name VARCHAR(255) DEFAULT NULL,
        file_type VARCHAR(128) DEFAULT NULL,
        file_size INTEGER DEFAULT NULL,
        file_url TEXT DEFAULT NULL,
        file_data TEXT DEFAULT NULL,
        uploaded_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        uploaded_by_user_id VARCHAR(64) DEFAULT NULL,

        -- Review & verification details
        verified_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        verified_by_user_id VARCHAR(64) DEFAULT NULL,
        rejection_reason TEXT DEFAULT NULL,

        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},

        FOREIGN KEY (application_id) REFERENCES service_applications(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 3. Performance & Multi-Tenant Lookup Indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_franchise ON service_applications(franchise_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_client ON service_applications(client_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_service ON service_applications(service_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_status ON service_applications(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_comm_status ON service_applications(commission_status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_assigned ON service_applications(assigned_to_user_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_apps_created ON service_applications(created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_app_docs_app ON service_application_documents(application_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_service_app_docs_status ON service_application_documents(status);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS service_application_documents;`);
    await db.execute(`DROP TABLE IF EXISTS service_applications;`);
  },
};
