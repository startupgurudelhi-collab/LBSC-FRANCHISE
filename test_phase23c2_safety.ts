import { getDatabase } from './src/server/db/connection.js';
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

async function runSafetyVerification() {
  console.log('========================================================');
  console.log(' Phase 23C.2 Final Safety Verification Suite           ');
  console.log('========================================================\n');

  const db = getDatabase();

  // 1. System Channel Flags Remain Disabled by Default
  console.log('--- 1. System Channel Flags Default State ---');
  {
    NotificationDeliveryService.clearChannelOverrides();

    assert(
      'System WhatsApp channel is disabled by default',
      NotificationDeliveryService.isChannelEnabled('whatsapp') === false
    );
    assert(
      'System SMS channel is disabled by default',
      NotificationDeliveryService.isChannelEnabled('sms') === false
    );
    assert(
      'System Email channel is disabled by default',
      NotificationDeliveryService.isChannelEnabled('email') === false
    );
  }

  // Setup test organization and opt-in user
  const safetyOrgId = `org_safety_${Date.now()}`;
  await db.execute(
    `INSERT INTO organizations (id, code, name, type, status) VALUES (?, ?, ?, 'franchise', 'active')`,
    [safetyOrgId, `CODE_${safetyOrgId}`, 'Safety Verification Org']
  );

  const optInUser = `u_optin_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, organization_id, email, phone, first_name, last_name, status)
     VALUES (?, ?, ?, '+919988776655', 'Safety', 'User', 'active')`,
    [optInUser, safetyOrgId, `optin.user_${Date.now()}@example.com`]
  );

  // 2. User Opting-In Cannot Override System Disabled Channels
  console.log('\n--- 2. User Opt-In Cannot Override System Flags ---');
  {
    // Explicitly set user preferences to opted-in for all external channels
    await NotificationPreferenceService.updatePreferences(optInUser, {
      whatsappEnabled: true,
      smsEnabled: true,
      emailEnabled: true,
      inAppEnabled: true,
    });

    const userPrefs = await NotificationPreferenceService.getPreferences(optInUser);
    assert('User preferences show WhatsApp opted-in', userPrefs.whatsappEnabled === true);
    assert('User preferences show SMS opted-in', userPrefs.smsEnabled === true);
    assert('User preferences show Email opted-in', userPrefs.emailEnabled === true);

    // Emit a notification
    const notif = await NotificationService.createNotification({
      userId: optInUser,
      organizationId: safetyOrgId,
      type: 'campaign_charge',
      title: 'Safety Test Notification',
      message: 'Checking that opt-in never activates external delivery without system flags.',
    });

    // Verify in-app notification exists
    const inAppRows = await db.query<any>(
      `SELECT * FROM notifications WHERE id = ?`,
      [notif.id]
    );
    assert('In-app notification created normally', inAppRows.length === 1);

    // Check delivery records for all 3 channels
    const waDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_whatsapp`);
    const smsDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_sms`);
    const emailDeliv = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_email`);

    assert('WhatsApp delivery is DISABLED in database', waDeliv?.status === 'DISABLED');
    assert('WhatsApp attempt count is 0', waDeliv?.attempt_count === 0);
    assert('WhatsApp provider is NONE', waDeliv?.provider === 'NONE');
    assert('WhatsApp has no provider message ID', waDeliv?.provider_message_id === null);

    assert('SMS delivery is DISABLED in database', smsDeliv?.status === 'DISABLED');
    assert('SMS attempt count is 0', smsDeliv?.attempt_count === 0);
    assert('SMS provider is NONE', smsDeliv?.provider === 'NONE');

    assert('Email delivery is DISABLED in database', emailDeliv?.status === 'DISABLED');
    assert('Email attempt count is 0', emailDeliv?.attempt_count === 0);
    assert('Email provider is NONE', emailDeliv?.provider === 'NONE');
  }

  // 3. Routing Behavior When In-App Is Disabled
  console.log('\n--- 3. Routing Behavior When In-App Notifications Are Disabled ---');
  {
    const inAppDisabledUser = `u_noinapp_${Date.now()}`;
    await db.execute(
      `INSERT INTO users (id, organization_id, email, phone, first_name, last_name, status)
       VALUES (?, ?, ?, '+919876543299', 'No', 'InApp', 'active')`,
      [inAppDisabledUser, safetyOrgId, `noinapp_${Date.now()}@example.com`]
    );

    await NotificationPreferenceService.updatePreferences(inAppDisabledUser, {
      inAppEnabled: false,
      whatsappEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
    });

    // Create notification
    const notif = await NotificationService.createNotification({
      userId: inAppDisabledUser,
      organizationId: safetyOrgId,
      type: 'lead_opportunity',
      title: 'Lead Opportunity',
      message: 'New lead opportunity available.',
    });

    assert('createNotification returns valid model without throwing', Boolean(notif?.id));

    // Confirm no in-app notification row was inserted
    const inAppCheck = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ?`,
      [inAppDisabledUser]
    );
    assert('In-app table has 0 rows for user with inAppEnabled=false', Number(inAppCheck[0].cnt) === 0);

    // Unread count API should return 0
    const unreadCount = await NotificationService.getUnreadCount(inAppDisabledUser);
    assert('Unread count is 0 for user with inAppEnabled=false', unreadCount === 0);

    // External deliveries remain safely DISABLED
    const waCheck = await NotificationDeliveryService.getDeliveryByIdempotencyKey(`route_${notif.id}_whatsapp`);
    assert('External channel remains DISABLED even when in-app is disabled', waCheck?.status === 'DISABLED');
  }

  // 4. No Real Provider Calls Without Explicit Configuration
  console.log('\n--- 4. Provider Configuration Safety Check ---');
  {
    const providerWa = NotificationDeliveryService.getProvider('whatsapp');
    const providerSms = NotificationDeliveryService.getProvider('sms');
    const providerEmail = NotificationDeliveryService.getProvider('email');

    assert('WhatsApp provider is MockNotificationAdapter', providerWa?.constructor.name === 'MockNotificationAdapter');
    assert('SMS provider is MockNotificationAdapter', providerSms?.constructor.name === 'MockNotificationAdapter');
    assert('Email provider is MockNotificationAdapter', providerEmail?.constructor.name === 'MockNotificationAdapter');
    assert(
      'Provider names reflect mock/log_only modes',
      Boolean(providerWa?.providerName.startsWith('mock_') || providerWa?.providerName.startsWith('log_only_'))
    );
  }

  console.log('\n========================================================');
  console.log(` Safety Verification Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSafetyVerification().catch((err) => {
  console.error('Fatal safety test error:', err);
  process.exit(1);
});
