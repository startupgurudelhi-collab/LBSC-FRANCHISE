import express from 'express';
import { apiRouter } from './src/server/routes/index.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { generateToken } from './src/server/auth/security.js';
import {
  parseEnv,
  DEV_DEFAULT_JWT_SECRET,
  MIN_PRODUCTION_JWT_SECRET_LENGTH,
} from './src/server/config/env.js';

async function runTests() {
  console.log('====================================================');
  console.log('   PHASE 22E JWT SECURITY & SESSION REVOCATION TEST  ');
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

  // =========================================================================
  // GROUP 1: Production JWT Secret Validation & Startup Enforcement
  // =========================================================================
  console.log('--- TEST GROUP 1: Production JWT Secret Startup Validation ---');

  // 1A: Production missing JWT_SECRET -> startup rejected
  try {
    parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: '',
    });
    assert(false, 'Production missing JWT_SECRET must reject startup');
  } catch (err: any) {
    assert(
      err.message.includes('JWT_SECRET is required and cannot be empty in production'),
      'Production missing JWT_SECRET rejected with required error',
      err.message
    );
  }

  // 1B: Production with undefined JWT_SECRET -> startup rejected
  try {
    parseEnv({
      NODE_ENV: 'production',
      // JWT_SECRET completely omitted
    });
    assert(false, 'Production undefined JWT_SECRET must reject startup');
  } catch (err: any) {
    assert(
      err.message.includes('JWT_SECRET is required and cannot be empty in production'),
      'Production undefined JWT_SECRET rejected with required error',
      err.message
    );
  }

  // 1C: Production with default dev JWT_SECRET -> startup rejected
  try {
    parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: DEV_DEFAULT_JWT_SECRET,
    });
    assert(false, 'Production with dev default secret must reject startup');
  } catch (err: any) {
    assert(
      err.message.includes('cannot use the development default value in production'),
      'Production dev default secret rejected with specific error',
      err.message
    );
  }

  // 1D: Production with too-short secret (<32 chars) -> startup rejected
  try {
    parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'short_secret_under_32_chars',
    });
    assert(false, 'Production with secret < 32 chars must reject startup');
  } catch (err: any) {
    assert(
      err.message.includes(`must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters long`),
      'Production weak/short secret rejected with length error',
      err.message
    );
  }

  // 1E: Valid production secret -> startup succeeds
  try {
    const strongProdSecret = 'super_secure_production_jwt_secret_key_exceeding_32_characters_1234567890!';
    const parsedConfig = parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: strongProdSecret,
    });
    assert(
      parsedConfig.NODE_ENV === 'production' && parsedConfig.JWT_SECRET === strongProdSecret,
      'Valid production secret startup succeeds with configured secret'
    );
  } catch (err: any) {
    assert(false, 'Valid production secret startup failed unexpectedly', err.message);
  }

  // 1F: Development mode with unset JWT_SECRET -> usable default
  try {
    const devConfig = parseEnv({
      NODE_ENV: 'development',
    });
    assert(
      devConfig.NODE_ENV === 'development' && devConfig.JWT_SECRET === DEV_DEFAULT_JWT_SECRET,
      'Development environment keeps usable fallback secret'
    );
  } catch (err: any) {
    assert(false, 'Development environment fallback failed unexpectedly', err.message);
  }

  // =========================================================================
  // GROUP 2: Runtime API & Token Versioning Tests
  // =========================================================================
  const db = getDatabase();
  await runMigrations(db);
  await AuthService.seedDemoAccounts(db);

  // Setup Express test server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  try {
    console.log('\n--- TEST GROUP 2: Normal Login & Token Issuance ---');

    // 2A: Normal login returns valid token with tokenVersion
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@lbsc.internal',
        password: 'SuperAdminPassword123!',
      }),
    });
    const loginData = await loginRes.json();
    assert(
      loginRes.status === 200 &&
        Boolean(loginData.data?.token) &&
        loginData.data?.user?.tokenVersion !== undefined,
      'Normal login returns valid JWT token and user profile with tokenVersion'
    );

    const adminToken = loginData.data?.token;

    // 2B: Authenticated request with valid token succeeds
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await meRes.json();
    assert(
      meRes.status === 200 &&
        meData.success === true &&
        meData.data?.email === 'admin@lbsc.internal' &&
        meData.data?.tokenVersion === 1,
      'Authenticated GET /me succeeds and returns tokenVersion === 1'
    );

    console.log('\n--- TEST GROUP 3: Token Version Mismatch Rejected ---');

    // 3A: Token with mismatched tokenVersion is rejected (401)
    const mismatchedToken = generateToken({
      userId: 'usr_super_admin_001',
      email: 'admin@lbsc.internal',
      organizationId: null,
      roles: ['super_admin'],
      permissions: ['*'],
      tokenVersion: 999, // User in DB is at version 1
    });

    const mismatchRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${mismatchedToken}` },
    });
    const mismatchData = await mismatchRes.json();
    assert(
      mismatchRes.status === 401 &&
        mismatchData.error?.message?.includes('revoked or invalidated'),
      'Token version mismatch is rejected with HTTP 401 Unauthorized'
    );

    // 3B: Token with undefined tokenVersion (legacy/unversioned) is rejected (401)
    const legacyToken = generateToken({
      userId: 'usr_super_admin_001',
      email: 'admin@lbsc.internal',
      organizationId: null,
      roles: ['super_admin'],
      permissions: ['*'],
      // tokenVersion omitted
    });

    const legacyRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${legacyToken}` },
    });
    assert(
      legacyRes.status === 401,
      'Unversioned / missing tokenVersion JWT is rejected with HTTP 401 Unauthorized'
    );

    console.log('\n--- TEST GROUP 4: Password Change Increments Version & Invalidates Old Token ---');

    // Register a dedicated test user
    const testEmail = `jwt.user_${Date.now()}@test.internal`;
    const initialPassword = 'OldPassword123!';
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: initialPassword,
        firstName: 'JWT',
        lastName: 'Tester',
      }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && Boolean(regData.data?.token), 'Test user registration succeeds');

    const tokenBeforePwdChange = regData.data.token;
    const testUserId = regData.data.user.id;

    // Verify token works before password change
    const checkBeforeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenBeforePwdChange}` },
    });
    assert(checkBeforeRes.status === 200, 'Token works prior to password change');

    // Change password via API
    const newPassword = 'NewSecretPassword456!';
    const changePwdRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenBeforePwdChange}`,
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: newPassword,
      }),
    });
    const changePwdData = await changePwdRes.json();
    assert(
      changePwdRes.status === 200 && changePwdData.success === true,
      'Password change request succeeds (200 OK)'
    );

    // Verify DB token_version was incremented
    const userRows = await db.query<any>('SELECT token_version FROM users WHERE id = ?', [testUserId]);
    assert(
      Number(userRows[0]?.token_version) === 2,
      'Database token_version incremented from 1 to 2 upon password change'
    );

    // Verify old token is now INVALID (401)
    const oldTokenRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenBeforePwdChange}` },
    });
    assert(
      oldTokenRes.status === 401,
      'Previous token is immediately invalidated (401) after password change'
    );

    console.log('\n--- TEST GROUP 5: Newly Issued Token Works After Password Change ---');

    // Login with new password
    const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: newPassword,
      }),
    });
    const newLoginData = await newLoginRes.json();
    assert(
      newLoginRes.status === 200 &&
        newLoginData.data?.user?.tokenVersion === 2 &&
        Boolean(newLoginData.data?.token),
      'Login with new password succeeds and returns token with tokenVersion === 2'
    );

    const tokenAfterPwdChange = newLoginData.data.token;

    // Newly issued token works
    const newAuthRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenAfterPwdChange}` },
    });
    const newAuthData = await newAuthRes.json();
    assert(
      newAuthRes.status === 200 && newAuthData.data?.tokenVersion === 2,
      'Newly issued token works and verifies with current token_version'
    );

    console.log('\n--- TEST GROUP 6: Logout / Session Revocation ---');

    // Call logout endpoint to revoke session
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAfterPwdChange}` },
    });
    const logoutData = await logoutRes.json();
    assert(
      logoutRes.status === 200 && logoutData.success === true,
      'Logout / revocation endpoint succeeds (200 OK)'
    );

    // Verify DB token_version incremented again
    const postLogoutRows = await db.query<any>('SELECT token_version FROM users WHERE id = ?', [testUserId]);
    assert(
      Number(postLogoutRows[0]?.token_version) === 3,
      'Database token_version incremented to 3 upon logout'
    );

    // Token used to logout is now invalidated (401)
    const postLogoutAuthRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenAfterPwdChange}` },
    });
    assert(
      postLogoutAuthRes.status === 401,
      'Token session is immediately invalidated (401) following logout'
    );

    console.log('\n--- TEST GROUP 7: RBAC & Tenant Isolation Remains Intact ---');

    // 7A: Franchise Owner login
    const franLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner.salem.a@demo.lbsc.internal',
        password: 'SalemPass123!',
      }),
    });
    const franLoginData = await franLoginRes.json();
    assert(
      franLoginRes.status === 200 &&
        franLoginData.data?.user?.organizationId === 'org_salem_001' &&
        franLoginData.data?.user?.roles?.includes('franchise_owner'),
      'Franchise Owner logs in with franchise organization context and roles'
    );

    const franToken = franLoginData.data.token;

    // 7B: Franchise Owner cannot access Super Admin endpoints (e.g. /jobs/status) -> 403 Forbidden
    const forbiddenRes = await fetch(`${baseUrl}/jobs/status`, {
      headers: { Authorization: `Bearer ${franToken}` },
    });
    assert(
      forbiddenRes.status === 403,
      'Franchise user blocked from Super-Admin-only endpoint with HTTP 403 Forbidden'
    );

    // 7C: Super Admin can access Super Admin endpoints -> 200 OK
    const adminJobsRes = await fetch(`${baseUrl}/jobs/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminJobsRes.status === 200,
      'Super Admin retains full access to administrative endpoints with HTTP 200 OK'
    );

    console.log('\n====================================================');
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log('====================================================');

    server.close();
    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test runner error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
