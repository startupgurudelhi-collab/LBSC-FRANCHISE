import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration011TicketManagement: MigrationDefinition = {
  id: '011',
  name: '011_ticket_management',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Tickets master table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(64) PRIMARY KEY,
        ticket_number VARCHAR(32) UNIQUE NOT NULL,
        organization_id VARCHAR(64) NOT NULL,
        created_by_user_id VARCHAR(64) NOT NULL,
        assigned_to_user_id VARCHAR(64) DEFAULT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(64) NOT NULL,
        priority VARCHAR(32) NOT NULL DEFAULT 'medium',
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        resolved_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        closed_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. Ticket Messages / History / Internal Notes table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id VARCHAR(64) PRIMARY KEY,
        ticket_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        is_internal INTEGER NOT NULL DEFAULT 0,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 3. Performance & lookup indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to_user_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages(created_at);`);
  },
  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS ticket_messages;`);
    await db.execute(`DROP TABLE IF EXISTS tickets;`);
  },
};
