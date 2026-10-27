import type { LeadDetail } from '../../leads/types.js';

export interface LeadWebhookPayload {
  // Customer details
  customerName?: string;
  name?: string;
  fullName?: string;
  full_name?: string;

  customerPhone?: string;
  phone?: string;
  phoneNumber?: string;
  phone_number?: string;

  customerEmail?: string | null;
  email?: string | null;

  // Service details (any of these can be mapped to active service_id)
  serviceId?: string;
  service_id?: string;
  serviceCode?: string;
  service_code?: string;
  serviceSlug?: string;
  service_slug?: string;
  serviceName?: string;
  service_name?: string;

  // Location details
  city?: string;
  district?: string;
  state?: string;
  pin?: string | null;
  pincode?: string | null;
  address?: string | null;

  // Source & Attribution
  source?: string;
  sourceReference?: string | null;
  source_reference?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;

  // External identifiers & Idempotency
  idempotencyKey?: string | null;
  idempotency_key?: string | null;
  externalLeadId?: string | null;
  external_lead_id?: string | null;
  leadgen_id?: string | null; // Meta leadgen_id
  form_id?: string | null;

  notes?: string | null;
  customFields?: Record<string, any> | null;
}

export interface NormalizedLeadData {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  city: string;
  district: string;
  state: string;
  pin: string | null;
  address: string | null;
  notes: string | null;
  source: string;
  sourceReference: string | null;
  idempotencyKey: string;
  payloadHash: string;
}

export interface LeadIntakeResult {
  success: boolean;
  isDuplicate: boolean;
  message: string;
  lead: LeadDetail;
  routing?: {
    status: string;
    franchiseId?: string;
    opportunityId?: string;
    reason?: string;
  };
  idempotencyKey: string;
  receivedAt: string;
}

export interface LeadWebhookActivityItem {
  id: string;
  timestamp: string;
  source: string;
  sourceReference: string | null;
  customerPhoneMasked: string;
  customerName: string;
  serviceCode: string;
  serviceName: string;
  leadNumber: string | null;
  status: string; // 'processed' | 'duplicate_prevented'
  isDuplicate: boolean;
  duplicateReason?: string | null;
  idempotencyKey: string;
}

export interface LeadIntakeChannelCounts {
  meta: number;
  google: number;
  landingPage: number;
  other: number;
  total: number;
}

export interface LeadIntakeStatus {
  webhookSecretConfigured: boolean;
  isProduction: boolean;
  totalIdempotencyRecords: number;
  totalUniqueLeadsIngested: number;
  duplicateAttemptsPrevented: number;
  statusMessage: string;
  webhookEndpoint: string;
  channels: LeadIntakeChannelCounts;
  recentActivity: LeadWebhookActivityItem[];
}
