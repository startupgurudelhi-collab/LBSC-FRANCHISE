export type EfilinggIntegrationMode = 'DISABLED' | 'SANDBOX' | 'LIVE';

export type EfilinggStatus =
  | 'NOT_SYNCED'
  | 'SYNCED'
  | 'IN_PROGRESS'
  | 'QUERY_RAISED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';

export interface EfilinggSyncResult {
  success: boolean;
  mode: EfilinggIntegrationMode;
  externalFilingId: string | null;
  arnNumber: string | null;
  srnNumber: string | null;
  challanNumber: string | null;
  status: string;
  syncedAt: string;
  error?: string | null;
  isSimulated: boolean;
  message: string;
}

export interface EfilinggWebhookPayload {
  event: string; // e.g. 'filing.acknowledged', 'filing.query_raised', 'filing.completed'
  timestamp: string;
  externalFilingId: string;
  applicationNumber?: string;
  arnNumber?: string;
  srnNumber?: string;
  challanNumber?: string;
  status: string;
  statusReason?: string;
  isSimulated?: boolean;
}

export interface EfilinggIntegrationStatus {
  mode: EfilinggIntegrationMode;
  apiUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  isLiveContractAvailable: boolean;
  totalSyncedApplications: number;
  totalWithArn: number;
  totalWithSrn: number;
  statusMessage: string;
}

export interface UpdateFilingReferencesInput {
  arn_number?: string | null;
  srn_number?: string | null;
  challan_number?: string | null;
  efilingg_status?: string | null;
  notes?: string | null;
}
