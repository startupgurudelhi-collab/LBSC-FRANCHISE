import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration006CampaignManagement: MigrationDefinition = {
  id: '006',
  name: '006_campaign_management',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Franchise Campaigns Table
    // Rules:
    // - Linked to franchise (organization_id) + service (service_id)
    // - Location: city, district, state
    // - Status: Active / Paused
    // - Fixed campaign fee: ₹100/day
    // - Maximum campaign leads: 5/day
    // - Daily campaign charge deducted from franchise commission balance
    // - Zero-balance grace counter: max 3 days allowed when balance <= 0, then automatically PAUSES
    await db.execute(`
      CREATE TABLE IF NOT EXISTS franchise_campaigns (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) DEFAULT NULL,
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'paused'
        pause_reason VARCHAR(100) DEFAULT NULL,
        daily_fee REAL NOT NULL DEFAULT 100.0,
        max_leads_per_day INTEGER NOT NULL DEFAULT 5,
        start_date VARCHAR(20) NOT NULL,
        end_date VARCHAR(20) DEFAULT NULL,
        zero_balance_days_count INTEGER NOT NULL DEFAULT 0,
        last_charged_date VARCHAR(20) DEFAULT NULL,
        total_charges_count INTEGER NOT NULL DEFAULT 0,
        total_charges_amount REAL NOT NULL DEFAULT 0.0,
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES service_masters(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Campaign Daily Charges Table (Tracking daily deductions and zero-balance history)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS campaign_daily_charges (
        id VARCHAR(64) PRIMARY KEY,
        campaign_id VARCHAR(64) NOT NULL,
        organization_id VARCHAR(64) NOT NULL,
        charge_date VARCHAR(20) NOT NULL,
        amount REAL NOT NULL DEFAULT 100.0,
        ledger_entry_id VARCHAR(64) DEFAULT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        zero_balance_day_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(64) NOT NULL DEFAULT 'success',
        notes TEXT DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (campaign_id) REFERENCES franchise_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (ledger_entry_id) REFERENCES commission_ledger_entries(id) ON DELETE SET NULL
      );
    `);

    // Performance and integrity indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_campaigns_org ON franchise_campaigns(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_campaigns_service ON franchise_campaigns(service_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON franchise_campaigns(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_campaign_charges_cmp ON campaign_daily_charges(campaign_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_campaign_charges_org ON campaign_daily_charges(organization_id);`);
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_charges_uniq ON campaign_daily_charges(campaign_id, charge_date);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS campaign_daily_charges;');
    await db.execute('DROP TABLE IF EXISTS franchise_campaigns;');
  },
};
