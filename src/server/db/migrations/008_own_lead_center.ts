import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration008OwnLeadCenter: MigrationDefinition = {
  id: '008',
  name: '008_own_lead_center',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Add zero_balance_buy_count to franchise_commission_accounts
    // When balance <= 0, franchise is permitted max 3 Buy Leads (0 -> -20 -> -40 -> -60)
    // Once balance becomes positive, zero_balance_buy_count resets to 0.
    const tableInfo = await db.query<any>(
      isSqlite
        ? `PRAGMA table_info(franchise_commission_accounts);`
        : `SELECT column_name as name FROM information_schema.columns WHERE table_name = 'franchise_commission_accounts';`
    );
    const hasZeroBalanceCol = tableInfo.some((col: any) => col.name === 'zero_balance_buy_count');

    if (!hasZeroBalanceCol) {
      await db.execute(`
        ALTER TABLE franchise_commission_accounts
        ADD COLUMN zero_balance_buy_count INTEGER NOT NULL DEFAULT 0;
      `);
    }

    // 2. Lead Purchases Table (Track permanent Buy Lead purchases with transaction audit)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS lead_purchases (
        id VARCHAR(64) PRIMARY KEY,
        lead_id VARCHAR(64) NOT NULL,
        franchise_id VARCHAR(64) NOT NULL,
        purchased_by_user_id VARCHAR(64) DEFAULT NULL,
        price REAL NOT NULL DEFAULT 20.0,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        ledger_entry_id VARCHAR(64) NOT NULL,
        ledger_reference_id VARCHAR(100) UNIQUE NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        purchased_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (franchise_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (purchased_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (ledger_entry_id) REFERENCES commission_ledger_entries(id) ON DELETE RESTRICT
      );
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_purchases_lead ON lead_purchases(lead_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_purchases_franchise ON lead_purchases(franchise_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_lead_purchases_purchased_at ON lead_purchases(purchased_at);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS lead_purchases;`);
  },
};
