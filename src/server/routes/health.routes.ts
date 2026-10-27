import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getDatabase } from '../db/connection.js';
import { getAppliedMigrations } from '../db/migrate.js';
import { env } from '../config/env.js';
import type { ApiResponse, SystemHealth } from '../types/index.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDatabase();
    const dbHealth = await db.healthCheck();

    let migrationCount = 0;
    let lastMigration: string | undefined;

    if (dbHealth.ok) {
      try {
        const migrations = await getAppliedMigrations(db);
        migrationCount = migrations.length;
        if (migrations.length > 0) {
          lastMigration = migrations[migrations.length - 1].name;
        }
      } catch {
        // Tolerant if table not created yet
      }
    }

    const isProd =
      env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'production' ||
      (req.app && req.app.get('env') === 'production');

    const healthData: SystemHealth = isProd
      ? {
          status: dbHealth.ok ? 'healthy' : 'degraded',
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          environment: 'production',
          version: '1.0.0',
          database: {
            ok: dbHealth.ok,
          },
        }
      : {
          status: dbHealth.ok ? 'healthy' : 'degraded',
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          environment: env.NODE_ENV,
          version: '1.0.0',
          database: {
            ok: dbHealth.ok,
            dialect: db.getDialect(),
            latencyMs: dbHealth.latencyMs,
            activeMigrations: migrationCount,
            lastMigration,
            error: dbHealth.error,
          },
        };

    const response: ApiResponse<SystemHealth> = {
      success: dbHealth.ok,
      data: healthData,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    res.status(dbHealth.ok ? 200 : 503).json(response);
  })
);
