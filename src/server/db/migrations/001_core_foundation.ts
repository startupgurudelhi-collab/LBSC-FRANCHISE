import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration001CoreFoundation: MigrationDefinition = {
  id: '001',
  name: '001_core_foundation',
  up: async (db: DatabaseAdapter) => {
    const dialect = db.getDialect();

    const isSqlite = dialect === 'sqlite';

    // 1. Organizations table (Multi-tenancy / Franchise structure foundation)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS organizations (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'franchise',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        metadata ${isSqlite ? 'TEXT' : 'JSONB'} DEFAULT NULL,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'}
      );
    `);

    // 2. Users table (Core user accounts and identity foundation)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(50),
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        token_version INTEGER NOT NULL DEFAULT 1,
        last_login_at ${isSqlite ? 'DATETIME' : 'TIMESTAMP WITH TIME ZONE'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
      );
    `);

    // 3. Roles table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(64) UNIQUE NOT NULL,
        description TEXT,
        is_system ${isSqlite ? 'INTEGER DEFAULT 0' : 'BOOLEAN DEFAULT FALSE'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'}
      );
    `);

    // 4. Permissions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(64) NOT NULL,
        description TEXT,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'}
      );
    `);

    // 5. User Roles mapping
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id VARCHAR(64) NOT NULL,
        role_id VARCHAR(64) NOT NULL,
        assigned_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      );
    `);

    // 6. Role Permissions mapping
    await db.execute(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id VARCHAR(64) NOT NULL,
        permission_id VARCHAR(64) NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      );
    `);

    // 7. Audit Logs table (Foundation for auditability across all modules)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64),
        user_id VARCHAR(64),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        old_values ${isSqlite ? 'TEXT' : 'JSONB'} DEFAULT NULL,
        new_values ${isSqlite ? 'TEXT' : 'JSONB'} DEFAULT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 8. System Settings table (Platform & organization settings foundation)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) DEFAULT NULL,
        key VARCHAR(128) NOT NULL,
        value ${isSqlite ? 'TEXT' : 'JSONB'} NOT NULL,
        description TEXT,
        is_encrypted ${isSqlite ? 'INTEGER DEFAULT 0' : 'BOOLEAN DEFAULT FALSE'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        UNIQUE(organization_id, key),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );
    `);

    // Indices for performance
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_settings_key ON system_settings(key);`);
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS system_settings;`);
    await db.execute(`DROP TABLE IF EXISTS audit_logs;`);
    await db.execute(`DROP TABLE IF EXISTS role_permissions;`);
    await db.execute(`DROP TABLE IF EXISTS user_roles;`);
    await db.execute(`DROP TABLE IF EXISTS permissions;`);
    await db.execute(`DROP TABLE IF EXISTS roles;`);
    await db.execute(`DROP TABLE IF EXISTS users;`);
    await db.execute(`DROP TABLE IF EXISTS organizations;`);
  },
};
