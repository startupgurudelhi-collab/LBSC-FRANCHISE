import express from 'express';
import http from 'http';
import { apiRouter } from './src/server/routes/index.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { getDatabase } from './src/server/db/connection.js';
import { runMigrations, acquireMigrationLock, releaseMigrationLock } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { JobEngine } from './src/server/jobs/jobEngine.js';
import { sanitizeLogString, sanitizeForLogging } from './src/server/utils/loggerSanitizer.js';
import { ConflictError } from './src/server/errors/AppError.js';

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
  rawText: string;
}

function makeRequest(
  server: http.Server,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      return reject(new Error('Server not listening on a port'));
    }

    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };

    if (payload && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method: options.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            rawText: rawData,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('   PHASE 22G REMAINING SECURITY HARDENING TESTS     ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      if (details) console.error(`         Details: ${details}`);
    }
  }

  const db = getDatabase();
  await runMigrations(db);
  await AuthService.seedDemoAccounts(db);

  // =========================================================================
  // GROUP 1: Health & Error Information Leakage Protection
  // =========================================================================
  console.log('--- TEST GROUP 1: Health & Error Information Leakage ---');

  // 1A: Production /api/health does NOT expose internals
  const prodApp = express();
  prodApp.set('env', 'production');
  prodApp.use('/api', apiRouter);
  prodApp.use(errorHandler);
  const prodServer = http.createServer(prodApp);
  await new Promise<void>((resolve) => prodServer.listen(0, '127.0.0.1', resolve));

  const prodHealthRes = await makeRequest(prodServer, '/api/health');
  prodServer.close();

  const prodHealthData = prodHealthRes.body?.data;
  assert(
    prodHealthRes.status === 200 && prodHealthData?.status === 'healthy',
    'Production /api/health returns HTTP 200 with healthy status'
  );
  assert(
    prodHealthData?.database?.ok === true,
    'Production /api/health preserves database.ok indicator'
  );
  assert(
    prodHealthData?.database?.dialect === undefined,
    'Production /api/health hides database dialect from response',
    JSON.stringify(prodHealthData?.database)
  );
  assert(
    prodHealthData?.database?.activeMigrations === undefined,
    'Production /api/health hides migration counts and details'
  );
  assert(
    prodHealthData?.database?.lastMigration === undefined,
    'Production /api/health hides last applied migration name'
  );
  assert(
    prodHealthData?.database?.error === undefined,
    'Production /api/health hides internal connection errors or paths'
  );

  // 1B: Development /api/health retains diagnostics
  const devApp = express();
  devApp.set('env', 'development');
  devApp.use('/api', apiRouter);
  devApp.use(errorHandler);
  const devServer = http.createServer(devApp);
  await new Promise<void>((resolve) => devServer.listen(0, '127.0.0.1', resolve));

  const devHealthRes = await makeRequest(devServer, '/api/health');
  devServer.close();

  const devHealthData = devHealthRes.body?.data;
  assert(
    devHealthData?.database?.dialect !== undefined,
    'Development /api/health preserves database dialect diagnostic'
  );

  // 1C: Log Sanitization: Database Connection Strings, Secrets & Headers
  const rawConnString = 'postgresql://db_user:SuperSecretPassword123!@db.internal:5432/lbsc_prod';
  const sanitizedConn = sanitizeLogString(rawConnString);
  assert(
    !sanitizedConn.includes('SuperSecretPassword123!') && sanitizedConn.includes('db_user:[REDACTED]@'),
    'Database connection strings have credentials masked',
    sanitizedConn
  );

  const rawAuthHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.abc123xyz';
  const sanitizedAuth = sanitizeLogString(rawAuthHeader);
  assert(
    sanitizedAuth.includes('Bearer [REDACTED]') || sanitizedAuth.includes('[REDACTED_JWT]'),
    'Bearer tokens and JWT strings are sanitized in log strings',
    sanitizedAuth
  );

  const sensitivePayload = {
    email: 'admin@lbsc.internal',
    password: 'MyPlainTextSecretPassword',
    apiKey: 'sk_live_1234567890abcdef',
    token: 'jwt_token_sample',
    nested: {
      clientSecret: 'secret_value_999',
      safeField: 'visible_data',
    },
  };
  const sanitizedObj = sanitizeForLogging(sensitivePayload) as any;
  assert(
    sanitizedObj.password === '[REDACTED]',
    'Object sanitization redacts password field'
  );
  assert(
    sanitizedObj.apiKey === '[REDACTED]',
    'Object sanitization redacts apiKey field'
  );
  assert(
    sanitizedObj.nested.clientSecret === '[REDACTED]' && sanitizedObj.nested.safeField === 'visible_data',
    'Nested object sanitization redacts secrets while preserving safe fields'
  );

  // =========================================================================
  // GROUP 2: Migration Startup Safety & Concurrency Locking
  // =========================================================================
  console.log('\n--- TEST GROUP 2: Migration Startup Safety & Concurrency Locking ---');

  // 2A: Active migration lock blocks concurrent migrations
  const lockA = await acquireMigrationLock(db, 60);
  assert(Boolean(lockA), 'Instance A successfully acquires migration lock');

  let blockedInstanceB = false;
  try {
    await acquireMigrationLock(db, 60);
  } catch (err: any) {
    blockedInstanceB = true;
    assert(
      err.message.includes('Migration lock active: currently held by instance'),
      'Instance B blocked from concurrent migration while lock is active',
      err.message
    );
  }
  assert(blockedInstanceB, 'Concurrent migration lock acquisition was rejected');

  // Release lock A
  await releaseMigrationLock(db, lockA);

  // 2B: Now Instance B can acquire lock cleanly
  const lockB = await acquireMigrationLock(db, 60);
  assert(Boolean(lockB), 'Instance B acquires lock after Instance A releases');
  await releaseMigrationLock(db, lockB);

  // 2C: Expired lock takeover race: atomic CAS ensures exactly one winner
  // Insert an already-expired lock manually
  const expiredPastDate = new Date(Date.now() - 3600000).toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO _migration_locks (lock_id, locked_by, locked_at, expires_at)
     VALUES (1, 'old_crashed_instance', ?, ?)`,
    [expiredPastDate, expiredPastDate]
  );

  // Concurrently attempt takeover with 5 workers
  const takeoverPromises = Array.from({ length: 5 }, () =>
    acquireMigrationLock(db, 60).then(
      (id) => ({ success: true, id, error: null }),
      (err) => ({ success: false, id: null, error: err.message })
    )
  );

  const results = await Promise.all(takeoverPromises);
  const winners = results.filter((r) => r.success);
  const losers = results.filter((r) => !r.success);

  assert(
    winners.length === 1,
    `Atomic CAS ensures exactly one worker acquires expired migration lock (Winners: ${winners.length})`,
    JSON.stringify(results)
  );
  assert(
    losers.length === 4,
    `All other concurrent workers lost the race (Losers: ${losers.length})`
  );

  // Clean up winner lock
  if (winners[0]?.id) {
    await releaseMigrationLock(db, winners[0].id);
  }

  // =========================================================================
  // GROUP 3: Authentication Audit Logging
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Authentication Audit Logging ---');

  // 3A: Successful login audit log
  const uniqueLoginEmail = 'admin@lbsc.internal';
  await AuthService.login(uniqueLoginEmail, 'SuperAdminPassword123!', {
    ipAddress: '198.51.100.99',
    userAgent: 'AuditTestRunner/1.0',
  });

  const successLogs = await db.query<any>(
    `SELECT * FROM audit_logs 
     WHERE action = 'AUTH_LOGIN_SUCCESS' AND entity_id = 'usr_super_admin_001'
     ORDER BY created_at DESC LIMIT 1`
  );
  assert(
    successLogs.length > 0,
    'Successful login produces AUTH_LOGIN_SUCCESS audit log entry'
  );
  const successLog = successLogs[0];
  const newValsSuccess = JSON.parse(successLog.new_values || '{}');
  assert(
    newValsSuccess.email === uniqueLoginEmail &&
      successLog.ip_address === '198.51.100.99',
    'Audit log contains email and IP address of successful login'
  );
  assert(
    newValsSuccess.password === undefined && successLog.new_values.indexOf('SuperAdminPassword') === -1,
    'Audit log NEVER stores password on successful login'
  );

  // 3B: Failed login attempt audit log (bad password)
  try {
    await AuthService.login(uniqueLoginEmail, 'WrongPasswordAttempt999!', {
      ipAddress: '198.51.100.101',
      userAgent: 'FailedLoginTest/1.0',
    });
  } catch {
    // Expected UnauthorizedError
  }

  const failedLogs = await db.query<any>(
    `SELECT * FROM audit_logs 
     WHERE action = 'AUTH_LOGIN_FAILED' AND entity_id = 'usr_super_admin_001'
     ORDER BY created_at DESC LIMIT 1`
  );
  assert(
    failedLogs.length > 0,
    'Failed login produces AUTH_LOGIN_FAILED audit log entry'
  );
  const failedLog = failedLogs[0];
  const newValsFailed = JSON.parse(failedLog.new_values || '{}');
  assert(
    newValsFailed.reason === 'INVALID_CREDENTIALS',
    'Failed login logs failure reason without passwords'
  );
  assert(
    !failedLog.new_values.includes('WrongPasswordAttempt999'),
    'Audit log NEVER stores attempted password on failed login'
  );

  // 3C: Failed login attempt audit log (unknown user)
  const unknownUserEmail = 'nonexistent.user@random.test';
  try {
    await AuthService.login(unknownUserEmail, 'SecretPass123!');
  } catch {
    // Expected UnauthorizedError
  }

  const unknownUserLogs = await db.query<any>(
    `SELECT * FROM audit_logs 
     WHERE action = 'AUTH_LOGIN_FAILED' AND entity_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [unknownUserEmail]
  );
  assert(
    unknownUserLogs.length > 0 &&
      JSON.parse(unknownUserLogs[0].new_values || '{}').reason === 'USER_NOT_FOUND',
    'Failed login for non-existent user logs USER_NOT_FOUND reason'
  );

  // 3D: Registration audit log
  const newRegEmail = `newuser_${Date.now()}@example.com`;
  const regResult = await AuthService.register(
    {
      email: newRegEmail,
      password: 'StrongPassword123!',
      firstName: 'Audit',
      lastName: 'User',
    },
    { ipAddress: '198.51.100.105' }
  );

  const regLogs = await db.query<any>(
    `SELECT * FROM audit_logs 
     WHERE action = 'AUTH_REGISTER' AND entity_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [regResult.user.id]
  );
  assert(
    regLogs.length > 0,
    'User registration produces AUTH_REGISTER audit log entry'
  );
  const regLog = regLogs[0];
  const newValsReg = JSON.parse(regLog.new_values || '{}');
  assert(
    newValsReg.email === newRegEmail && !regLog.new_values.includes('StrongPassword123!'),
    'Registration audit log stores metadata without plain/hashed password'
  );

  // 3E: Account status change / deactivation audit log
  await AuthService.updateUserStatus(regResult.user.id, 'inactive', { id: 'usr_super_admin_001' });

  const statusLogs = await db.query<any>(
    `SELECT * FROM audit_logs 
     WHERE action = 'USER_STATUS_CHANGED' AND entity_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [regResult.user.id]
  );
  assert(
    statusLogs.length > 0,
    'Account deactivation produces USER_STATUS_CHANGED audit log entry'
  );
  const statusLog = statusLogs[0];
  const oldVals = JSON.parse(statusLog.old_values || '{}');
  const newVals = JSON.parse(statusLog.new_values || '{}');
  assert(
    oldVals.status === 'active' && newVals.status === 'inactive',
    'Status change audit log correctly tracks transition active -> inactive'
  );

  // Deactivated user cannot log in
  let deactivatedLoginBlocked = false;
  try {
    await AuthService.login(newRegEmail, 'StrongPassword123!');
  } catch (err: any) {
    deactivatedLoginBlocked = true;
    assert(
      err.message.includes('Account is inactive'),
      'Deactivated user login is blocked with inactive account error'
    );
  }
  assert(deactivatedLoginBlocked, 'Deactivated account cannot log in');

  // =========================================================================
  // GROUP 4: Background Job Lock Race (Atomic Compare-and-Swap)
  // =========================================================================
  console.log('\n--- TEST GROUP 4: Background Job Lock Race (Atomic CAS) ---');

  const testJobName = `job_test_sync_${Date.now()}`;
  const worker1 = 'worker_node_1';
  const worker2 = 'worker_node_2';

  // 4A: Normal unexpired lock acquisition
  const lockAcquired = await JobEngine.acquireLock(testJobName, worker1, 300);
  assert(lockAcquired === true, 'Worker 1 acquires unexpired job lock');

  // 4B: Second worker blocked while lock is active
  let worker2Blocked = false;
  try {
    await JobEngine.acquireLock(testJobName, worker2, 300);
  } catch (err: any) {
    worker2Blocked = true;
    assert(
      err instanceof ConflictError && err.message.includes('currently running with an active lock'),
      'Worker 2 receives ConflictError while lock is held by Worker 1',
      err.message
    );
  }
  assert(worker2Blocked, 'Active job lock blocks second worker');

  // 4C: Expired Lock Takeover Race (Atomic CAS)
  // Force the job lock into an expired state
  const pastExpiry = new Date(Date.now() - 60000).toISOString();
  await db.execute(
    `UPDATE job_locks SET expires_at = ?, locked_at = ? WHERE lock_name = ?`,
    [pastExpiry, pastExpiry, testJobName]
  );

  // Concurrently attempt takeover with 8 workers
  const concurrentWorkers = Array.from({ length: 8 }, (_, i) => `concurrent_worker_${i}`);
  const raceResults = await Promise.all(
    concurrentWorkers.map((wId) =>
      JobEngine.acquireLock(testJobName, wId, 300).then(
        () => ({ worker: wId, success: true, error: null }),
        (err) => ({ worker: wId, success: false, error: err.message })
      )
    )
  );

  const lockWinners = raceResults.filter((r) => r.success);
  const lockLosers = raceResults.filter((r) => !r.success);

  assert(
    lockWinners.length === 1,
    `Atomic CAS ensures exactly ONE worker acquires expired job lock (Winners: ${lockWinners.length})`,
    JSON.stringify(raceResults)
  );
  assert(
    lockLosers.length === 7,
    `All 7 other workers receive ConflictError during expired lock race (Losers: ${lockLosers.length})`
  );

  // 4D: Release lock cleanly allows subsequent job runs
  await JobEngine.releaseLock(testJobName);
  const lockAfterRelease = await JobEngine.acquireLock(testJobName, 'new_cycle_worker', 300);
  assert(
    lockAfterRelease === true,
    'After releaseLock, job lock is available for subsequent execution'
  );
  await JobEngine.releaseLock(testJobName);

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('====================================================');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running Phase 22G tests:', err);
  process.exit(1);
});
