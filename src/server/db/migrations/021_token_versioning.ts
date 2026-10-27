import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration021TokenVersioning: MigrationDefinition = {
  id: '021_token_versioning',
  name: 'Add token_version to users for JWT session revocation',
  up: async (db: DatabaseAdapter): Promise<void> => {
    const isSqlite = db.getDialect() === 'sqlite';

    if (isSqlite) {
      const cols = await db.query<any>('PRAGMA table_info(users)');
      const hasTokenVersion = cols.some((c: any) => c.name === 'token_version');
      if (!hasTokenVersion) {
        await db.execute('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;');
      }
    } else {
      await db.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;');
    }
  },
  down: async (_db: DatabaseAdapter): Promise<void> => {
    // Reversible if needed
  },
};
