import express from 'express';
import http from 'http';
import { apiRouter } from './src/server/routes/index.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { hashPassword } from './src/server/auth/security.js';
import { env } from './src/server/config/env.js';
import { EfilinggClient } from './src/server/integrations/efilingg/efilinggClient.js';
import { EfilinggIntegrationService } from './src/server/integrations/efilingg/efilinggService.js';

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
            parsed = null;
          }
          resolve({
            status: res.statusCode || 500,
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

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: any) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description}`, details !== undefined ? details : '');
    failed++;
  }
}

async function runVerification() {
  console.log('=================================================================');
  console.log(' Phase 19B.4 — Efilingg Integration End-to-End Verification Suite');
  console.log('=================================================================\n');

  const db = getDatabase();
  await runMigrations(db);
  await AuthService.seedDemoAccounts(db);

  // Spin up test HTTP server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 0. Acquire Tokens for Super Admin and Franchise User
    console.log('--- 0. Authentication & Setup ---');
    const superAdminLogin = await AuthService.login('admin@lbsc.internal', 'SuperAdminPassword123!');
    const superAdminToken = superAdminLogin.token;
    assert('Super Admin logged in successfully', Boolean(superAdminToken));

    const franchiseLogin = await AuthService.login('owner.salem.a@demo.lbsc.internal', 'SalemPass123!');
    const franchiseToken = franchiseLogin.token;
    const franchiseOrgId = franchiseLogin.user.organizationId!;
    assert('Franchise Owner logged in successfully', Boolean(franchiseToken && franchiseOrgId));

    // Create a secondary Franchise Org and User to test Tenant Isolation
    const org2Id = `org_tenant_b_${Date.now()}`;
    await db.execute(
      `INSERT INTO organizations (id, code, name, type, status) VALUES (?, ?, ?, 'franchise', 'active')`,
      [org2Id, `ORG_${Date.now()}`, 'Franchise B Tenant Isolation']
    );
    const user2Id = `usr_tenant_b_${Date.now()}`;
    const user2Email = `owner.tenantb_${Date.now()}@demo.lbsc.internal`;
    const user2Hash = await hashPassword('TestPass123!');
    await db.execute(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status, token_version)
       VALUES (?, ?, ?, ?, 'Tenant', 'B', 'active', 1)`,
      [user2Id, org2Id, user2Email, user2Hash]
    );
    // Assign franchise owner role to user2
    const franchiseRoleRows = await db.query<any>("SELECT id FROM roles WHERE code = 'franchise_owner' LIMIT 1");
    if (franchiseRoleRows.length > 0) {
      await db.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [user2Id, franchiseRoleRows[0].id]);
    }
    const tenantBLogin = await AuthService.login(user2Email, 'TestPass123!');
    const tenantBToken = tenantBLogin.token;
    assert('Tenant B Franchise User authenticated for isolation testing', Boolean(tenantBToken));

    // Setup Test Service Master and Client for Application Creation
    const testServiceId = 'svc_gst_reg';

    const testClientId = `cli_test_${Date.now()}`;
    await db.execute(
      `INSERT INTO clients (id, client_number, franchise_id, first_name, last_name, full_name, email, phone, business_name, city, district, state, status)
       VALUES (?, ?, ?, 'Ramesh', 'Kumar', 'Ramesh Kumar', 'ramesh@example.com', '+919876543210', 'Ramesh Enterprises', 'Salem', 'Salem', 'Tamil Nadu', 'active')`,
      [testClientId, `CLI-${Date.now().toString().slice(-6)}`, franchiseOrgId]
    );

    // Create Test Application in Franchise A
    const testAppId = `app_p19b_${Date.now()}`;
    const testAppNumber = `APP-2026-${Date.now().toString().slice(-6)}`;
    await db.execute(
      `INSERT INTO service_applications (
        id, franchise_id, client_id, service_id, application_number, status, priority,
        service_fee_snapshot, commission_value_snapshot, commission_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', 'normal', 2500, 500, 'PENDING', datetime('now'), datetime('now'))`,
      [testAppId, franchiseOrgId, testClientId, testServiceId, testAppNumber]
    );
    assert('Test Service Application seeded successfully in DRAFT state', true);

    // =========================================================================
    // 1. Gateway status and SANDBOX/DISABLED/LIVE display
    // =========================================================================
    console.log('\n--- 1. Gateway Status & Mode Display ---');
    const statusRes = await makeRequest(server, '/api/v1/integrations/efilingg/status', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('Super Admin GET /api/v1/integrations/efilingg/status returns 200', statusRes.status === 200);
    assert('Response success flag is true', statusRes.body?.success === true);
    assert('Mode defaults to SANDBOX in development/test', statusRes.body?.data?.mode === 'SANDBOX');
    assert('Configured flags returned correctly', typeof statusRes.body?.data?.apiUrlConfigured === 'boolean');
    assert('Status message clearly indicates mode', typeof statusRes.body?.data?.statusMessage === 'string');

    // =========================================================================
    // 2. Super Admin sandbox sync, including simulated-data labeling
    // =========================================================================
    console.log('\n--- 2. Super Admin Sandbox Sync & Simulated Labeling ---');
    const syncRes = await makeRequest(server, `/api/v1/integrations/efilingg/sync/${testAppId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('Super Admin POST /api/v1/integrations/efilingg/sync/:id returns 200', syncRes.status === 200);
    assert('Sync result success is true', syncRes.body?.data?.syncResult?.success === true);
    assert('Sync result mode is SANDBOX', syncRes.body?.data?.syncResult?.mode === 'SANDBOX');
    assert('Sync result marked with isSimulated = true', syncRes.body?.data?.syncResult?.isSimulated === true);
    assert(
      'External filing ID is clearly prefixed with SIMULATED_EFIL_',
      syncRes.body?.data?.syncResult?.externalFilingId?.startsWith('SIMULATED_EFIL_')
    );
    assert(
      'Simulated ARN starts with SIMULATED_ARN_',
      syncRes.body?.data?.syncResult?.arnNumber?.startsWith('SIMULATED_ARN_')
    );
    assert(
      'Simulated SRN starts with SIMULATED_SRN_',
      syncRes.body?.data?.syncResult?.srnNumber?.startsWith('SIMULATED_SRN_')
    );
    assert(
      'Response message explicitly mentions [SANDBOX/SIMULATED]',
      syncRes.body?.message?.includes('[SANDBOX/SIMULATED]')
    );

    // Verify database updates from sync
    const syncedDbRows = await db.query<any>('SELECT * FROM service_applications WHERE id = ?', [testAppId]);
    const syncedApp = syncedDbRows[0];
    assert('Database efilingg_status updated to SYNCED', syncedApp.efilingg_status === 'SYNCED');
    assert('Database external_filing_id stored', Boolean(syncedApp.external_filing_id));
    assert('Database arn_number stored', Boolean(syncedApp.arn_number));
    assert('Database srn_number stored', Boolean(syncedApp.srn_number));
    assert('Database efilingg_synced_at timestamp populated', Boolean(syncedApp.efilingg_synced_at));
    assert('Database efilingg_sync_error is null after success', syncedApp.efilingg_sync_error === null);

    // Verify operational work note created with [SANDBOX/SIMULATED] label
    const syncNotes = await db.query<any>(
      `SELECT * FROM service_application_work_notes WHERE application_id = ? AND note_type = 'integration_sync'`,
      [testAppId]
    );
    assert('Operational work note recorded for sync', syncNotes.length > 0);
    assert(
      'Work note text clearly labeled [SANDBOX/SIMULATED]',
      Boolean(syncNotes[0]?.note?.includes('[SANDBOX/SIMULATED]'))
    );

    // Verify audit log recorded
    const syncAudit = await db.query<any>(
      `SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'EFILINGG_SYNC_SUCCESS'`,
      [testAppId]
    );
    assert('Audit log recorded EFILINGG_SYNC_SUCCESS action', syncAudit.length > 0);

    // =========================================================================
    // 3. Super Admin manual ARN/SRN/Challan/status update & persistence after reload
    // =========================================================================
    console.log('\n--- 3. Super Admin Manual References Update & Persistence ---');
    const manualUpdatePayload = {
      arn_number: 'AA270124012345M',
      srn_number: 'R98765432',
      challan_number: 'CHL-2024-8877',
      efilingg_status: 'APPROVED',
      notes: 'Direct MCA portal verification: Challan fee settled and ARN confirmed.',
    };

    const updateRes = await makeRequest(server, `/api/v1/integrations/efilingg/references/${testAppId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: manualUpdatePayload,
    });
    assert('Super Admin PATCH /api/v1/integrations/efilingg/references/:id returns 200', updateRes.status === 200);
    assert('Response indicates update success', updateRes.body?.success === true);
    assert('Returned ARN matches updated value', updateRes.body?.data?.arn_number === 'AA270124012345M');
    assert('Returned SRN matches updated value', updateRes.body?.data?.srn_number === 'R98765432');
    assert('Returned Challan matches updated value', updateRes.body?.data?.challan_number === 'CHL-2024-8877');
    assert('Returned status matches APPROVED', updateRes.body?.data?.efilingg_status === 'APPROVED');

    // Persistence Check: Fetch via GET endpoint simulating a clean page reload
    const reloadRes = await makeRequest(server, `/api/v1/service-applications/${testAppId}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('Refetch /api/v1/service-applications/:id returns 200 after update', reloadRes.status === 200);
    const reloadedApp = reloadRes.body?.data;
    assert('Persisted ARN matches across reload', reloadedApp?.arn_number === 'AA270124012345M');
    assert('Persisted SRN matches across reload', reloadedApp?.srn_number === 'R98765432');
    assert('Persisted Challan matches across reload', reloadedApp?.challan_number === 'CHL-2024-8877');
    assert('Persisted efilingg_status matches APPROVED', reloadedApp?.efilingg_status === 'APPROVED');

    // Verify operational work note recorded for manual reference update
    const updateNotes = await db.query<any>(
      `SELECT * FROM service_application_work_notes WHERE application_id = ? AND note_type = 'filing_reference_update'`,
      [testAppId]
    );
    assert('Operational note recorded for manual reference update', updateNotes.length > 0);
    assert(
      'Operational note includes administrator remarks',
      updateNotes[0]?.note === manualUpdatePayload.notes
    );

    // =========================================================================
    // 4. Franchise view displays the same saved references and status as read-only data
    // =========================================================================
    console.log('\n--- 4. Franchise Read-Only Data Consistency ---');
    const franchiseGetRes = await makeRequest(server, `/api/v1/service-applications/${testAppId}`, {
      headers: { Authorization: `Bearer ${franchiseToken}` },
    });
    assert('Franchise user can view their application details (200)', franchiseGetRes.status === 200);
    const franchiseAppData = franchiseGetRes.body?.data;
    assert('Franchise sees matching ARN Number', franchiseAppData?.arn_number === 'AA270124012345M');
    assert('Franchise sees matching SRN Number', franchiseAppData?.srn_number === 'R98765432');
    assert('Franchise sees matching Challan Number', franchiseAppData?.challan_number === 'CHL-2024-8877');
    assert('Franchise sees matching efilingg_status', franchiseAppData?.efilingg_status === 'APPROVED');
    assert('Franchise sees matching external_filing_id', franchiseAppData?.external_filing_id === syncedApp.external_filing_id);

    // Create a fresh application without filing references to test "Not yet generated" state
    const unfiledAppId = `app_unfiled_${Date.now()}`;
    await db.execute(
      `INSERT INTO service_applications (
        id, franchise_id, client_id, service_id, application_number, status, priority,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', 'normal', datetime('now'), datetime('now'))`,
      [unfiledAppId, franchiseOrgId, testClientId, testServiceId, `APP-UNFILED-${Date.now().toString().slice(-4)}`]
    );
    const unfiledGetRes = await makeRequest(server, `/api/v1/service-applications/${unfiledAppId}`, {
      headers: { Authorization: `Bearer ${franchiseToken}` },
    });
    const unfiledAppData = unfiledGetRes.body?.data;
    assert('Unfiled application has null ARN (displays "Not yet generated")', unfiledAppData?.arn_number === null);
    assert('Unfiled application has null SRN (displays "Not yet generated")', unfiledAppData?.srn_number === null);
    assert('Unfiled application has null Challan (displays "Not yet generated")', unfiledAppData?.challan_number === null);
    assert('Unfiled application has NOT_SYNCED or null status', !unfiledAppData?.efilingg_status || unfiledAppData?.efilingg_status === 'NOT_SYNCED');

    // =========================================================================
    // 5. Unauthorized users cannot sync applications or update filing references
    // =========================================================================
    console.log('\n--- 5. Authorization & Multi-Tenant Isolation Enforcement ---');
    // 5A: Unauthenticated calls rejected with 401
    const unauthStatus = await makeRequest(server, '/api/v1/integrations/efilingg/status');
    assert('Unauthenticated GET /status returns 401', unauthStatus.status === 401);

    const unauthSync = await makeRequest(server, `/api/v1/integrations/efilingg/sync/${testAppId}`, {
      method: 'POST',
    });
    assert('Unauthenticated POST /sync returns 401', unauthSync.status === 401);

    const unauthUpdate = await makeRequest(server, `/api/v1/integrations/efilingg/references/${testAppId}`, {
      method: 'PATCH',
      body: { arn_number: 'HACKED' },
    });
    assert('Unauthenticated PATCH /references returns 401', unauthUpdate.status === 401);

    // 5B: Franchise user (non-super-admin) blocked from Admin-only endpoints with 403
    const franchiseStatus = await makeRequest(server, '/api/v1/integrations/efilingg/status', {
      headers: { Authorization: `Bearer ${franchiseToken}` },
    });
    assert('Franchise user calling GET /status receives 403 Forbidden', franchiseStatus.status === 403);

    const franchiseUpdate = await makeRequest(server, `/api/v1/integrations/efilingg/references/${testAppId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${franchiseToken}` },
      body: { arn_number: 'ILLEGAL_OVERRIDE' },
    });
    assert('Franchise user calling PATCH /references receives 403 Forbidden', franchiseUpdate.status === 403);

    // Verify DB was NOT modified by unauthorized update
    const checkDbUnchanged = await db.query<any>('SELECT arn_number FROM service_applications WHERE id = ?', [testAppId]);
    assert('Database reference was NOT modified by unauthorized attempt', checkDbUnchanged[0].arn_number === 'AA270124012345M');

    // 5C: Tenant Isolation: Tenant B cannot sync an application belonging to Franchise A
    const tenantBCrossSync = await makeRequest(server, `/api/v1/integrations/efilingg/sync/${testAppId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tenantBToken}` },
    });
    assert(
      'Cross-organization sync blocked with 400 Bad Request',
      tenantBCrossSync.status === 400
    );
    assert(
      'Error message states access denied for another organization',
      Boolean(
        tenantBCrossSync.body?.error?.message?.includes('Cannot sync applications belonging to another organization') ||
        tenantBCrossSync.body?.message?.includes('Cannot sync applications belonging to another organization')
      )
    );

    // =========================================================================
    // 6. LIVE mode fails closed without valid vendor configuration
    // =========================================================================
    console.log('\n--- 6. LIVE Mode Fail-Closed & DISABLED Mode Safety ---');
    const originalMode = (env as any).EFILINGG_MODE;
    try {
      // 6A: LIVE mode without configured vendor credentials
      (env as any).EFILINGG_MODE = 'LIVE';
      (env as any).EFILINGG_API_URL = '';
      (env as any).EFILINGG_API_KEY = '';

      const liveSyncRes = await EfilinggClient.pushApplication({
        applicationId: testAppId,
        applicationNumber: testAppNumber,
        documentsCount: 0,
      });
      assert('LIVE mode without credentials returns success = false', liveSyncRes.success === false);
      assert('LIVE mode returns status = FAILED', liveSyncRes.status === 'FAILED');
      assert(
        'LIVE mode error explains missing vendor contract/credentials',
        Boolean(liveSyncRes.error?.includes('LIVE Efilingg integration blocked'))
      );
      assert('LIVE mode does NOT generate simulated tokens', liveSyncRes.isSimulated === false);

      // Sync through service in LIVE mode
      const serviceLiveSync = await EfilinggIntegrationService.syncApplication(testAppId, superAdminLogin.user as any);
      assert('Service sync in LIVE mode fails safely', serviceLiveSync.syncResult.success === false);
      assert('Service sync sets efilingg_status to FAILED', serviceLiveSync.updatedApplication.efilingg_status === 'FAILED');
      assert('Service sync records sync error in DB', Boolean(serviceLiveSync.updatedApplication.efilingg_sync_error));

      // 6B: DISABLED mode
      (env as any).EFILINGG_MODE = 'DISABLED';
      const disabledSyncRes = await EfilinggClient.pushApplication({
        applicationId: testAppId,
        applicationNumber: testAppNumber,
        documentsCount: 0,
      });
      assert('DISABLED mode returns success = false', disabledSyncRes.success === false);
      assert('DISABLED mode returns mode = DISABLED', disabledSyncRes.mode === 'DISABLED');
      assert(
        'DISABLED mode message explains integration is disabled',
        Boolean(disabledSyncRes.message?.includes('Integration is disabled'))
      );
    } finally {
      // Restore mode
      (env as any).EFILINGG_MODE = originalMode || 'SANDBOX';
    }

    // =========================================================================
    // 7. Loading, API failure, missing references & webhook handling
    // =========================================================================
    console.log('\n--- 7. API Failure Handling & Webhook Verification ---');
    // 7A: Non-existent application ID
    const notFoundSync = await makeRequest(server, '/api/v1/integrations/efilingg/sync/app_non_existent_99999', {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('Sync on non-existent application returns 404', notFoundSync.status === 404);

    const notFoundUpdate = await makeRequest(server, '/api/v1/integrations/efilingg/references/app_non_existent_99999', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: { arn_number: 'AA1111111111111' },
    });
    assert('Reference update on non-existent application returns 404', notFoundUpdate.status === 404);

    // 7B: Webhook receiving valid filing update
    const webhookRes = await makeRequest(server, '/api/v1/integrations/efilingg/webhook', {
      method: 'POST',
      body: {
        event: 'FILING_STATUS_UPDATE',
        applicationNumber: testAppNumber,
        externalFilingId: syncedApp.external_filing_id || 'EXT_TEST_001',
        arnNumber: 'AA270124099999M',
        srnNumber: 'R99999999',
        challanNumber: 'CHL-9999',
        status: 'IN_PROGRESS',
        isSimulated: true,
      },
    });
    assert('Valid webhook payload processed (200 OK)', webhookRes.status === 200);

    const postWebhookApp = await db.query<any>('SELECT * FROM service_applications WHERE id = ?', [testAppId]);
    assert('Webhook updated status to IN_PROGRESS', postWebhookApp[0].efilingg_status === 'IN_PROGRESS');
    assert('Webhook updated ARN number', postWebhookApp[0].arn_number === 'AA270124099999M');

    // =========================================================================
    // 8. Existing service application workflows remain functional
    // =========================================================================
    console.log('\n--- 8. Existing Service Application Workflows Integrity ---');
    // 8A: Submit DRAFT application
    const submitRes = await makeRequest(server, `/api/v1/service-applications/${unfiledAppId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${franchiseToken}` },
    });
    assert('Submit application endpoint succeeds (200)', submitRes.status === 200);
    assert('Application status transitions to SUBMITTED', submitRes.body?.data?.status === 'SUBMITTED');
    assert('Service fee snapshotted', Number(submitRes.body?.data?.service_fee_snapshot) > 0);
    assert('Commission value snapshotted', Number(submitRes.body?.data?.commission_value_snapshot) > 0);

    // 8B: List service applications with filters
    const listRes = await makeRequest(server, '/api/v1/service-applications?status=SUBMITTED', {
      headers: { Authorization: `Bearer ${franchiseToken}` },
    });
    assert('List service applications returns 200', listRes.status === 200);
    assert('List contains submitted application', Array.isArray(listRes.body?.data) && listRes.body.data.some((a: any) => a.id === unfiledAppId));

    console.log('\n=================================================================');
    console.log(` Phase 19B.4 Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('=================================================================\n');

  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
