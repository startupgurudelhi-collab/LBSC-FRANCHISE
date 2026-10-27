export type DeliveryChannel = 'whatsapp' | 'sms' | 'email';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DISABLED';

export interface DeliveryPayload {
  idempotencyKey: string;
  channel: DeliveryChannel;
  recipient: string;
  subject?: string | null;
  body: string;
  organizationId?: string | null;
  userId?: string | null;
  metadata?: Record<string, any> | null;
}

export interface DeliveryResult {
  success: boolean;
  deliveryId: string;
  idempotencyKey: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  recipient: string;
  provider: string;
  providerMessageId?: string | null;
  attemptCount: number;
  error?: string | null;
  createdAt: string;
  sentAt?: string | null;
  fromCacheOrDuplicate?: boolean;
}

export interface NotificationDeliveryRecord {
  id: string;
  idempotency_key: string;
  channel: DeliveryChannel;
  recipient: string;
  status: DeliveryStatus;
  attempt_count: number;
  provider: string | null;
  provider_message_id: string | null;
  subject: string | null;
  body: string;
  error: string | null;
  metadata: Record<string, any> | null;
  organization_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface NotificationProviderResponse {
  providerMessageId: string;
  rawResponse?: any;
}

export interface NotificationProvider {
  readonly channel: DeliveryChannel;
  readonly providerName: string;
  send(payload: DeliveryPayload): Promise<NotificationProviderResponse>;
}

export interface ListDeliveriesFilter {
  organizationId?: string;
  userId?: string;
  channel?: DeliveryChannel;
  status?: DeliveryStatus;
  limit?: number;
  offset?: number;
}
