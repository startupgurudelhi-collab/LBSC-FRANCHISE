export type NotificationType =
  | 'campaign_charge'
  | 'campaign_paused'
  | 'lead_opportunity'
  | 'opportunity_expired'
  | 'lead_unassigned'
  | 'sla_approaching'
  | 'sla_breached'
  | 'system';

export interface NotificationModel {
  id: string;
  user_id: string;
  organization_id?: string | null;
  type: NotificationType | string;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  reference_data?: Record<string, any> | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface CreateNotificationDto {
  userId: string;
  organizationId?: string | null;
  type: NotificationType | string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  referenceData?: Record<string, any> | null;
  skipExternalRouting?: boolean;
  forceInApp?: boolean;
}

export interface ListNotificationsFilter {
  isRead?: boolean;
  type?: string;
  limit?: number;
  offset?: number;
}
