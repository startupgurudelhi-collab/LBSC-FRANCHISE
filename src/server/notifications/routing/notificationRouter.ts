import { getDatabase } from '../../db/connection.js';
import type { NotificationModel } from '../types.js';
import type { DeliveryChannel } from '../delivery/deliveryTypes.js';
import { NotificationDeliveryService } from '../delivery/deliveryService.js';
import { NotificationPreferenceService } from '../preferences/preferenceService.js';
import type {
  NotificationRoutingResult,
  RoutedChannelResult,
  RouteNotificationOptions,
} from './routerTypes.js';

export class NotificationRouter {
  /**
   * Route an eligible in-app notification event to external delivery channels
   * based on user preferences, verified contact details, and system configuration.
   */
  static async routeNotification(
    notification: NotificationModel,
    options: RouteNotificationOptions = {}
  ): Promise<NotificationRoutingResult> {
    const results: RoutedChannelResult[] = [];
    const db = getDatabase();

    try {
      // 1. Fetch recipient user details
      const userRows = await db.query<any>(
        `SELECT id, organization_id, email, phone, status FROM users WHERE id = ?`,
        [notification.user_id]
      );

      if (!userRows || userRows.length === 0) {
        return {
          notificationId: notification.id,
          userId: notification.user_id,
          organizationId: notification.organization_id || null,
          results: [
            { channel: 'email', status: 'SKIPPED', reason: 'User not found' },
            { channel: 'sms', status: 'SKIPPED', reason: 'User not found' },
            { channel: 'whatsapp', status: 'SKIPPED', reason: 'User not found' },
          ],
        };
      }

      const user = userRows[0];

      // Verify user account is active
      if (user.status !== 'active') {
        return {
          notificationId: notification.id,
          userId: user.id,
          organizationId: user.organization_id || null,
          results: [
            { channel: 'email', status: 'SKIPPED', reason: 'User account is not active' },
            { channel: 'sms', status: 'SKIPPED', reason: 'User account is not active' },
            { channel: 'whatsapp', status: 'SKIPPED', reason: 'User account is not active' },
          ],
        };
      }

      // Tenant / Organization Isolation Enforcement
      if (options.callerOrgId && options.callerOrgId !== user.organization_id) {
        return {
          notificationId: notification.id,
          userId: user.id,
          organizationId: user.organization_id || null,
          results: [
            { channel: 'email', status: 'SKIPPED', reason: 'Tenant mismatch: caller organization does not match recipient' },
            { channel: 'sms', status: 'SKIPPED', reason: 'Tenant mismatch: caller organization does not match recipient' },
            { channel: 'whatsapp', status: 'SKIPPED', reason: 'Tenant mismatch: caller organization does not match recipient' },
          ],
        };
      }

      if (
        notification.organization_id &&
        user.organization_id &&
        notification.organization_id !== user.organization_id
      ) {
        return {
          notificationId: notification.id,
          userId: user.id,
          organizationId: user.organization_id || null,
          results: [
            { channel: 'email', status: 'SKIPPED', reason: 'Tenant mismatch: notification organization does not match user' },
            { channel: 'sms', status: 'SKIPPED', reason: 'Tenant mismatch: notification organization does not match user' },
            { channel: 'whatsapp', status: 'SKIPPED', reason: 'Tenant mismatch: notification organization does not match user' },
          ],
        };
      }

      // 2. Load user notification preferences
      const preferences = await NotificationPreferenceService.getPreferences(user.id);
      const categoryOverrides = preferences.categoryOverrides?.[notification.type];

      const targetChannels: DeliveryChannel[] = options.channels || ['whatsapp', 'sms', 'email'];

      // 3. Process each channel safely
      for (const channel of targetChannels) {
        // A. Check user preference
        let isChannelEnabledByUser = true;
        if (channel === 'whatsapp') {
          isChannelEnabledByUser = preferences.whatsappEnabled;
          if (categoryOverrides?.whatsapp !== undefined) {
            isChannelEnabledByUser = categoryOverrides.whatsapp;
          }
        } else if (channel === 'sms') {
          isChannelEnabledByUser = preferences.smsEnabled;
          if (categoryOverrides?.sms !== undefined) {
            isChannelEnabledByUser = categoryOverrides.sms;
          }
        } else if (channel === 'email') {
          isChannelEnabledByUser = preferences.emailEnabled;
          if (categoryOverrides?.email !== undefined) {
            isChannelEnabledByUser = categoryOverrides.email;
          }
        }

        if (!isChannelEnabledByUser) {
          results.push({
            channel,
            status: 'SKIPPED',
            reason: `Disabled by user preferences`,
          });
          continue;
        }

        // B. Check verified recipient contact details
        let recipient: string | null = null;
        if (channel === 'email') {
          const rawEmail = (user.email || '').trim();
          if (rawEmail && rawEmail.includes('@')) {
            recipient = rawEmail;
          } else {
            results.push({
              channel,
              status: 'SKIPPED',
              reason: 'Recipient email address is missing or invalid',
            });
            continue;
          }
        } else if (channel === 'whatsapp' || channel === 'sms') {
          const rawPhone = (user.phone || '').trim();
          // Safe phone format check: must have at least 7 digits
          const digitsOnly = rawPhone.replace(/\D/g, '');
          if (digitsOnly.length >= 7) {
            recipient = rawPhone;
          } else {
            results.push({
              channel,
              status: 'SKIPPED',
              reason: `Recipient phone number is missing or invalid`,
            });
            continue;
          }
        }

        if (!recipient) {
          results.push({
            channel,
            status: 'SKIPPED',
            reason: 'Missing recipient contact details',
          });
          continue;
        }

        // C. Stable, deterministic idempotency key per notification and channel
        const idempotencyKey = `route_${notification.id}_${channel}`;

        // D. Deliver through NotificationDeliveryService
        const deliveryResult = await NotificationDeliveryService.deliver(
          {
            idempotencyKey,
            channel,
            recipient,
            subject: notification.title,
            body: notification.message,
            organizationId: user.organization_id || notification.organization_id || null,
            userId: user.id,
            metadata: {
              notificationId: notification.id,
              type: notification.type,
              entityType: notification.entity_type,
              entityId: notification.entity_id,
            },
          },
          { forceRetry: options.forceRetry }
        );

        results.push({
          channel,
          status: deliveryResult.status,
          deliveryId: deliveryResult.deliveryId,
          reason: deliveryResult.error || undefined,
          providerMessageId: deliveryResult.providerMessageId,
          fromCacheOrDuplicate: deliveryResult.fromCacheOrDuplicate,
        });
      }

      return {
        notificationId: notification.id,
        userId: user.id,
        organizationId: user.organization_id || notification.organization_id || null,
        results,
      };
    } catch (err: any) {
      console.error('[NotificationRouter] Unexpected routing error:', err?.message);
      return {
        notificationId: notification.id,
        userId: notification.user_id,
        organizationId: notification.organization_id || null,
        results: [
          { channel: 'email', status: 'SKIPPED', reason: `Routing error: ${err?.message}` },
          { channel: 'sms', status: 'SKIPPED', reason: `Routing error: ${err?.message}` },
          { channel: 'whatsapp', status: 'SKIPPED', reason: `Routing error: ${err?.message}` },
        ],
      };
    }
  }
}
