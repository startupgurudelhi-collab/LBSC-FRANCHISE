import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration017AdvertisementRequests: MigrationDefinition = {
  id: '017',
  name: '017_advertisement_requests',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Advertisement Requests table (strictly separated from Campaign Management)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS advertisement_requests (
        id VARCHAR(64) PRIMARY KEY,
        request_number VARCHAR(32) UNIQUE NOT NULL,
        franchise_id VARCHAR(64) NOT NULL,
        created_by_user_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        advertising_type VARCHAR(64) NOT NULL,
        service_id VARCHAR(64) DEFAULT NULL,
        target_audience VARCHAR(255) DEFAULT NULL,
        target_location VARCHAR(255) DEFAULT NULL,
        preferred_timeline VARCHAR(128) DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        reference_details TEXT DEFAULT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        rejection_reason TEXT DEFAULT NULL,
        admin_notes TEXT DEFAULT NULL,
        reviewed_by_user_id VARCHAR(64) DEFAULT NULL,
        reviewed_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        approved_by_user_id VARCHAR(64) DEFAULT NULL,
        approved_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        completed_by_user_id VARCHAR(64) DEFAULT NULL,
        completed_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        rejected_by_user_id VARCHAR(64) DEFAULT NULL,
        rejected_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (franchise_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Advertisement Request History & Audit Trail table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS advertisement_request_history (
        id VARCHAR(64) PRIMARY KEY,
        request_id VARCHAR(64) NOT NULL,
        author_user_id VARCHAR(64) NOT NULL,
        action_type VARCHAR(32) NOT NULL,
        previous_status VARCHAR(32) DEFAULT NULL,
        new_status VARCHAR(32) DEFAULT NULL,
        note TEXT DEFAULT NULL,
        metadata TEXT DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (request_id) REFERENCES advertisement_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 3. Performance & lookup indices
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_franchise ON advertisement_requests(franchise_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_status ON advertisement_requests(status);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_service ON advertisement_requests(service_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_created ON advertisement_requests(created_at);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_type ON advertisement_requests(advertising_type);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_number ON advertisement_requests(request_number);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_hist_req ON advertisement_request_history(request_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_adv_req_hist_created ON advertisement_request_history(created_at);');
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS advertisement_request_history;');
    await db.execute('DROP TABLE IF EXISTS advertisement_requests;');
  },
};
