import type { DeliveryChannel, DeliveryStatus } from '../delivery/deliveryTypes.js';

export interface RoutedChannelResult {
  channel: DeliveryChannel;
  status: DeliveryStatus | 'SKIPPED';
  deliveryId?: string;
  reason?: string;
  providerMessageId?: string | null;
  fromCacheOrDuplicate?: boolean;
}

export interface NotificationRoutingResult {
  notificationId: string;
  userId: string;
  organizationId?: string | null;
  results: RoutedChannelResult[];
}

export interface RouteNotificationOptions {
  channels?: DeliveryChannel[];
  forceRetry?: boolean;
  callerOrgId?: string;
}
