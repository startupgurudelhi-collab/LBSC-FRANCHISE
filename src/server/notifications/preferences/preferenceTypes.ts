export interface UserNotificationPreferences {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  categoryOverrides?: Record<string, Partial<Record<'inApp' | 'email' | 'whatsapp' | 'sms', boolean>>> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdatePreferencesDto {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
  smsEnabled?: boolean;
  categoryOverrides?: Record<string, Partial<Record<'inApp' | 'email' | 'whatsapp' | 'sms', boolean>>> | null;
}
