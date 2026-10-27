import { getDatabase } from './connection.js';
import type { DatabaseAdapter, MigrationDefinition, MigrationRecord } from '../types/index.js';
import { sanitizeForLogging } from '../utils/loggerSanitizer.js';
import { migration001CoreFoundation } from './migrations/001_core_foundation.js';
import { migration002AuthRoles } from './migrations/002_auth_roles.js';
import { migration003FranchiseManagement } from './migrations/003_franchise_management.js';
import { migration004ServiceManagement } from './migrations/004_service_management.js';
import { migration005CommissionLedger } from './migrations/005_commission_ledger.js';
import { migration006CampaignManagement } from './migrations/006_campaign_management.js';
import { migration007LeadEngine } from './migrations/007_lead_engine.js';
import { migration008OwnLeadCenter } from './migrations/008_own_lead_center.js';
import { migration009ClientDirectory } from './migrations/009_client_directory.js';
import { migration010ReportingFoundation } from './migrations/010_reporting_foundation.js';
import { migration011TicketManagement } from './migrations/011_ticket_management.js';
import { migration012Knowledgebase } from './migrations/012_knowledgebase.js';
import { migration013OffersManagement } from './migrations/013_offers_management.js';
import { migration014MarketingMaterials } from './migrations/014_marketing_materials.js';
import { migration015ServiceApplications } from './migrations/015_service_applications.js';
import { migration016WorkAssignmentOperations } from './migrations/016_work_assignment_operations.js';
import { migration017AdvertisementRequests } from './migrations/017_advertisement_requests.js';
import { migration018NotificationsBackgroundJobs } from './migrations/018_notifications_background_jobs.js';
import { migration019EfilinggIntegration } from './migrations/019_efilingg_integration.js';
import { migration020LeadIntakeGateway } from './migrations/020_lead_intake_gateway.js';
import { migration021TokenVersioning } from './migrations/021_token_versioning.js';
import { migration022NotificationDeliveries } from './migrations/022_notification_deliveries.js';
import { migration023NotificationPreferences } from './migrations/023_notification_preferences.js';

// Registered migrations in chronological order
export const registeredMigrations: MigrationDefinition[] = [
  migration001CoreFoundation,
  migration002AuthRoles,
  migration003FranchiseManagement,
  migration004ServiceManagement,
  migration005CommissionLedger,
  migration006CampaignManagement,
  migration007LeadEngine,
  migration008OwnLeadCenter,
  migration009ClientDirectory,
  migration010ReportingFoundation,
  migration011TicketManagement,
  migration012Knowledgebase,
  migration013OffersManagement,
  migration014MarketingMaterials,
  migration015ServiceApplications,
  migration016WorkAssignmentOperations,
  migration017AdvertisementRequests,
  migration018NotificationsBackgroundJobs,
  migration019EfilinggIntegration,
  migration020LeadIntakeGateway,
  migration021TokenVersioning,
  migration022NotificationDeliveries,
  migration023NotificationPreferences,
];

async function ensureMigrationTable(db: DatabaseAdapter): Promise<void> {
  const isSqlite = db.getDialect() === 'sqlite';

  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id ${isSqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'},
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
      execution_time_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
}

async function ensureMigrationLockTable(db: DatabaseAdapter): Promise<void> {
  const isSqlite = db.getDialect() === 'sqlite';

  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migration_locks (
      lock_id INTEGER PRIMARY KEY,
      locked_by VARCHAR(255) NOT NULL,
      locked_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
      expires_at ${isSqlite ? 'DATETIME NOT NULL' : 'TIMESTAMP WITH TIME ZONE NOT NULL'}
    );
  `);
}

/**
 * Acquires a durable migration lock to prevent concurrent migrations across multiple instances.
 * Uses atomic compare-and-swap (CAS) semantics on expired lock takeover.
 */
export async function acquireMigrationLock(
  db: DatabaseAdapter,
  timeoutSeconds: number = 300
): Promise<string> {
  await ensureMigrationLockTable(db);
  const workerId = `mig_${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeoutSeconds * 1000).toISOString();
  const nowIso = now.toISOString();

  // 1. Inspect existing lock
  const existing = await db.query<any>(
    'SELECT lock_id, locked_by, locked_at, expires_at FROM _migration_locks WHERE lock_id = 1 LIMIT 1'
  );

  if (existing.length > 0) {
    const lockRow = existing[0];
    const expiryTime = new Date(lockRow.expires_at).getTime();

    if (expiryTime > Date.now()) {
      throw new Error(
        `Migration lock active: currently held by instance '${lockRow.locked_by}' until ${lockRow.expires_at}.`
      );
    }

    // 2. Lock is expired: claim atomically via compare-and-swap (CAS)
    const updateResult = await db.execute(
      `UPDATE _migration_locks
       SET locked_by = ?, locked_at = ?, expires_at = ?
       WHERE lock_id = 1 AND expires_at = ?`,
      [workerId, nowIso, expiresAt, lockRow.expires_at]
    );

    if (updateResult.rowsAffected === 0) {
      throw new Error(
        'Concurrent migration lock race: another instance claimed the expired migration lock.'
      );
    }

    return workerId;
  }

  // 3. No lock row exists: insert initial lock row
  try {
    await db.execute(
      `INSERT INTO _migration_locks (lock_id, locked_by, locked_at, expires_at)
       VALUES (1, ?, ?, ?)`,
      [workerId, nowIso, expiresAt]
    );
    return workerId;
  } catch (err: any) {
    console.warn('[Migration] Initial migration lock insert failed:', sanitizeForLogging(err?.message || err));
    throw new Error(
      `Concurrent migration lock conflict or database error: ${err?.message || 'initial lock insert failed'}`
    );
  }
}

/**
 * Releases the durable migration lock if held by this worker.
 */
export async function releaseMigrationLock(
  db: DatabaseAdapter,
  lockedBy: string
): Promise<void> {
  try {
    await db.execute(
      `DELETE FROM _migration_locks WHERE lock_id = 1 AND locked_by = ?`,
      [lockedBy]
    );
  } catch (err: any) {
    console.warn('[Migration] Warning releasing lock:', err?.message);
  }
}

export async function getAppliedMigrations(db: DatabaseAdapter): Promise<MigrationRecord[]> {
  await ensureMigrationTable(db);
  try {
    return await db.query<MigrationRecord>(
      'SELECT id, name, applied_at, execution_time_ms FROM _migrations ORDER BY id ASC'
    );
  } catch {
    return [];
  }
}

export async function runMigrations(db?: DatabaseAdapter): Promise<{
  applied: string[];
  skipped: string[];
  total: number;
}> {
  const database = db || getDatabase();
  await ensureMigrationTable(database);

  const lockWorkerId = await acquireMigrationLock(database);

  try {
    const appliedRecords = await getAppliedMigrations(database);
    const appliedNames = new Set(appliedRecords.map((r) => r.name));

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const migration of registeredMigrations) {
      if (appliedNames.has(migration.name)) {
        skipped.push(migration.name);
        continue;
      }

      console.log(`[Migration] Running: ${migration.name}...`);
      const start = Date.now();

      try {
        await migration.up(database);
        const executionTime = Date.now() - start;

        await database.execute(
          'INSERT INTO _migrations (name, execution_time_ms) VALUES (?, ?)',
          [migration.name, executionTime]
        );

        applied.push(migration.name);
        console.log(`[Migration] Completed: ${migration.name} (${executionTime}ms)`);
      } catch (err) {
        console.error(`[Migration] Failed on ${migration.name}:`, err);
        throw err;
      }
    }

    return {
      applied,
      skipped,
      total: registeredMigrations.length,
    };
  } finally {
    await releaseMigrationLock(database, lockWorkerId);
  }
}

export async function getMigrationStatus(db?: DatabaseAdapter) {
  const database = db || getDatabase();
  await ensureMigrationTable(database);
  const applied = await getAppliedMigrations(database);
  const appliedSet = new Set(applied.map((m) => m.name));

  return registeredMigrations.map((m) => ({
    id: m.id,
    name: m.name,
    isApplied: appliedSet.has(m.name),
    appliedAt: applied.find((a) => a.name === m.name)?.applied_at || null,
  }));
}
