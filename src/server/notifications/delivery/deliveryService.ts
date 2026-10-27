import { getDatabase } from '../../db/connection.js';
import { env } from '../../config/env.js';
import type {
  DeliveryChannel,
  DeliveryPayload,
  DeliveryResult,
  DeliveryStatus,
  ListDeliveriesFilter,
  NotificationDeliveryRecord,
  NotificationProvider,
} from './deliveryTypes.js';
import { MockNotificationAdapter } from './mockAdapter.js';

export class NotificationDeliveryService {
  private static providers: Map<DeliveryChannel, NotificationProvider> = new Map();
  private static channelOverrides: Map<DeliveryChannel, boolean> = new Map();

  static {
    this.resetProviders();
  }

  /**
   * Resets registered providers to default MOCK / LOG_ONLY adapters based on env
   */
  static resetProviders(): void {
    this.providers.clear();
    const mode = (env.NOTIFICATION_PROVIDER_MODE || 'MOCK') as 'MOCK' | 'LOG_ONLY';

    this.providers.set('whatsapp', new MockNotificationAdapter('whatsapp', mode));
    this.providers.set('sms', new MockNotificationAdapter('sms', mode));
    this.providers.set('email', new MockNotificationAdapter('email', mode));
  }

  /**
   * Register a custom provider for a channel
   */
  static registerProvider(channel: DeliveryChannel, provider: NotificationProvider): void {
    this.providers.set(channel, provider);
  }

  /**
   * Get registered provider for a channel
   */
  static getProvider(channel: DeliveryChannel): NotificationProvider | undefined {
    return this.providers.get(channel);
  }

  /**
   * Set runtime override for a channel (useful for testing without mutating process.env)
   */
  static setChannelOverride(channel: DeliveryChannel, enabled?: boolean): void {
    if (enabled === undefined) {
      this.channelOverrides.delete(channel);
    } else {
      this.channelOverrides.set(channel, enabled);
    }
  }

  /**
   * Clear all channel runtime overrides
   */
  static clearChannelOverrides(): void {
    this.channelOverrides.clear();
  }

  /**
   * Check whether a channel is currently enabled
   */
  static isChannelEnabled(channel: DeliveryChannel): boolean {
    if (this.channelOverrides.has(channel)) {
      return this.channelOverrides.get(channel)!;
    }

    switch (channel) {
      case 'whatsapp':
        return Boolean(env.NOTIFICATION_WHATSAPP_ENABLED);
      case 'sms':
        return Boolean(env.NOTIFICATION_SMS_ENABLED);
      case 'email':
        return Boolean(env.NOTIFICATION_EMAIL_ENABLED);
      default:
        return false;
    }
  }

  /**
   * Core delivery method.
   * Guarantees:
   * 1. Idempotency by idempotencyKey (no duplicate delivery records).
   * 2. Disabled channels record a persistent status without making external calls.
   * 3. External delivery failures are recorded and never throw or crash the caller.
   */
  static async deliver(
    payload: DeliveryPayload,
    options?: { forceRetry?: boolean }
  ): Promise<DeliveryResult> {
    try {
      const db = getDatabase();
      const idempotencyKey = payload.idempotencyKey.trim();

      if (!idempotencyKey) {
        throw new Error('idempotencyKey is required for notification delivery');
      }

      // 1. Idempotency check: see if a delivery record already exists for this key
      const existing = await this.getDeliveryByIdempotencyKey(idempotencyKey);
      if (existing) {
        // If already SENT or DISABLED, or if FAILED without forceRetry, return existing record
        if (
          existing.status === 'SENT' ||
          existing.status === 'DISABLED' ||
          (existing.status === 'FAILED' && !options?.forceRetry)
        ) {
          return {
            success: existing.status === 'SENT',
            deliveryId: existing.id,
            idempotencyKey: existing.idempotency_key,
            channel: existing.channel,
            status: existing.status,
            recipient: existing.recipient,
            provider: existing.provider || 'UNKNOWN',
            providerMessageId: existing.provider_message_id,
            attemptCount: existing.attempt_count,
            error: existing.error,
            createdAt: existing.created_at,
            sentAt: existing.sent_at,
            fromCacheOrDuplicate: true,
          };
        }
      }

      const nowIso = new Date().toISOString();
      const deliveryId = existing?.id || `nd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const isChannelOn = this.isChannelEnabled(payload.channel);

      // 2. If channel is disabled, record a persistent DISABLED record
      if (!isChannelOn) {
        const disabledReason = `Delivery channel '${payload.channel}' is disabled by system configuration`;

        if (existing) {
          await db.execute(
            `UPDATE notification_deliveries 
             SET status = 'DISABLED', error = ?, updated_at = ? 
             WHERE id = ?`,
            [disabledReason, nowIso, existing.id]
          );
        } else {
          try {
            await db.execute(
              `INSERT INTO notification_deliveries (
                id, idempotency_key, channel, recipient, status, attempt_count,
                provider, provider_message_id, subject, body, error, metadata,
                organization_id, user_id, created_at, updated_at, sent_at
              ) VALUES (?, ?, ?, ?, 'DISABLED', 0, 'NONE', NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
              [
                deliveryId,
                idempotencyKey,
                payload.channel,
                payload.recipient.trim(),
                payload.subject || null,
                payload.body,
                disabledReason,
                payload.metadata ? JSON.stringify(payload.metadata) : null,
                payload.organizationId || null,
                payload.userId || null,
                nowIso,
                nowIso,
              ]
            );
          } catch (insertErr: any) {
            // Concurrent insert race check: if unique constraint triggered, return existing record
            const raced = await this.getDeliveryByIdempotencyKey(idempotencyKey);
            if (raced) {
              return {
                success: raced.status === 'SENT',
                deliveryId: raced.id,
                idempotencyKey: raced.idempotency_key,
                channel: raced.channel,
                status: raced.status,
                recipient: raced.recipient,
                provider: raced.provider || 'NONE',
                providerMessageId: raced.provider_message_id,
                attemptCount: raced.attempt_count,
                error: raced.error,
                createdAt: raced.created_at,
                sentAt: raced.sent_at,
                fromCacheOrDuplicate: true,
              };
            }
            throw insertErr;
          }
        }

        return {
          success: false,
          deliveryId,
          idempotencyKey,
          channel: payload.channel,
          status: 'DISABLED',
          recipient: payload.recipient,
          provider: 'NONE',
          providerMessageId: null,
          attemptCount: 0,
          error: disabledReason,
          createdAt: nowIso,
          sentAt: null,
          fromCacheOrDuplicate: false,
        };
      }

      // 3. Channel is enabled: prepare provider and insert/update delivery row
      const provider = this.getProvider(payload.channel);
      if (!provider) {
        throw new Error(`No delivery provider registered for channel '${payload.channel}'`);
      }

      const attemptCount = (existing?.attempt_count || 0) + 1;

      if (existing) {
        await db.execute(
          `UPDATE notification_deliveries 
           SET status = 'PENDING', attempt_count = ?, provider = ?, updated_at = ? 
           WHERE id = ?`,
          [attemptCount, provider.providerName, nowIso, existing.id]
        );
      } else {
        try {
          await db.execute(
            `INSERT INTO notification_deliveries (
              id, idempotency_key, channel, recipient, status, attempt_count,
              provider, provider_message_id, subject, body, error, metadata,
              organization_id, user_id, created_at, updated_at, sent_at
            ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)`,
            [
              deliveryId,
              idempotencyKey,
              payload.channel,
              payload.recipient.trim(),
              attemptCount,
              provider.providerName,
              payload.subject || null,
              payload.body,
              payload.metadata ? JSON.stringify(payload.metadata) : null,
              payload.organizationId || null,
              payload.userId || null,
              nowIso,
              nowIso,
            ]
          );
        } catch (insertErr: any) {
          // If concurrent insert race occurred on idempotency_key, fetch existing
          const raced = await this.getDeliveryByIdempotencyKey(idempotencyKey);
          if (raced) {
            return {
              success: raced.status === 'SENT',
              deliveryId: raced.id,
              idempotencyKey: raced.idempotency_key,
              channel: raced.channel,
              status: raced.status,
              recipient: raced.recipient,
              provider: raced.provider || provider.providerName,
              providerMessageId: raced.provider_message_id,
              attemptCount: raced.attempt_count,
              error: raced.error,
              createdAt: raced.created_at,
              sentAt: raced.sent_at,
              fromCacheOrDuplicate: true,
            };
          }
          throw insertErr;
        }
      }

      // 4. Perform provider send wrapped in safe try/catch
      try {
        const response = await provider.send(payload);
        const sentAtIso = new Date().toISOString();

        await db.execute(
          `UPDATE notification_deliveries 
           SET status = 'SENT', provider_message_id = ?, sent_at = ?, updated_at = ?, error = NULL 
           WHERE id = ?`,
          [response.providerMessageId, sentAtIso, sentAtIso, deliveryId]
        );

        return {
          success: true,
          deliveryId,
          idempotencyKey,
          channel: payload.channel,
          status: 'SENT',
          recipient: payload.recipient,
          provider: provider.providerName,
          providerMessageId: response.providerMessageId,
          attemptCount,
          error: null,
          createdAt: nowIso,
          sentAt: sentAtIso,
          fromCacheOrDuplicate: false,
        };
      } catch (providerErr: any) {
        const errorMsg = providerErr?.message || String(providerErr);
        const failedAtIso = new Date().toISOString();

        await db.execute(
          `UPDATE notification_deliveries 
           SET status = 'FAILED', error = ?, updated_at = ? 
           WHERE id = ?`,
          [errorMsg, failedAtIso, deliveryId]
        );

        // Never throw provider errors out to caller!
        return {
          success: false,
          deliveryId,
          idempotencyKey,
          channel: payload.channel,
          status: 'FAILED',
          recipient: payload.recipient,
          provider: provider.providerName,
          providerMessageId: null,
          attemptCount,
          error: errorMsg,
          createdAt: nowIso,
          sentAt: null,
          fromCacheOrDuplicate: false,
        };
      }
    } catch (topLevelErr: any) {
      // Even top-level errors (e.g. schema/db failures) should not crash the business transaction
      console.error('[NotificationDeliveryService] Unexpected failure in deliver():', topLevelErr?.message);
      return {
        success: false,
        deliveryId: `fallback_${Date.now()}`,
        idempotencyKey: payload.idempotencyKey,
        channel: payload.channel,
        status: 'FAILED',
        recipient: payload.recipient,
        provider: 'NONE',
        providerMessageId: null,
        attemptCount: 0,
        error: topLevelErr?.message || 'Unexpected delivery service error',
        createdAt: new Date().toISOString(),
        sentAt: null,
        fromCacheOrDuplicate: false,
      };
    }
  }

  /**
   * Retrieve delivery record by ID
   */
  static async getDeliveryById(id: string): Promise<NotificationDeliveryRecord | null> {
    const db = getDatabase();
    const rows = await db.query<any>(
      `SELECT * FROM notification_deliveries WHERE id = ?`,
      [id]
    );

    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Retrieve delivery record by idempotency key
   */
  static async getDeliveryByIdempotencyKey(key: string): Promise<NotificationDeliveryRecord | null> {
    const db = getDatabase();
    const rows = await db.query<any>(
      `SELECT * FROM notification_deliveries WHERE idempotency_key = ?`,
      [key]
    );

    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * List deliveries with filtering and tenant isolation
   */
  static async listDeliveries(
    filter: ListDeliveriesFilter = {}
  ): Promise<{ deliveries: NotificationDeliveryRecord[]; total: number }> {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];

    // Tenant isolation: filter by organization if specified
    if (filter.organizationId) {
      conditions.push('organization_id = ?');
      params.push(filter.organizationId);
    }

    if (filter.userId) {
      conditions.push('user_id = ?');
      params.push(filter.userId);
    }

    if (filter.channel) {
      conditions.push('channel = ?');
      params.push(filter.channel);
    }

    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM notification_deliveries ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.cnt || 0);

    const limit = Math.max(1, Math.min(100, filter.limit || 50));
    const offset = Math.max(0, filter.offset || 0);

    const rows = await db.query<any>(
      `SELECT * FROM notification_deliveries 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const deliveries = rows.map((r: any) => this.mapRow(r));
    return { deliveries, total };
  }

  private static mapRow(row: any): NotificationDeliveryRecord {
    return {
      id: row.id,
      idempotency_key: row.idempotency_key,
      channel: row.channel,
      recipient: row.recipient,
      status: row.status as DeliveryStatus,
      attempt_count: Number(row.attempt_count || 0),
      provider: row.provider || null,
      provider_message_id: row.provider_message_id || null,
      subject: row.subject || null,
      body: row.body,
      error: row.error || null,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      organization_id: row.organization_id || null,
      user_id: row.user_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      sent_at: row.sent_at || null,
    };
  }
}
