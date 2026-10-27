import { BackgroundScheduler } from './src/server/jobs/scheduler.js';
import { getDatabase } from './src/server/db/connection.js';
import { JOB_NAMES } from './src/server/jobs/types.js';
import { JobEngine } from './src/server/jobs/jobEngine.js';
import { LeadOpportunityExpiryJob } from './src/server/jobs/handlers/leadOpportunityExpiryJob.js';

let passed = 0;
let failed = 0;

function assert(desc: string, condition: boolean, details?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`, details !== undefined ? details : '');
    failed++;
  }
}

async function runTests() {
  console.log('\n=== Phase 23B: Background Scheduler Test Suite ===\n');

  // 1. Timezone & Scheduling calculations
  console.log('--- 1. Timezone & Target Timing Calculations ---');
  {
    // Kolkata date calculation: UTC 2026-10-09T18:40:00Z is 2026-10-10 00:10:00 IST (+5:30)
    const testDateUtcEvening = new Date('2026-10-09T18:40:00Z');
    const kolkataDateStr = BackgroundScheduler.getKolkataDateString(testDateUtcEvening);
    assert('Calculates correct Asia/Kolkata date across UTC midnight boundary (2026-10-10)', kolkataDateStr === '2026-10-10');

    // Milliseconds to next Kolkata 00:01
    // Given 2026-10-09 23:30:00 IST (2026-10-09T18:00:00Z), next 00:01 is 31 minutes later (1,860,000 ms)
    const beforeMidnightUtc = new Date('2026-10-09T18:00:00Z');
    const msBefore = BackgroundScheduler.getMillisecondsUntilNextKolkata0001(beforeMidnightUtc);
    const expectedMsBefore = 31 * 60 * 1000;
    assert(
      'Target 00:01 IST correctly calculates remaining ms for same night prior to 00:01',
      Math.abs(msBefore - expectedMsBefore) < 5000,
      { msBefore, expectedMsBefore }
    );

    // Given 2026-10-09 01:00:00 IST (2026-10-08T19:30:00Z), past 00:01, next 00:01 is 23 hours and 1 minute later
    const afterMidnightUtc = new Date('2026-10-08T19:30:00Z');
    const msAfter = BackgroundScheduler.getMillisecondsUntilNextKolkata0001(afterMidnightUtc);
    const expectedMsAfter = (23 * 60 + 1) * 60 * 1000;
    assert(
      'Target 00:01 IST correctly advances to tomorrow after 00:01 passes',
      Math.abs(msAfter - expectedMsAfter) < 5000,
      { msAfter, expectedMsAfter }
    );

    // Hourly SLA check minute :05 calculation
    // If current time is :03:00, remaining is 2 minutes (120,000 ms)
    const minute03Date = new Date('2026-10-09T10:03:00.000Z');
    const ms05_a = BackgroundScheduler.getMillisecondsUntilNextHourMinute05(minute03Date);
    assert('Calculates remaining time to :05 when current minute is < 5 (2 minutes)', Math.abs(ms05_a - 120000) < 1000, { ms05_a });

    // If current time is :05:00, next is exactly 60 minutes later
    const minute05Date = new Date('2026-10-09T10:05:00.000Z');
    const ms05_b = BackgroundScheduler.getMillisecondsUntilNextHourMinute05(minute05Date);
    assert('Calculates next cycle when current minute is exactly :05 (60 minutes)', Math.abs(ms05_b - 3600000) < 1000, { ms05_b });

    // If current time is :15:00, remaining is 50 minutes (3,000,000 ms)
    const minute15Date = new Date('2026-10-09T10:15:00.000Z');
    const ms05_c = BackgroundScheduler.getMillisecondsUntilNextHourMinute05(minute15Date);
    assert('Calculates remaining time to next hour :05 when current minute is > 5 (50 minutes)', Math.abs(ms05_c - 50 * 60 * 1000) < 1000, { ms05_c });
  }

  // 2. Scheduler lifecycle & graceful shutdown
  console.log('\n--- 2. Scheduler Lifecycle & Graceful Shutdown ---');
  {
    BackgroundScheduler.stop(); // ensure baseline stopped
    let status = BackgroundScheduler.getStatus();
    assert('Scheduler initially stopped', !status.running && status.activeTimersCount === 0);

    await BackgroundScheduler.start();
    status = BackgroundScheduler.getStatus();
    assert('Scheduler starts and marks running = true', status.running);
    assert('Scheduler registers 3 active timers', status.activeTimersCount === 3, status);

    // Multiple start() calls must be idempotent
    await BackgroundScheduler.start();
    status = BackgroundScheduler.getStatus();
    assert('Calling start() repeatedly is idempotent without creating redundant timers', status.activeTimersCount === 3);

    // Stop cleanly
    BackgroundScheduler.stop();
    status = BackgroundScheduler.getStatus();
    assert('Calling stop() clears all timers cleanly', !status.running && status.activeTimersCount === 0);
  }

  // 3. Startup Recovery for Missed Daily Charges
  console.log('\n--- 3. Startup Recovery for Daily Charges ---');
  {
    const db = getDatabase();
    const todayKolkata = BackgroundScheduler.getKolkataDateString();
    const runKey = `${JOB_NAMES.CAMPAIGN_DAILY_CHARGES}:${todayKolkata}`;

    // Clean up any existing completed test run for today to verify catch-up trigger
    await db.execute(`DELETE FROM background_jobs WHERE run_key = ?`, [runKey]);

    // Check catchup execution when current time is past 00:01
    await BackgroundScheduler.checkAndRecoverDailyCharges();

    // Verify background_jobs now records a run with status COMPLETED
    const jobRecord = await db.query<any>(
      `SELECT id, job_name, run_key, status, trigger_type 
       FROM background_jobs 
       WHERE run_key = ? 
       LIMIT 1`,
      [runKey]
    );

    assert('Startup recovery triggered daily charge job when missed', jobRecord.length === 1);
    if (jobRecord.length > 0) {
      assert('Job status is COMPLETED', jobRecord[0].status === 'COMPLETED', jobRecord[0]);
      assert('Job trigger_type is SCHEDULED', jobRecord[0].trigger_type === 'SCHEDULED');
    }

    // Call checkAndRecoverDailyCharges again: must not duplicate or re-run
    await BackgroundScheduler.checkAndRecoverDailyCharges();
    const runsCount = await db.query<any>(
      `SELECT COUNT(*) as count FROM background_jobs WHERE run_key = ?`,
      [runKey]
    );
    assert('Subsequent recovery check is idempotent and detects existing completion', Number(runsCount[0].count) === 1);
  }

  // 4. Multi-Instance Concurrency & Duplicate Run Prevention
  console.log('\n--- 4. Multi-Instance Concurrency & Lock Protection ---');
  {
    const testDate = '2099-01-01';
    const testRunKey = `${JOB_NAMES.CAMPAIGN_DAILY_CHARGES}:${testDate}`;
    const db = getDatabase();
    await db.execute(`DELETE FROM background_jobs WHERE run_key = ?`, [testRunKey]);
    await db.execute(`DELETE FROM job_locks WHERE lock_name = ?`, [testRunKey]);

    // Simulate 5 simultaneous worker scheduler firings
    const concurrentRuns = await Promise.all(
      [1, 2, 3, 4, 5].map((workerNum) =>
        JobEngine.executeJob(
          JOB_NAMES.CAMPAIGN_DAILY_CHARGES,
          { triggerType: 'SCHEDULED', runKey: testRunKey, lockTimeoutSeconds: 300 },
          async () => {
            // Slight delay to simulate task execution work
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { data: { success: true, worker: workerNum } };
          }
        ).then(
          (res) => ({ status: res.status, worker: workerNum, error: null }),
          (err) => ({ status: 'LOCKED', worker: workerNum, error: err.message })
        )
      )
    );

    const completed = concurrentRuns.filter((r) => r.status === 'COMPLETED');
    const lockedOut = concurrentRuns.filter((r) => r.status === 'LOCKED');

    assert('Exactly one concurrent worker executed successfully', completed.length === 1);
    assert('Remaining 4 concurrent attempts were safely blocked by distributed locks', lockedOut.length === 4);
    assert('Total non-duplicate executions is exactly 1', completed.length === 1);
  }

  // 5. SLA Notification Deduplication Dialect Compatibility
  console.log('\n--- 5. SLA Notification Deduplication Query Test ---');
  {
    const db = getDatabase();
    // Fetch a valid user and organization from the database to satisfy foreign keys
    const validUsers = await db.query<any>(`SELECT id, organization_id FROM users LIMIT 1`);
    const validUserId = validUsers.length > 0 ? validUsers[0].id : null;
    const validOrgId = validUsers.length > 0 ? validUsers[0].organization_id : null;

    const testAppId = 'sla_dedup_test_app_' + Date.now();
    const nowMs = Date.now();
    const twentyFourHoursAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    // Query on empty notifications table for testAppId
    const queryBefore = await db.query<any>(
      `SELECT id FROM notifications 
       WHERE entity_id = ? 
         AND type = 'sla_breached'
         AND created_at >= ?
       LIMIT 1`,
      [testAppId, twentyFourHoursAgoIso]
    );
    assert('Query executes without syntax error and returns 0 when no prior notification exists', queryBefore.length === 0);

    // Insert a notification created 1 hour ago
    const oneHourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
    await db.execute(
      `INSERT INTO notifications (id, user_id, organization_id, type, title, message, entity_type, entity_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'notif_test_' + Date.now(),
        validUserId,
        validOrgId,
        'sla_breached',
        'Test Breach',
        'Test Breach Message',
        'service_application',
        testAppId,
        0,
        oneHourAgo,
      ]
    );

    // Query again: should find recent notification
    const queryAfter = await db.query<any>(
      `SELECT id FROM notifications 
       WHERE entity_id = ? 
         AND type = 'sla_breached'
         AND created_at >= ?
       LIMIT 1`,
      [testAppId, twentyFourHoursAgoIso]
    );
    assert('Query correctly detects notification within 24h window using parameterized ISO cutoff', queryAfter.length === 1);

    // Insert a notification older than 25 hours ago
    const twentySixHoursAgo = new Date(nowMs - 26 * 60 * 60 * 1000).toISOString();
    const oldAppId = 'sla_old_test_app_' + Date.now();
    await db.execute(
      `INSERT INTO notifications (id, user_id, organization_id, type, title, message, entity_type, entity_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'notif_old_' + Date.now(),
        validUserId,
        validOrgId,
        'sla_breached',
        'Old Breach',
        'Old Breach Message',
        'service_application',
        oldAppId,
        0,
        twentySixHoursAgo,
      ]
    );

    const queryOld = await db.query<any>(
      `SELECT id FROM notifications 
       WHERE entity_id = ? 
         AND type = 'sla_breached'
         AND created_at >= ?
       LIMIT 1`,
      [oldAppId, twentyFourHoursAgoIso]
    );
    assert('Query correctly ignores notifications older than 24h cutoff', queryOld.length === 0);
  }

  // 6. ENABLE_BACKGROUND_SCHEDULER Configuration Check
  console.log('\n--- 6. ENABLE_BACKGROUND_SCHEDULER Disabled Behavior & Manual Triggers ---');
  {
    const originalEnvSetting = (BackgroundScheduler as any).isRunning;
    BackgroundScheduler.stop();

    // Temporarily mock disabled config flag
    const { env } = await import('./src/server/config/env.js');
    const originalConfig = env.ENABLE_BACKGROUND_SCHEDULER;
    (env as any).ENABLE_BACKGROUND_SCHEDULER = false;

    await BackgroundScheduler.start();
    const disabledStatus = BackgroundScheduler.getStatus();
    assert('When ENABLE_BACKGROUND_SCHEDULER is false, start() does not launch timers', !disabledStatus.running && disabledStatus.activeTimersCount === 0);

    // Manual triggers still function even when background scheduler is disabled
    const manualResult = await LeadOpportunityExpiryJob.run({ triggerType: 'MANUAL' });
    assert('Manual job runs succeed when background scheduler is disabled', manualResult.status === 'COMPLETED');

    // Restore config
    (env as any).ENABLE_BACKGROUND_SCHEDULER = originalConfig;
  }

  console.log(`\n========================================`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
