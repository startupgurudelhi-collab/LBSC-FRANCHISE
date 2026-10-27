/**
 * Lead Distribution Engine Types (Phase 7)
 */

export const LEAD_STATUS = {
  NEW: 'new',
  OFFERED: 'offered',
  ASSIGNED: 'assigned',
  OWN_LEAD_CENTER: 'own_lead_center',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const OPPORTUNITY_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
} as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUS)[keyof typeof OPPORTUNITY_STATUS];

export const LEAD_HISTORY_ACTION = {
  CREATED: 'created',
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  EXPIRED_RELEASED: 'expired_released',
  ROUTED_TO_OWN_LEAD_CENTER: 'routed_to_own_lead_center',
  REASSIGNED: 'reassigned',
  BOUGHT_LEAD: 'bought_lead',
} as const;

export type LeadHistoryAction = (typeof LEAD_HISTORY_ACTION)[keyof typeof LEAD_HISTORY_ACTION];

export const OPPORTUNITY_EXPIRY_MINUTES = 60; // Exactly 1 hour
export const OPPORTUNITY_EXPIRY_MS = OPPORTUNITY_EXPIRY_MINUTES * 60 * 1000;
export const MAX_CAMPAIGN_LEADS_PER_DAY = 5;

export interface LeadModel {
  id: string;
  lead_number: string;
  source: string;
  source_reference: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  service_id: string;
  city: string;
  district: string;
  state: string;
  pin: string | null;
  address: string | null;
  notes: string | null;
  status: LeadStatus;
  assigned_franchise_id: string | null;
  assigned_campaign_id: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadOpportunityModel {
  id: string;
  lead_id: string;
  franchise_id: string;
  campaign_id: string;
  status: OpportunityStatus;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  response_notes: string | null;
  created_at: string;
}

export interface LeadAssignmentHistoryModel {
  id: string;
  lead_id: string;
  action: LeadHistoryAction;
  from_franchise_id: string | null;
  to_franchise_id: string | null;
  campaign_id: string | null;
  opportunity_id: string | null;
  reason: string | null;
  performed_by_user_id: string | null;
  created_at: string;
}

export interface IngestLeadDto {
  source: string;
  sourceReference?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  serviceId: string;
  city: string;
  district: string;
  state: string;
  pin?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface AcceptOpportunityDto {
  notes?: string | null;
}

export interface LeadDetail extends LeadModel {
  service_code?: string;
  service_name?: string;
  service_fee?: number;
  assigned_franchise_name?: string;
  current_opportunity?: {
    id: string;
    franchise_id: string;
    campaign_id: string;
    franchise_name?: string;
    status: OpportunityStatus;
    offered_at: string;
    expires_at: string;
    seconds_remaining: number;
    is_expired: boolean;
  } | null;
  history?: LeadAssignmentHistoryModel[];
}

export interface FranchiseOpportunityDetail extends LeadOpportunityModel {
  lead_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  service_id: string;
  service_code: string;
  service_name: string;
  city: string;
  district: string;
  state: string;
  campaign_name: string | null;
  seconds_remaining: number;
  is_expired: boolean;
}

export interface ListLeadsFilter {
  status?: LeadStatus;
  serviceId?: string;
  city?: string;
  district?: string;
  state?: string;
  franchiseId?: string;
  limit?: number;
  offset?: number;
}

export const BUY_LEAD_PRICE = 20.0;
export const MAX_BUY_LEADS_ZERO_BALANCE = 3;

export interface LeadPurchaseModel {
  id: string;
  lead_id: string;
  franchise_id: string;
  purchased_by_user_id: string | null;
  price: number;
  currency: string;
  ledger_entry_id: string;
  ledger_reference_id: string;
  balance_before: number;
  balance_after: number;
  purchased_at: string;
}

export interface BuyLeadResult {
  lead: LeadDetail;
  purchase: LeadPurchaseModel;
  commission: {
    balanceBefore: number;
    balanceAfter: number;
    amountDeducted: number;
    zeroBalanceBuyCount: number;
    ledgerReferenceId: string;
  };
}

export interface OwnLeadCenterItem extends LeadModel {
  service_code?: string;
  service_name?: string;
  service_fee?: number;
  price: number;
  category_name?: string;
}

