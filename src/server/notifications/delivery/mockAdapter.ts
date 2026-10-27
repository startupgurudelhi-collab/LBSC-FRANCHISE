import type {
  DeliveryChannel,
  DeliveryPayload,
  NotificationProvider,
  NotificationProviderResponse,
} from './deliveryTypes.js';

export function maskRecipient(recipient: string): string {
  if (!recipient) return '***';
  if (recipient.includes('@')) {
    const parts = recipient.split('@');
    const local = parts[0];
    const domain = parts.slice(1).join('@');
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }
  // Mask phone number
  const trimmed = recipient.trim();
  if (trimmed.length > 4) {
    const start = trimmed.slice(0, 3);
    const end = trimmed.slice(-2);
    return `${start}****${end}`;
  }
  return '****';
}

export class MockNotificationAdapter implements NotificationProvider {
  readonly channel: DeliveryChannel;
  readonly providerName: string;
  private mode: 'MOCK' | 'LOG_ONLY';
  private simulateFailure = false;
  private simulatedErrorMessage = 'Simulated provider connection error';

  constructor(
    channel: DeliveryChannel,
    mode: 'MOCK' | 'LOG_ONLY' = 'MOCK',
    providerName?: string
  ) {
    this.channel = channel;
    this.mode = mode;
    this.providerName = providerName || (mode === 'LOG_ONLY' ? `log_only_${channel}` : `mock_${channel}`);
  }

  setSimulateFailure(fail: boolean, errorMessage?: string): void {
    this.simulateFailure = fail;
    if (errorMessage) {
      this.simulatedErrorMessage = errorMessage;
    }
  }

  setMode(mode: 'MOCK' | 'LOG_ONLY'): void {
    this.mode = mode;
  }

  async send(payload: DeliveryPayload): Promise<NotificationProviderResponse> {
    if (this.simulateFailure) {
      throw new Error(this.simulatedErrorMessage);
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const prefix = this.mode === 'LOG_ONLY' ? 'log' : 'mock';
    const providerMessageId = `${prefix}_${this.channel}_${timestamp}_${randomSuffix}`;

    const masked = maskRecipient(payload.recipient);

    if (this.mode === 'LOG_ONLY') {
      console.log(
        `[LOG_ONLY ${this.channel.toUpperCase()}] To: ${masked} | Subject: ${payload.subject || '(none)'} | Key: ${payload.idempotencyKey} | MsgId: ${providerMessageId}`
      );
    } else {
      console.log(
        `[MOCK ${this.channel.toUpperCase()}] To: ${masked} | Key: ${payload.idempotencyKey} | MsgId: ${providerMessageId}`
      );
    }

    return {
      providerMessageId,
      rawResponse: {
        mode: this.mode,
        channel: this.channel,
        recipientMasked: masked,
        simulatedAt: new Date(timestamp).toISOString(),
      },
    };
  }
}
