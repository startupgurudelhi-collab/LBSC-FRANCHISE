/**
 * Phase 6: Campaign Management Types
 * 
 * Rules:
 * - Franchise campaign creation and management
 * - Campaign linked to franchise + service
 * - Campaign location: City, District, State
 * - Campaign status: Active / Paused
 * - Fixed campaign fee: ₹100/day
 * - Maximum campaign leads: 5/day
 * - Daily campaign charge deducted from the franchise commission balance
 * - Negative commission balance is allowed
 * - If commission balance is ₹0 or below, campaign may continue for maximum 3 days, then automatically PAUSES
 * - Track campaign daily charges and remaining zero-balance grace days
 * - Campaign start/end dates
 * - Admin campaign management APIs
 * - Franchise campaign APIs
 * - Audit logging
 */

export const CAMPAIGN_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

export const FIXED_CAMPAIGN_DAILY_FEE = 100.0;
export const MAX_CAMPAIGN_LEADS_PER_DAY = 5;
export const MAX_ZERO_BALANCE_GRACE_DAYS = 3;

export interface FranchiseCampaignModel {
  id: string;
  organization_id: string;
  service_id: string;
  name: string | null;
  city: string;
  district: string;
  state: string;
  status: CampaignStatus;
  pause_reason: string | null;
  daily_fee: number;
  max_leads_per_day: number;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD or null
  zero_balance_days_count: number; // 0 to 3
  last_charged_date: string | null; // YYYY-MM-DD
  total_charges_count: number;
  total_charges_amount: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignDetail extends FranchiseCampaignModel {
  remaining_zero_balance_grace_days: number;
  service_code?: string;
  service_name?: string;
  service_fee?: number;
  franchise_code?: string;
  operating_name?: string;
}

export interface CampaignDailyChargeModel {
  id: string;
  campaign_id: string;
  organization_id: string;
  charge_date: string; // YYYY-MM-DD
  amount: number; // 100.0
  ledger_entry_id: string | null;
  balance_before: number;
  balance_after: number;
  zero_balance_day_count: number;
  status: 'success' | 'paused_after_charge' | 'paused_due_to_grace_exhausted';
  notes: string | null;
  created_at: string;
}

export interface CreateCampaignDto {
  organizationId?: string; // required if admin, inferred if franchise user
  serviceId: string;
  name?: string;
  city: string;
  district: string;
  state: string;
  startDate?: string; // YYYY-MM-DD, defaults to today
  endDate?: string | null; // YYYY-MM-DD
  status?: CampaignStatus; // defaults to 'active'
}

export interface UpdateCampaignDto {
  name?: string;
  city?: string;
  district?: string;
  state?: string;
  endDate?: string | null;
  status?: CampaignStatus;
}

export interface ListCampaignsFilter {
  organizationId?: string;
  serviceId?: string;
  status?: CampaignStatus;
  city?: string;
  district?: string;
  state?: string;
  limit?: number;
  offset?: number;
}
