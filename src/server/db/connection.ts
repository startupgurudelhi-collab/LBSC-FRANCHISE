import { createClient, type Client as LibSqlClient } from '@libsql/client';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import type { DatabaseAdapter, DatabaseTransaction } from '../types/index.js';

class LibSqlAdapter implements DatabaseAdapter {
  private client: LibSqlClient;

  constructor(url: string) {
    // If file: path is used, ensure the directory exists
    if (url.startsWith('file:')) {
      const filePath = url.replace('file:', '');
      const dir = path.dirname(path.resolve(process.cwd(), filePath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.client = createClient({ url });
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.client.execute({
      sql,
      args: (params as any) || [],
    });
    return result.rows as unknown as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    const result = await this.client.execute({
      sql,
      args: (params as any) || [],
    });
    return { rowsAffected: result.rowsAffected };
  }

  async batch(statements: string[]): Promise<void> {
    const batchOps = statements
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((sql) => ({ sql, args: [] }));
    if (batchOps.length > 0) {
      await this.client.batch(batchOps, 'write');
    }
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const libSqlTx = await this.client.transaction('write');
    const txAdapter: DatabaseTransaction = {
      query: async <R = unknown>(sql: string, params?: unknown[]): Promise<R[]> => {
        const res = await libSqlTx.execute({
          sql,
          args: (params as any) || [],
        });
        return res.rows as unknown as R[];
      },
      execute: async (sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> => {
        const res = await libSqlTx.execute({
          sql,
          args: (params as any) || [],
        });
        return { rowsAffected: res.rowsAffected };
      },
    };

    try {
      const result = await callback(txAdapter);
      await libSqlTx.commit();
      return result;
    } catch (error) {
      try {
        await libSqlTx.rollback();
      } catch {
        // Rollback error ignored if transaction already aborted
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.execute('SELECT 1 as ping');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }

  getDialect(): 'sqlite' | 'postgres' {
    return 'sqlite';
  }
}

class PgAdapter implements DatabaseAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    const result = await this.pool.query(sql, params);
    return { rowsAffected: result.rowCount || 0 };
  }

  async batch(statements: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const txAdapter: DatabaseTransaction = {
      query: async <R = unknown>(sql: string, params?: unknown[]): Promise<R[]> => {
        const res = await client.query(sql, params);
        return res.rows as R[];
      },
      execute: async (sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> => {
        const res = await client.query(sql, params);
        return { rowsAffected: res.rowCount || 0 };
      },
    };

    try {
      await client.query('BEGIN');
      const result = await callback(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1 as ping');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getDialect(): 'sqlite' | 'postgres' {
    return 'postgres';
  }
}

let dbInstance: DatabaseAdapter | null = null;

export function getDatabase(): DatabaseAdapter {
  if (!dbInstance) {
    const url = env.DATABASE_URL;
    const clientType = env.DATABASE_CLIENT;

    const isPostgres =
      clientType === 'postgres' ||
      (clientType === 'auto' && (url.startsWith('postgres://') || url.startsWith('postgresql://')));

    if (isPostgres) {
      dbInstance = new PgAdapter(url);
    } else {
      dbInstance = new LibSqlAdapter(url);
    }
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
