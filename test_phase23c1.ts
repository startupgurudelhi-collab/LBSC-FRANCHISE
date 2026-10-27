import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import {
  NotificationDeliveryService,
  MockNotificationAdapter,
  maskRecipient,
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
  console.log(' Phase 23C.1 Notification Delivery Foundation Test Suite');
  console.log('========================================================\n');

  const db = getDatabase();

  // 1. Migration Execution & Schema Verification
  console.log('--- 1. Migration 022 Execution & Schema Verification ---');
  {
    const migrationResult = await runMigrations(db);
    console.log(`Migrations executed: applied ${migrationResult.applied.length}`);
    const isSqlite = db.getDialect() === 'sqlite';

    // Verify notification_deliveries table structure
    if (isSqlite) {
      const cols = await db.query<any>('PRAGMA table_info(notification_deliveries)');
      const colNames = cols.map((c: any) => c.name);
      assert('Column id exists', colNames.includes('id'));
      assert('Column idempotency_key exists', colNames.includes('idempotency_key'));
      assert('Column channel exists', colNames.includes('channel'));
      assert('Column recipient exists', colNames.includes('recipient'));
      assert('Column status exists', colNames.includes('status'));
      assert('Column attempt_count exists', colNames.includes('attempt_count'));
      assert('Column provider exists', colNames.includes('provider'));
      assert('Column provider_message_id exists', colNames.includes('provider_message_id'));
      assert('Column subject exists', colNames.includes('subject'));
      assert('Column body exists', colNames.includes('body'));
      assert('Column error exists', colNames.includes('error'));
      assert('Column metadata exists', colNames.includes('metadata'));
      assert('Column organization_id exists', colNames.includes('organization_id'));
      assert('Column user_id exists', colNames.includes('user_id'));
      assert('Column created_at exists', colNames.includes('created_at'));
      assert('Column updated_at exists', colNames.includes('updated_at'));
      assert('Column sent_at exists', colNames.includes('sent_at'));

      // Check unique index on idempotency_key
      const indexes = await db.query<any>('PRAGMA index_list(notification_deliveries)');
      const hasUniqueKey = indexes.some((idx: any) => idx.unique === 1);
      assert('Unique index on idempotency_key exists', hasUniqueKey);
    } else {
      const cols = await db.query<any>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'notification_deliveries'`
      );
      const colNames = cols.map((c: any) => c.column_name);
      assert('Columns exist in Postgres', colNames.includes('idempotency_key'));
    }
  }

  // 2. Default Disabled Channels Behavior
  console.log('\n--- 2. Default Disabled Channels Behavior ---');
  {
    // Ensure all channel overrides are cleared
    NotificationDeliveryService.clearChannelOverrides();

    // Default configuration should have channels disabled
    assert('WhatsApp default disabled', NotificationDeliveryService.isChannelEnabled('whatsapp') === false);
    assert('SMS default disabled', NotificationDeliveryService.isChannelEnabled('sms') === false);
    assert('Email default disabled', NotificationDeliveryService.isChannelEnabled('email') === false);

    const idempotencyKey = `disabled_test_${Date.now()}`;
    const result = await NotificationDeliveryService.deliver({
      idempotencyKey,
      channel: 'whatsapp',
      recipient: '+919876543210',
      body: 'Test disabled message',
    });

    assert('Delivery result reports success=false', result.success === false);
    assert('Status is DISABLED', result.status === 'DISABLED');
    assert('Error message mentions disabled configuration', result.error?.includes('disabled') === true);
    assert('Attempt count is 0', result.attemptCount === 0);

    // Verify row was persisted in DB
    const saved = await NotificationDeliveryService.getDeliveryByIdempotencyKey(idempotencyKey);
    assert('Disabled delivery record persisted in DB', saved !== null && saved.status === 'DISABLED');

    // Duplicate call with same idempotencyKey returns existing DISABLED record
    const dupResult = await NotificationDeliveryService.deliver({
      idempotencyKey,
      channel: 'whatsapp',
      recipient: '+919876543210',
      body: 'Test disabled message',
    });
    assert('Duplicate delivery returns fromCacheOrDuplicate=true', dupResult.fromCacheOrDuplicate === true);
    assert('Duplicate delivery returns identical deliveryId', dupResult.deliveryId === result.deliveryId);
  }

  // 3. Mock Delivery Across WhatsApp, SMS, and Email
  console.log('\n--- 3. Mock Delivery (WhatsApp, SMS, Email) ---');
  {
    NotificationDeliveryService.resetProviders();
    NotificationDeliveryService.setChannelOverride('whatsapp', true);
    NotificationDeliveryService.setChannelOverride('sms', true);
    NotificationDeliveryService.setChannelOverride('email', true);

    // A. WhatsApp
    const waKey = `wa_test_${Date.now()}`;
    const waResult = await NotificationDeliveryService.deliver({
      idempotencyKey: waKey,
      channel: 'whatsapp',
      recipient: '+919876543210',
      body: 'Hello WhatsApp',
    });
    assert('WhatsApp mock delivery succeeds', waResult.success === true);
    assert('WhatsApp status is SENT', waResult.status === 'SENT');
    assert('WhatsApp provider message ID generated', Boolean(waResult.providerMessageId?.startsWith('mock_whatsapp_')));
    assert('WhatsApp attempt count is 1', waResult.attemptCount === 1);
    assert('WhatsApp sentAt is populated', Boolean(waResult.sentAt));

    // B. SMS
    const smsKey = `sms_test_${Date.now()}`;
    const smsResult = await NotificationDeliveryService.deliver({
      idempotencyKey: smsKey,
      channel: 'sms',
      recipient: '+919876543211',
      body: 'Hello SMS OTP',
    });
    assert('SMS mock delivery succeeds', smsResult.success === true);
    assert('SMS status is SENT', smsResult.status === 'SENT');
    assert('SMS provider message ID generated', Boolean(smsResult.providerMessageId?.startsWith('mock_sms_')));

    // C. Email
    const emailKey = `email_test_${Date.now()}`;
    const emailResult = await NotificationDeliveryService.deliver({
      idempotencyKey: emailKey,
      channel: 'email',
      recipient: 'franchise.partner@example.com',
      subject: 'Welcome to Franchise Hub',
      body: 'Your account is ready.',
    });
    assert('Email mock delivery succeeds', emailResult.success === true);
    assert('Email status is SENT', emailResult.status === 'SENT');
    assert('Email provider message ID generated', Boolean(emailResult.providerMessageId?.startsWith('mock_email_')));
  }

  // 4. LOG_ONLY Mode & PII Masking
  console.log('\n--- 4. LOG_ONLY Mode & PII Masking ---');
  {
    // Test PII masking helper
    const maskedPhone = maskRecipient('+919876543210');
    assert('Phone number masked safely', maskedPhone.includes('****') && !maskedPhone.includes('987654'));

    const maskedEmail = maskRecipient('john.doe@example.com');
    assert('Email address masked safely', maskedEmail.includes('***') && maskedEmail.includes('@example.com'));

    // Test LOG_ONLY adapter mode
    const logAdapter = new MockNotificationAdapter('email', 'LOG_ONLY');
    NotificationDeliveryService.registerProvider('email', logAdapter);

    const logKey = `log_test_${Date.now()}`;
    const logResult = await NotificationDeliveryService.deliver({
      idempotencyKey: logKey,
      channel: 'email',
      recipient: 'audit@example.com',
      subject: 'Security Notice',
      body: 'Security log test',
    });
    assert('LOG_ONLY delivery succeeds', logResult.success === true);
    assert('LOG_ONLY message ID prefixed with log_', Boolean(logResult.providerMessageId?.startsWith('log_email_')));
  }

  // 5. Idempotency & Duplicate Prevention
  console.log('\n--- 5. Idempotency & Duplicate Prevention ---');
  {
    NotificationDeliveryService.resetProviders();
    NotificationDeliveryService.setChannelOverride('sms', true);

    const idempotencyKey = `idemp_unique_${Date.now()}`;

    // First call
    const firstCall = await NotificationDeliveryService.deliver({
      idempotencyKey,
      channel: 'sms',
      recipient: '+919999988888',
      body: 'Payment confirmation OTP: 554433',
    });
    assert('First delivery succeeds', firstCall.success === true);
    assert('First delivery fromCacheOrDuplicate=false', firstCall.fromCacheOrDuplicate === false);

    // Second call with same idempotencyKey
    const secondCall = await NotificationDeliveryService.deliver({
      idempotencyKey,
      channel: 'sms',
      recipient: '+919999988888',
      body: 'Payment confirmation OTP: 554433',
    });
    assert('Second delivery succeeds', secondCall.success === true);
    assert('Second delivery recognized as duplicate', secondCall.fromCacheOrDuplicate === true);
    assert('Second delivery returns identical deliveryId', secondCall.deliveryId === firstCall.deliveryId);
    assert('Second delivery returns identical providerMessageId', secondCall.providerMessageId === firstCall.providerMessageId);

    // Verify database row count
    const rows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notification_deliveries WHERE idempotency_key = ?`,
      [idempotencyKey]
    );
    assert('Database contains exactly ONE row for idempotencyKey', Number(rows[0].cnt) === 1);

    // Concurrent delivery attempts with same idempotency key
    const concurrentKey = `concurrent_${Date.now()}`;
    const [c1, c2, c3] = await Promise.all([
      NotificationDeliveryService.deliver({
        idempotencyKey: concurrentKey,
        channel: 'sms',
        recipient: '+919999988888',
        body: 'Concurrent test message',
      }),
      NotificationDeliveryService.deliver({
        idempotencyKey: concurrentKey,
        channel: 'sms',
        recipient: '+919999988888',
        body: 'Concurrent test message',
      }),
      NotificationDeliveryService.deliver({
        idempotencyKey: concurrentKey,
        channel: 'sms',
        recipient: '+919999988888',
        body: 'Concurrent test message',
      }),
    ]);

    assert('All concurrent calls resolve without throwing', Boolean(c1 && c2 && c3));
    const cRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notification_deliveries WHERE idempotency_key = ?`,
      [concurrentKey]
    );
    assert('Concurrent execution results in exactly 1 persisted row', Number(cRows[0].cnt) === 1);
  }

  // 6. External Delivery Failures Never Break Business Execution
  console.log('\n--- 6. Failure Handling & Non-Breaking Isolation ---');
  {
    const failingAdapter = new MockNotificationAdapter('whatsapp', 'MOCK');
    failingAdapter.setSimulateFailure(true, 'Provider 503 Service Unavailable: WhatsApp API downstream error');
    NotificationDeliveryService.registerProvider('whatsapp', failingAdapter);
    NotificationDeliveryService.setChannelOverride('whatsapp', true);

    const failKey = `fail_test_${Date.now()}`;
    let threwException = false;
    let failResult: any = null;

    try {
      failResult = await NotificationDeliveryService.deliver({
        idempotencyKey: failKey,
        channel: 'whatsapp',
        recipient: '+919876543210',
        body: 'Critical business notification',
      });
    } catch (e) {
      threwException = true;
    }

    assert('Delivery failure does NOT throw an exception to caller', threwException === false);
    assert('Failure result has success=false', failResult?.success === false);
    assert('Failure status is FAILED', failResult?.status === 'FAILED');
    assert('Failure error message is captured', failResult?.error?.includes('503 Service Unavailable') === true);

    // Verify DB recorded the failure
    const failedRow = await NotificationDeliveryService.getDeliveryByIdempotencyKey(failKey);
    assert('Failed status persisted in database', failedRow?.status === 'FAILED');
    assert('Error details persisted in database', failedRow?.error?.includes('503 Service Unavailable') === true);
    assert('Attempt count incremented on failure', failedRow?.attempt_count === 1);
  }

  // 7. Multi-Tenant Isolation
  console.log('\n--- 7. Tenant Isolation ---');
  {
    NotificationDeliveryService.resetProviders();
    NotificationDeliveryService.setChannelOverride('email', true);

    const org1Id = `org_test_1_${Date.now()}`;
    const org2Id = `org_test_2_${Date.now()}`;

    await db.execute(
      `INSERT INTO organizations (id, code, name, type, status) VALUES (?, ?, ?, 'franchise', 'active')`,
      [org1Id, `CODE_${org1Id}`, 'Org 1 Test']
    );
    await db.execute(
      `INSERT INTO organizations (id, code, name, type, status) VALUES (?, ?, ?, 'franchise', 'active')`,
      [org2Id, `CODE_${org2Id}`, 'Org 2 Test']
    );

    // Deliveries for Org 1
    await NotificationDeliveryService.deliver({
      idempotencyKey: `org1_msg1_${Date.now()}`,
      channel: 'email',
      recipient: 'user@org1.com',
      body: 'Message for Org 1',
      organizationId: org1Id,
    });
    await NotificationDeliveryService.deliver({
      idempotencyKey: `org1_msg2_${Date.now()}`,
      channel: 'email',
      recipient: 'user2@org1.com',
      body: 'Second message for Org 1',
      organizationId: org1Id,
    });

    // Delivery for Org 2
    await NotificationDeliveryService.deliver({
      idempotencyKey: `org2_msg1_${Date.now()}`,
      channel: 'email',
      recipient: 'user@org2.com',
      body: 'Message for Org 2',
      organizationId: org2Id,
    });

    const org1List = await NotificationDeliveryService.listDeliveries({ organizationId: org1Id });
    const org2List = await NotificationDeliveryService.listDeliveries({ organizationId: org2Id });

    assert('Org 1 sees only its deliveries', org1List.total === 2 && org1List.deliveries.every(d => d.organization_id === org1Id));
    assert('Org 2 sees only its deliveries', org2List.total === 1 && org2List.deliveries.every(d => d.organization_id === org2Id));
    assert('Tenant isolation prevents Org 1 from seeing Org 2 deliveries', !org1List.deliveries.some(d => d.organization_id === org2Id));
  }

  console.log('\n========================================================');
  console.log(` Phase 23C.1 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
