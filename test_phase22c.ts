import express from 'express';
import { apiRouter } from './src/server/routes/index.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { generateToken } from './src/server/auth/security.js';

async function runTests() {
  console.log('====================================================');
  console.log('   PHASE 22C TENANT ISOLATION & IDOR TEST SUITE');
  console.log('====================================================\n');

  const db = getDatabase();
  await runMigrations(db);
  await AuthService.seedDemoAccounts(db);

  // Setup Express test instance
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/v1`;

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

  try {
    // -------------------------------------------------------------------------
    // Setup Test Fixtures: Two distinct franchises A and B, plus Super Admin
    // -------------------------------------------------------------------------
    const orgA = 'org_salem_001'; // Salem franchise
    const orgB = 'org_madurai_test_99'; // Madurai franchise

    // Ensure Org B exists in database
    const existingOrgB = await db.query<any>('SELECT id FROM organizations WHERE id = ?', [orgB]);
    if (existingOrgB.length === 0) {
      await db.execute(
        `INSERT INTO organizations (id, code, name, type, status) VALUES (?, 'FRAN-MADURAI-99', 'Madurai Legal Services', 'franchise', 'active')`,
        [orgB]
      );
    }

    // Ensure Franchise B profile exists
    const existingProfB = await db.query<any>('SELECT id FROM franchise_profiles WHERE organization_id = ?', [orgB]);
    if (existingProfB.length === 0) {
      await db.execute(
        `INSERT INTO franchise_profiles (id, organization_id, franchise_code, operating_name, legal_name, contact_email, contact_phone, city, district, state, pin, status)
         VALUES ('prof_madurai_99', ?, 'FRAN-MADURAI-99', 'Madurai Branch', 'Madurai Legal LLP', 'madurai@test.internal', '+91 99999 88888', 'Madurai', 'Madurai', 'Tamil Nadu', '625001', 'active')`,
        [orgB]
      );
    }

    // Ensure Campaign exists for both
    const campA = `cmp_salem_${Date.now()}`;
    const campB = `cmp_madurai_${Date.now()}`;
    await db.execute(
      `INSERT INTO franchise_campaigns (id, organization_id, service_id, name, city, district, state, start_date, status)
       VALUES (?, ?, 'svc_gst_reg', 'Salem GST', 'Salem', 'Salem', 'Tamil Nadu', '2026-01-01', 'active')`,
      [campA, orgA]
    );
    await db.execute(
      `INSERT INTO franchise_campaigns (id, organization_id, service_id, name, city, district, state, start_date, status)
       VALUES (?, ?, 'svc_gst_reg', 'Madurai GST', 'Madurai', 'Madurai', 'Tamil Nadu', '2026-01-01', 'active')`,
      [campB, orgB]
    );

    // Create Super Admin Token
    const adminToken = generateToken({
      userId: 'usr_super_admin_001',
      email: 'admin@lbsc.internal',
      organizationId: null,
      roles: ['super_admin'],
      permissions: ['leads:write', 'leads:read', 'org:read', 'org:write', 'clients:read'],
      tokenVersion: 1,
    });

    // Create Franchise A User & Token
    const userA = `usr_owner_a_${Date.now()}`;
    const emailA = `owner.salem_${Date.now()}@test.internal`;
    await db.execute(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status)
       VALUES (?, ?, ?, 'hash', 'Salem', 'Owner', 'active')`,
      [userA, orgA, emailA]
    );
    const tokenA = generateToken({
      userId: userA,
      email: emailA,
      organizationId: orgA,
      roles: ['franchise_owner'],
      permissions: ['leads:write', 'leads:read', 'org:read', 'org:write', 'clients:read'],
      tokenVersion: 1,
    });

    // Create Franchise B User & Token
    const userB = `usr_owner_b_${Date.now()}`;
    const emailB = `owner.madurai_${Date.now()}@test.internal`;
    await db.execute(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status)
       VALUES (?, ?, ?, 'hash', 'Madurai', 'Owner', 'active')`,
      [userB, orgB, emailB]
    );
    const tokenB = generateToken({
      userId: userB,
      email: emailB,
      organizationId: orgB,
      roles: ['franchise_owner'],
      permissions: ['leads:write', 'leads:read', 'org:read', 'org:write', 'clients:read'],
      tokenVersion: 1,
    });

    // Create Leads
    const lead1 = `lead_t1_${Date.now()}`;
    const lead2 = `lead_t2_${Date.now()}`;
    await db.execute(
      `INSERT INTO leads (id, lead_number, source, customer_name, customer_phone, service_id, city, district, state, status)
       VALUES (?, ?, 'direct', 'Customer One', '9876543210', 'svc_gst_reg', 'Salem', 'Salem', 'Tamil Nadu', 'offered')`,
      [lead1, `LD-T1-${Date.now()}`]
    );
    await db.execute(
      `INSERT INTO leads (id, lead_number, source, customer_name, customer_phone, service_id, city, district, state, status)
       VALUES (?, ?, 'direct', 'Customer Two', '9876543211', 'svc_gst_reg', 'Madurai', 'Madurai', 'Tamil Nadu', 'offered')`,
      [lead2, `LD-T2-${Date.now()}`]
    );

    // Create Opportunities:
    // oppA_active: belongs to Org A, expires in 1 hour
    const oppA_active = `opp_a_active_${Date.now()}`;
    const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
    await db.execute(
      `INSERT INTO lead_opportunities (id, lead_id, franchise_id, campaign_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [oppA_active, lead1, orgA, campA, futureExpiry]
    );

    // oppA_expired: belongs to Org A, expired 10 minutes ago
    const oppA_expired = `opp_a_exp_${Date.now()}`;
    const pastExpiry = new Date(Date.now() - 600 * 1000).toISOString();
    await db.execute(
      `INSERT INTO lead_opportunities (id, lead_id, franchise_id, campaign_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [oppA_expired, lead1, orgA, campA, pastExpiry]
    );

    // oppB_active: belongs to Org B, expires in 1 hour
    const oppB_active = `opp_b_active_${Date.now()}`;
    await db.execute(
      `INSERT INTO lead_opportunities (id, lead_id, franchise_id, campaign_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [oppB_active, lead2, orgB, campB, futureExpiry]
    );

    // Create Franchise Applications:
    // appA: belongs to Org A & userA
    const appA = `app_franchise_a_${Date.now()}`;
    await db.execute(
      `INSERT INTO franchise_applications (id, organization_id, applicant_user_id, business_name, contact_name, contact_email, contact_phone, city, district, state, pin, status)
       VALUES (?, ?, ?, 'Salem Franchise Biz', 'Salem Applicant', 'owner.salem@test.internal', '+91 98765 43210', 'Salem', 'Salem', 'Tamil Nadu', '636001', 'application')`,
      [appA, orgA, userA]
    );

    // appB: belongs to Org B & userB
    const appB = `app_franchise_b_${Date.now()}`;
    await db.execute(
      `INSERT INTO franchise_applications (id, organization_id, applicant_user_id, business_name, contact_name, contact_email, contact_phone, city, district, state, pin, status)
       VALUES (?, ?, ?, 'Madurai Franchise Biz', 'Madurai Applicant', 'owner.madurai@test.internal', '+91 99999 88888', 'Madurai', 'Madurai', 'Tamil Nadu', '625001', 'application')`,
      [appB, orgB, userB]
    );

    // Create Clients for Org A and Org B
    const clientA = `cli_org_a_${Date.now()}`;
    const clientB = `cli_org_b_${Date.now()}`;
    await db.execute(
      `INSERT INTO clients (id, client_number, franchise_id, first_name, full_name, phone, status, city, district, state)
       VALUES (?, ?, ?, 'ClientA', 'Client A Org', '9111111111', 'active', 'Salem', 'Salem', 'Tamil Nadu')`,
      [clientA, `CL-A-${Date.now()}`, orgA]
    );
    await db.execute(
      `INSERT INTO clients (id, client_number, franchise_id, first_name, full_name, phone, status, city, district, state)
       VALUES (?, ?, ?, 'ClientB', 'Client B Org', '9222222222', 'active', 'Madurai', 'Madurai', 'Tamil Nadu')`,
      [clientB, `CL-B-${Date.now()}`, orgB]
    );

    // =========================================================================
    // SECTION 1: LEAD OPPORTUNITY RELEASE TESTS
    // =========================================================================
    console.log('\n--- 1. Testing Lead Opportunity Release ---');

    // 1A. Cross-franchise access: User A attempts to release Org B's opportunity -> 403 Forbidden
    const crossReleaseRes = await fetch(`${baseUrl}/leads/opportunities/${oppB_active}/release`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      crossReleaseRes.status === 403,
      'Cross-franchise opportunity release is blocked (403 Forbidden)',
      `Status: ${crossReleaseRes.status}`
    );

    // 1B. Premature release: User A attempts to release their own opportunity before expires_at -> 400 Bad Request
    const prematureReleaseRes = await fetch(`${baseUrl}/leads/opportunities/${oppA_active}/release`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      prematureReleaseRes.status === 400,
      'Premature opportunity release before expires_at is rejected (400 Bad Request)',
      `Status: ${prematureReleaseRes.status}`
    );

    // 1C. Valid own-franchise release: User A releases their own opportunity after expires_at -> 200 OK
    const validReleaseRes = await fetch(`${baseUrl}/leads/opportunities/${oppA_expired}/release`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      validReleaseRes.status === 200,
      'Valid own-franchise expired opportunity release succeeds (200 OK)',
      `Status: ${validReleaseRes.status}`
    );

    // 1D. Super Admin administrative release: Super Admin can release an active opportunity -> 200 OK
    const adminReleaseRes = await fetch(`${baseUrl}/leads/opportunities/${oppB_active}/release`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminReleaseRes.status === 200,
      'Super Admin administrative opportunity release succeeds (200 OK)',
      `Status: ${adminReleaseRes.status}`
    );

    // =========================================================================
    // SECTION 2: FRANCHISE APPLICATIONS TENANT ISOLATION TESTS
    // =========================================================================
    console.log('\n--- 2. Testing Franchise Applications Tenant Isolation ---');

    // 2A. Cross-franchise view: User A attempts to view Org B application by ID -> 403 Forbidden
    const crossAppRes = await fetch(`${baseUrl}/franchise/applications/${appB}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      crossAppRes.status === 403,
      'Cross-franchise application view is blocked (403 Forbidden)',
      `Status: ${crossAppRes.status}`
    );

    // 2B. Valid own-franchise view: User A views their own application by ID -> 200 OK
    const ownAppRes = await fetch(`${baseUrl}/franchise/applications/${appA}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const ownAppData = (await ownAppRes.json()) as any;
    assert(
      ownAppRes.status === 200 && ownAppData.data.id === appA,
      'Legitimate franchise user views their own application by ID (200 OK)',
      `Status: ${ownAppRes.status}`
    );

    // 2C. Cross-franchise listing isolation: User A lists applications -> only sees application A, NOT application B
    const listAppsRes = await fetch(`${baseUrl}/franchise/applications`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const listAppsData = (await listAppsRes.json()) as any;
    const appsList = listAppsData.data || [];
    const containsAppA = appsList.some((a: any) => a.id === appA);
    const containsAppB = appsList.some((a: any) => a.id === appB);
    assert(
      listAppsRes.status === 200 && containsAppA && !containsAppB,
      'Franchise user application list contains only their own application and excludes other franchises',
      `Contains A: ${containsAppA}, Contains B: ${containsAppB}`
    );

    // 2D. Super Admin full access: Super Admin lists applications -> sees applications from all franchises
    const adminListAppsRes = await fetch(`${baseUrl}/franchise/applications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminListAppsData = (await adminListAppsRes.json()) as any;
    const adminAppsList = adminListAppsData.data || [];
    const adminSeesA = adminAppsList.some((a: any) => a.id === appA);
    const adminSeesB = adminAppsList.some((a: any) => a.id === appB);
    assert(
      adminListAppsRes.status === 200 && adminSeesA && adminSeesB,
      'Super Admin list retains full access to applications across all franchises',
      `Sees A: ${adminSeesA}, Sees B: ${adminSeesB}`
    );

    // 2E. Super Admin views specific application: Super Admin views Org B application by ID -> 200 OK
    const adminViewAppBRes = await fetch(`${baseUrl}/franchise/applications/${appB}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminViewAppBRes.status === 200,
      'Super Admin views any franchise application by ID (200 OK)',
      `Status: ${adminViewAppBRes.status}`
    );

    // =========================================================================
    // SECTION 3: CLIENT STATS TENANT ISOLATION TESTS
    // =========================================================================
    console.log('\n--- 3. Testing Client Stats Tenant Isolation ---');

    // Count clients for Org A and Org B in DB
    const countA = await db.query<any>('SELECT COUNT(*) as c FROM clients WHERE franchise_id = ?', [orgA]);
    const countB = await db.query<any>('SELECT COUNT(*) as c FROM clients WHERE franchise_id = ?', [orgB]);
    const expectedCountA = Number(countA[0]?.c || 0);
    const expectedCountB = Number(countB[0]?.c || 0);

    // 3A. Valid own-franchise stats: User A queries /stats without query param -> returns Org A stats
    const ownStatsRes = await fetch(`${baseUrl}/clients/stats`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const ownStatsData = (await ownStatsRes.json()) as any;
    assert(
      ownStatsRes.status === 200 && ownStatsData.data.totalClients === expectedCountA,
      'Franchise user retrieves their own client stats (200 OK)',
      `totalClients: ${ownStatsData.data?.totalClients}, expected: ${expectedCountA}`
    );

    // 3B. Cross-franchise param ignored: User A passes ?franchiseId=orgB -> must IGNORE param and still return Org A stats!
    const crossStatsRes = await fetch(`${baseUrl}/clients/stats?franchiseId=${orgB}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const crossStatsData = (await crossStatsRes.json()) as any;
    assert(
      crossStatsRes.status === 200 && crossStatsData.data.totalClients === expectedCountA,
      'Franchise user query with foreign franchiseId parameter ignores parameter and returns own stats',
      `totalClients: ${crossStatsData.data?.totalClients}, expected: ${expectedCountA}`
    );

    // 3C. Super Admin queries another franchise: Super Admin passes ?franchiseId=orgB -> returns Org B stats!
    const adminQueryBRes = await fetch(`${baseUrl}/clients/stats?franchiseId=${orgB}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminQueryBData = (await adminQueryBRes.json()) as any;
    assert(
      adminQueryBRes.status === 200 && adminQueryBData.data.totalClients === expectedCountB,
      'Super Admin can explicitly query another franchise via franchiseId parameter',
      `totalClients: ${adminQueryBData.data?.totalClients}, expected: ${expectedCountB}`
    );

    // 3D. Super Admin queries all clients when franchiseId is omitted
    const totalCountAll = await db.query<any>('SELECT COUNT(*) as c FROM clients');
    const expectedTotal = Number(totalCountAll[0]?.c || 0);
    const adminAllStatsRes = await fetch(`${baseUrl}/clients/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminAllStatsData = (await adminAllStatsRes.json()) as any;
    assert(
      adminAllStatsRes.status === 200 && adminAllStatsData.data.totalClients === expectedTotal,
      'Super Admin queries global system client stats when franchiseId is omitted',
      `totalClients: ${adminAllStatsData.data?.totalClients}, expected: ${expectedTotal}`
    );

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
