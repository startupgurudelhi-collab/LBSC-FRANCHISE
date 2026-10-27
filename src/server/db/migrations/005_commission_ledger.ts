import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration005CommissionLedger: MigrationDefinition = {
  id: '005',
  name: '005_commission_ledger',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Franchise Commission Accounts Table
    // Negative balance is allowed. Concurrency version tracks optimistic locking.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS franchise_commission_accounts (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) UNIQUE NOT NULL,
        current_balance REAL NOT NULL DEFAULT 0.0,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        version INTEGER NOT NULL DEFAULT 1,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );
    `);

    // 2. Commission Ledger Entries Table (Strictly append-only / immutable)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS commission_ledger_entries (
        id VARCHAR(64) PRIMARY KEY,
        account_id VARCHAR(64) NOT NULL,
        organization_id VARCHAR(64) NOT NULL,
        entry_type VARCHAR(16) NOT NULL, -- 'credit' | 'debit'
        category VARCHAR(64) NOT NULL,   -- 'commission_earned', 'manual_adjustment_credit', 'manual_adjustment_debit', 'correction_reversal', etc.
        amount REAL NOT NULL,            -- absolute positive transaction amount
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        reference_id VARCHAR(100) UNIQUE NOT NULL, -- Unique idempotency reference
        external_reference VARCHAR(100) DEFAULT NULL,
        description TEXT NOT NULL,
        metadata ${isSqlite ? 'TEXT' : 'JSONB'} DEFAULT NULL,
        created_by_user_id VARCHAR(64) DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (account_id) REFERENCES franchise_commission_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Indices for ledger querying & audit performance
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_comm_acc_org ON franchise_commission_accounts(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_comm_ledger_acc ON commission_ledger_entries(account_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_comm_ledger_org ON commission_ledger_entries(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_comm_ledger_ref ON commission_ledger_entries(reference_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_comm_ledger_created ON commission_ledger_entries(created_at);`);

    // 3. Initialize Commission Accounts for all existing active franchise organizations
    const existingOrgs = await db.query<{ id: string }>(`
      SELECT id FROM organizations WHERE type = 'franchise'
    `);

    for (const org of existingOrgs) {
      const existingAccount = await db.query<{ id: string }>(`
        SELECT id FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1
      `, [org.id]);

      if (existingAccount.length === 0) {
        const accountId = `comm_acc_${org.id}`;
        await db.execute(`
          INSERT INTO franchise_commission_accounts (id, organization_id, current_balance, currency, version)
          VALUES (?, ?, 0.0, 'INR', 1)
        `, [accountId, org.id]);
      }
    }
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute('DROP TABLE IF EXISTS commission_ledger_entries;');
    await db.execute('DROP TABLE IF EXISTS franchise_commission_accounts;');
  },
};
