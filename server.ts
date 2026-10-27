import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { env } from './src/server/config/env.js';
import { apiRouter } from './src/server/routes/index.js';
import { requestLogger } from './src/server/middleware/requestLogger.js';
import { securityHeaders } from './src/server/middleware/securityHeaders.js';
import { createCorsMiddleware } from './src/server/middleware/corsConfig.js';
import { errorHandler, notFoundHandler } from './src/server/middleware/errorHandler.js';
import { getDatabase, closeDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { sanitizeForLogging } from './src/server/utils/loggerSanitizer.js';
import { BackgroundScheduler } from './src/server/jobs/scheduler.js';

async function startServer() {
  const app = express();
  const isProduction = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  const PORT = isProduction ? (Number(process.env.PORT) || env.PORT || 3000) : 3000;

  console.log(`[Startup] Initializing LBSC Platform (${isProduction ? 'production' : 'development'} mode, port ${PORT})...`);

  // 1. Basic security & utility middleware
  app.use(securityHeaders);

  // In production, when Express serves both frontend and API from the same origin,
  // ensure CORS origin defaults to configured APP_URL or local server address
  // instead of wildcard '*', avoiding validateProductionCorsOrigin fatal startup errors.
  const corsOrigin =
    isProduction && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')
      ? (process.env.APP_URL || `http://localhost:${PORT}`)
      : env.CORS_ORIGIN;
  app.use(createCorsMiddleware(corsOrigin, isProduction));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);

  // 2. Database connection & automated migration initialization
  try {
    console.log('[Startup] Checking database connectivity...');
    const db = getDatabase();
    const health = await db.healthCheck();
    if (health.ok) {
      console.log(`[Database] Connected successfully (${db.getDialect()} - ${health.latencyMs}ms)`);
      console.log('[Startup] Executing database migrations...');
      const migrationResult = await runMigrations(db);
      if (migrationResult.applied.length > 0) {
        console.log(`[Database] Applied ${migrationResult.applied.length} migration(s):`, migrationResult.applied);
      }
      // 1. Ensure Super Administrator exists across all environments
      await AuthService.ensureSuperAdmin(db);

      // 2. Allow administrative password reset via secure runtime environment variable
      if (process.env.RESET_ADMIN_PASSWORD && process.env.RESET_ADMIN_PASSWORD.trim().length >= 8) {
        await AuthService.resetAdminPassword(process.env.RESET_ADMIN_PASSWORD.trim(), db);
      }

      // 3. Demo accounts (dummy franchise, demo owner) only seeded in non-production
      if (!isProduction) {
        await AuthService.seedDemoAccounts(db);
      }

      // Start automatic background scheduler after database initialization and migrations succeed
      await BackgroundScheduler.start();
    } else {
      if (isProduction) {
        throw new Error(`Database health check failed during production startup: ${health.error || 'Connection unreachable'}`);
      }
      console.warn(`[Database] Connection check warning:`, health.error);
    }
  } catch (dbErr) {
    console.error('[Database] Initialization error:', sanitizeForLogging(dbErr));
    if (isProduction) {
      // Production fail-fast: Do NOT start serving traffic if database/migrations fail
      throw dbErr;
    }
  }

  // 3. API Routes mounting
  app.use('/api', apiRouter);

  // 4. API 404 handler for unknown /api/* requests
  app.use('/api/*', notFoundHandler);

  // 5. Centralized error handling for API
  app.use(errorHandler);

  // 6. Vite middleware for frontend development / static files for production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Guard server bundles and source maps from being publicly served as static assets
    app.use((req, res, next) => {
      if (req.path.endsWith('.cjs') || req.path.endsWith('.map')) {
        return res.status(404).end();
      }
      next();
    });
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 LBSC Foundation server running on http://0.0.0.0:${PORT}`);
    console.log(`   - Environment: ${env.NODE_ENV}`);
    console.log(`   - API Base: http://localhost:${PORT}/api/v1`);
    console.log(`   - Health: http://localhost:${PORT}/api/health`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    BackgroundScheduler.stop();
    server.close(async () => {
      await closeDatabase();
      console.log('Server and database connections closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal error during server startup:', sanitizeForLogging(err));
  process.exit(1);
});
