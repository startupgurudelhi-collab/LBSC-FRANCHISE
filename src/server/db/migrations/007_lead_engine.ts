import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration007LeadEngine: MigrationDefinition = {
  id: '007',
  name: '007_lead_engine',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Leads Table (Core lead entity with intake source, service, and location)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(64) PRIMARY KEY,
        lead_number VARCHAR(64) UNIQUE NOT NULL,
        source VARCHAR(64) NOT NULL, -- e.g., 'website', 'landing_page', 'direct_call', 'aggregator', etc.
        source_reference VARCHAR(128) DEFAULT NULL, -- campaign tag, utm, external lead id
        customer_name VARCHAR(128) NOT NULL,
        customer_phone VARCHAR(32) NOT NULL,
        customer_email VARCHAR(128) DEFAULT NULL,
        service_id VARCHAR(64) NOT NULL,
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        pin VARCHAR(16) DEFAULT NULL,
        address TEXT DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'new', -- 'new', 'offered', 'assigned', 'own_lead_center', 'closed', 'cancelled'
        assigned_franchise_id VARCHAR(64) DEFAULT NULL, -- permanent franchise owner once accepted
        assigned_campaign_id VARCHAR(64) DEFAULT NULL, -- campaign through which it was accepted
        assigned_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE RESTRICT,
        FOREIGN KEY (assigned_franchise_id) REFERENCES organizations(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_campaign_id) REFERENCES franchise_campaigns(id) ON DELETE SET NULL
      );
    `);

    // 2. Lead Opportunities Table (Temporary 1-hour offer to eligible active campaign franchise)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS lead_opportunities (
        id VARCHAR(64) PRIMARY KEY,
        lead_id VARCHAR(64) NOT NULL,
        franchise_id VARCHAR(64) NOT NULL,
        campaign_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'rejected'
        offered_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        expires_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} NOT NULL,
        responded_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'} DEFAULT NULL,
        response_notes TEXT DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (franchise_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES franchise_campaigns(id) ON DELETE CASCADE
      );
    `);

    // 3. Lead Ownership / Assignment History Table (Immutable audit trail of routing & assignment)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS lead_assignment_history (
        id VARCHAR(64) PRIMARY KEY,
        lead_id VARCHAR(64) NOT NULL,
        action VARCHAR(64) NOT NULL, -- 'created', 'offered', 'accepted', 'expired_released', 'routed_to_own_lead_center', 'reassigned'
        from_franchise_id VARCHAR(64) DEFAULT NULL,
        to_franchise_id VARCHAR(64) DEFAULT NULL,
        campaign_id VARCHAR(64) DEFAULT NULL,
        opportunity_id VARCHAR(64) DEFAULT NULL,
        reason TEXT DEFAULT NULL,
        performed_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (from_franchise_id) REFERENCES organizations(id) ON DELETE SET NULL,
        FOREIGN KEY (to_franchise_id) REFERENCES organizations(id) ON DELETE SET NULL,
        FOREIGN KEY (campaign_id) REFERENCES franchise_campaigns(id) ON DELETE SET NULL,
        FOREIGN KEY (opportunity_id) REFERENCES lead_opportunities(id) ON DELETE SET NULL,
        FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Indices for performant matching, expiry checking, and franchise lookup
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_leads_service_loc ON leads(service_id, city, district, state);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_leads_franchise ON leads(assigned_franchise_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_opps_lead ON lead_opportunities(lead_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_opps_franchise ON lead_opportunities(franchise_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_opps_status_expires ON lead_opportunities(status, expires_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_hist_lead ON lead_assignment_history(lead_id);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS lead_assignment_history;`);
    await db.execute(`DROP TABLE IF EXISTS lead_opportunities;`);
    await db.execute(`DROP TABLE IF EXISTS leads;`);
  },
};
