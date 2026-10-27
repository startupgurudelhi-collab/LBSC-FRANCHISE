import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import {
  NotificationService,
  NotificationDeliveryService,
  NotificationPreferenceService,
  NotificationRouter,
} from './src/server/notifications/index.js';

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

async function runTests() {
  console.log('========================================================');
  console.log(' Phase 23C.2 Notification Preferences & Routing Suite   ');
  console.log('========================================================\n');

  const db = getDatabase();

  // 1. Migration 023 Execution & Schema Verification
  console.log('--- 1. Migration 023 Execution & Schema Verification ---');
  {
    const migrationResult = await runMigrations(db);
    console.log(`Migrations executed: applied ${migrationResult.applied.length}`);
    const isSqlite = db.getDialect() === 'sqlite';

    if (isSqlite) {
      const cols = await db.query<any>('PRAGMA table_info(notification_preferences)');
      const colNames = cols.map((c: any) => c.name);
      assert('Column id exists', colNames.includes('id'));
      assert('Column user_id exists', colNames.includes('user_id'));
      assert('Column in_app_enabled exists', colNames.includes('in_app_enabled'));
      assert('Column email_enabled exists', colNames.includes('email_enabled'));
      assert('Column whatsapp_enabled exists', colNames.includes('whatsapp_enabled'));
      assert('Column sms_enabled exists', colNames.includes('sms_enabled'));
      assert('Column category_overrides exists', colNames.includes('category_overrides'));
      assert('Column created_at exists', colNames.includes('created_at'));
      assert('Column updated_at exists', colNames.includes('updated_at'));

      const indexes = await db.query<any>('PRAGMA index_list(notification_preferences)');
      const hasUnique = indexes.some((idx: any) => idx.unique === 1);
      assert('Unique index on user_id exists', hasUnique);
    } else {
      const cols = await db.query<any>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'notification_preferences'`
      );
      const colNames = cols.map((c: any) => c.column_name);
      assert('Columns exist in Postgres', colNames.includes('user_id'));
    }
  }

  // Setup test organization and users
  const testOrgId = `org_p23c2_${Date.now()}`;
  await db.execute(
    `INSERT INTO organizations (id, code, name, type, status) VALUES (?, ?, ?, 'franchise', 'active')`,
    [testOrgId, `CODE_${testOrgId}`, 'Test Org 23C2']
  );

  const emailFull = `john.doe_${Date.now()}@franchise.example.com`;
  const userFull = `u_full_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, organization_id, email, phone, first_name, last_name, status)
     VALUES (?, ?, ?, ?, 'John', 'Doe', 'active')`,
    [userFull, testOrgId, emailFull, '+919876543210']
  );

  const emailNoPhone = `nophone_${Date.now()}@franchise.example.com`;
  const userNoPhone = `u_nophone_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, organization_id, email, phone, first_name, last_name, status)
     VALUES (?, ?, ?, NULL, 'No', 'Phone', 'active')`,
    [userNoPhone, testOrgId, emailNoPhone]
  );

  const userNoEmail = `u_noemail_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, organization_id, email, phone, first_name, last_name, status)
     VALUES (?, ?, ?, ?, 'No', 'Email', 'active')`,
    [userNoEmail, testOrgId, `invalid_no_at_${Date.now()}`, '+919123456789']
  );

  // 2. Preference Persistence & Defaults
  console.log('\n--- 2. Preference Persistence & Default Behavior ---');
  {
    const defaults = await NotificationPreferenceService.getPreferences(userFull);
    assert('Default inApp is enabled', defaults.inAppEnabled === true);
    assert('Default email is enabled', defaults.emailEnabled === true);
    assert('Default whatsapp is enabled', defaults.whatsappEnabled === true);
    assert('Default sms is enabled', defaults.smsEnabled === true);
    assert('Default category overrides is null', defaults.categoryOverrides === null);

    // Update preferences: turn off SMS and WhatsApp
    const updated = await NotificationPreferenceService.updatePreferences(userFull, {
      whatsappEnabled: false,
      smsEnabled: false,
      categoryOverrides: {
        sla_breached: { email: true, sms: false },
      },
    });

    assert('Updated whatsappEnabled is false', updated.whatsappEnabled === false);
    assert('Updated smsEnabled is false', updated.smsEnabled === false);
    assert('Updated emailEnabled is true', updated.emailEnabled === true);
    assert('Category override saved', updated.categoryOverrides?.sla_breached?.sms === false);

    // Verify persisted in DB
    const persisted = await NotificationPreferenceService.getPreferences(userFull);
    assert('Persisted whatsappEnabled is false', persisted.whatsappEnabled === false);
    assert('Persisted smsEnabled is false', persisted.smsEnabled === false);
    assert('Persisted emailEnabled is true', persisted.emailEnabled === true);

    // Reset back to defaults for subsequent routing test
    await NotificationPreferenceService.resetPreferences(userFull);
    const reset = await NotificationPreferenceService.getPreferences(userFull);
    assert('Reset reverts whatsappEnabled to true', reset.whatsappEnabled === true);
    assert('Reset reverts smsEnabled to true', reset.smsEnabled === true);
  }

  // 3. Notification Creation & Routing Through Delivery Service
  console.log('\n--- 3. Notification Creation & External Routing ---');
  {
    NotificationDeliveryService.resetProviders();
    NotificationDeliveryService.setChannelOverride('whatsapp', true);
    NotificationDeliveryService.setChannelOverride('sms', true);
    NotificationDeliveryService.setChannelOverride('email', true);

    const created = await NotificationService.createNotification({
      userId: userFull,
      organizationId: testOrgId,
      type: 'campaign_charge',
      title: 'Daily Budget Deducted',
      message: 'INR 500 deducted for Campaign Alpha.',
    });

    assert('In-app notification returned with ID', Boolean(created.id));
    assert('Notification is_read is false', created.is_read === false);

    // Verify in-app row was inserted into notifications table
    const notifRows = await db.query<any>(
      `SELECT * FROM notifications WHERE id = ?`,
      [created.id]
    );
    assert('In-app notification row exists in DB', notifRows.length === 1);
    assert('In-app title matches', notifRows[0].title === 'Daily Budget Deducted');

    // Verify external deliveries were created for all 3 channels
    const deliveries = await NotificationDeliveryService.listDeliveries({
      organizationId: testOrgId,
      userId: userFull,
    });

    const waDeliv = deliveries.deliveries.find(d => d.channel === 'whatsapp' && d.body.includes('Campaign Alpha'));
    const smsDeliv = deliveries.deliveries.find(d => d.channel === 'sms' && d.body.includes('Campaign Alpha'));
    const emailDeliv = deliveries.deliveries.find(d => d.channel === 'email' && d.body.includes('Campaign Alpha'));

    assert('WhatsApp delivery recorded as SENT', waDeliv?.status === 'SENT');
    assert('WhatsApp recipient is user phone', waDeliv?.recipient === '+919876543210');
    assert('SMS delivery recorded as SENT', smsDeliv?.status === 'SENT');
    assert('SMS recipient is user phone', smsDeliv?.recipient === '+919876543210');
    assert('Email delivery recorded as SENT', emailDeliv?.status === 'SENT');
    assert('Email recipient is user email', emailDeliv?.recipient === emailFull);
  }

  // 4. Respecting User Preferences in Routing
  console.log('\n--- 4. Respecting User Preferences in Routing ---');
  {
    // Disable WhatsApp and SMS for userFull
    await NotificationPreferenceService.updatePreferences(userFull, {
      whatsappEnabled: false,
      smsEnabled: false,
      emailEnabled: true,
    });

    const notif = await NotificationService.createNotification({
      userId: userFull,
      organizationId: testOrgId,
      type: 'lead_opportunity',
      title: 'New Lead Available',
      message: 'A new GST registration lead is in your pincode.',
    });

    assert('In-app notification created successfully', Boolean(notif.id));

    // Inspect routing result directly
    const routeCheck = await NotificationRouter.routeNotification(notif);
    const waResult = routeCheck.results.find(r => r.channel === 'whatsapp');
    const smsResult = routeCheck.results.find(r => r.channel === 'sms');
    const emailResult = routeCheck.results.find(r => r.channel === 'email');

    assert('WhatsApp skipped due to user preference', waResult?.status === 'SKIPPED');
    assert('WhatsApp reason mentions user preferences', waResult?.reason?.includes('user preferences') === true);
    assert('SMS skipped due to user preference', smsResult?.status === 'SKIPPED');
    assert('SMS reason mentions user preferences', smsResult?.reason?.includes('user preferences') === true);
    assert('Email routed and SENT', emailResult?.status === 'SENT');
  }

  // 5. In-App Notification Disabled Preference
  console.log('\n--- 5. In-App Notification Disabled Preference ---');
  {
    const userInAppOff = `u_inappoff_${Date.now()}`;
    await db.execute(
      `INSERT INTO users (id, organization_id, email, phone, first_name, last_name, status)
       VALUES (?, ?, ?, ?, 'InApp', 'Off', 'active')`,
      [userInAppOff, testOrgId, `inappoff_${Date.now()}@example.com`, '+919876543210']
    );

    // Disable in-app notifications
    await NotificationPreferenceService.updatePreferences(userInAppOff, {
      inAppEnabled: false,
      emailEnabled: true,
    });

    const notif = await NotificationService.createNotification({
      userId: userInAppOff,
      organizationId: testOrgId,
      type: 'system',
      title: 'System Notice',
      message: 'In-app disabled test message.',
    });

    // Check DB notifications table: should NOT have an in-app row
    const dbRows = await db.query<any>(
      `SELECT * FROM notifications WHERE id = ?`,
      [notif.id]
    );
    assert('In-app notification was suppressed in DB when inAppEnabled=false', dbRows.length === 0);

    // External email delivery should still route
    const emailDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_email`);
    assert('External email was still delivered according to preferences', emailDeliv?.status === 'SENT');
  }

  // 6. Respecting System Disabled Channels
  console.log('\n--- 6. Respecting System Disabled Channels ---');
  {
    // Clear channel overrides so system defaults (all false) are enforced
    NotificationDeliveryService.clearChannelOverrides();

    // Reset user preferences to all enabled
    await NotificationPreferenceService.resetPreferences(userFull);

    const notif = await NotificationService.createNotification({
      userId: userFull,
      organizationId: testOrgId,
      type: 'sla_breached',
      title: 'SLA Breached',
      message: 'Application APP-100 has breached SLA.',
    });

    // All external channels should be recorded as DISABLED without external calls
    const waDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_whatsapp`);
    const smsDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_sms`);
    const emailDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_email`);

    assert('WhatsApp recorded as DISABLED when system channel off', waDeliv?.status === 'DISABLED');
    assert('SMS recorded as DISABLED when system channel off', smsDeliv?.status === 'DISABLED');
    assert('Email recorded as DISABLED when system channel off', emailDeliv?.status === 'DISABLED');
  }

  // 7. Stable Idempotency & Duplicate Prevention
  console.log('\n--- 7. Stable Idempotency & Duplicate Prevention ---');
  {
    NotificationDeliveryService.setChannelOverride('email', true);

    const notif = await NotificationService.createNotification({
      userId: userFull,
      organizationId: testOrgId,
      type: 'campaign_charge',
      title: 'Idempotency Test Notice',
      message: 'Testing duplicate routing prevention.',
    });

    // Route again explicitly for the same notification
    const secondRoute = await NotificationRouter.routeNotification(notif, { channels: ['email'] });
    const emailRes = secondRoute.results.find(r => r.channel === 'email');

    assert('Second route returns fromCacheOrDuplicate=true', emailRes?.fromCacheOrDuplicate === true);
    assert('Second route status is SENT', emailRes?.status === 'SENT');

    // Confirm DB row count is exactly 1
    const rows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notification_deliveries WHERE idempotency_key = ?`,
      [`route_${notif.id}_email`]
    );
    assert('Database contains exactly 1 delivery record for route key', Number(rows[0].cnt) === 1);
  }

  // 8. Safe Handling of Missing or Invalid Contact Details
  console.log('\n--- 8. Safe Handling of Missing Contact Details ---');
  {
    NotificationDeliveryService.setChannelOverride('whatsapp', true);
    NotificationDeliveryService.setChannelOverride('sms', true);
    NotificationDeliveryService.setChannelOverride('email', true);

    // User without phone
    const notifNoPhone = await NotificationService.createNotification({
      userId: userNoPhone,
      organizationId: testOrgId,
      type: 'lead_opportunity',
      title: 'No Phone Lead',
      message: 'Lead message.',
    });

    const routeNoPhone = await NotificationRouter.routeNotification(notifNoPhone);
    const waNoPhone = routeNoPhone.results.find(r => r.channel === 'whatsapp');
    const smsNoPhone = routeNoPhone.results.find(r => r.channel === 'sms');
    const emailNoPhone = routeNoPhone.results.find(r => r.channel === 'email');

    assert('WhatsApp safely skipped for user without phone', waNoPhone?.status === 'SKIPPED');
    assert('WhatsApp reason indicates missing/invalid phone', waNoPhone?.reason?.includes('phone number is missing') === true);
    assert('SMS safely skipped for user without phone', smsNoPhone?.status === 'SKIPPED');
    assert('Email succeeds for user with email', emailNoPhone?.status === 'SENT');

    // User without email
    const notifNoEmail = await NotificationService.createNotification({
      userId: userNoEmail,
      organizationId: testOrgId,
      type: 'lead_opportunity',
      title: 'No Email Lead',
      message: 'Lead message.',
    });

    const routeNoEmail = await NotificationRouter.routeNotification(notifNoEmail);
    const emailNoEmail = routeNoEmail.results.find(r => r.channel === 'email');
    const smsNoEmail = routeNoEmail.results.find(r => r.channel === 'sms');

    assert('Email safely skipped for user without email', emailNoEmail?.status === 'SKIPPED');
    assert('Email reason indicates missing/invalid email', emailNoEmail?.reason?.includes('email address is missing') === true);
    assert('SMS succeeds for user with phone', smsNoEmail?.status === 'SENT');
  }

  // 9. Organization / Tenant Isolation
  console.log('\n--- 9. Tenant Isolation ---');
  {
    const otherOrgId = `org_other_${Date.now()}`;
    await db.execute(
      `INSERT INTO organizations (id, code, name, type, status) VALUES (?, ?, ?, 'franchise', 'active')`,
      [otherOrgId, `CODE_${otherOrgId}`, 'Other Org']
    );

    // User belonging to testOrgId, but notification forged with otherOrgId
    const forgedNotification: any = {
      id: `forged_notif_${Date.now()}`,
      user_id: userFull, // belongs to testOrgId
      organization_id: otherOrgId, // does NOT match user's org
      type: 'system',
      title: 'Security Alert',
      message: 'Cross-tenant payload',
    };

    const forgedRoute = await NotificationRouter.routeNotification(forgedNotification);
    assert('All channels skipped on tenant mismatch', forgedRoute.results.every(r => r.status === 'SKIPPED'));
    assert(
      'Skip reason explicitly mentions tenant mismatch',
      forgedRoute.results[0].reason?.includes('Tenant mismatch') === true
    );

    // Caller org mismatch
    const callerMismatchRoute = await NotificationRouter.routeNotification(
      {
        id: `caller_mismatch_${Date.now()}`,
        user_id: userFull,
        organization_id: testOrgId,
        type: 'system',
        title: 'Security Alert',
        message: 'Caller mismatch',
        is_read: false,
        created_at: new Date().toISOString(),
      },
      { callerOrgId: otherOrgId }
    );
    assert(
      'Caller org mismatch rejects routing',
      callerMismatchRoute.results.every(r => r.status === 'SKIPPED')
    );
  }

  console.log('\n========================================================');
  console.log(` Phase 23C.2 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
