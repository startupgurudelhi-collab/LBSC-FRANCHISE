/**
 * Franchise Module Types & Status Workflow Models
 * Cleaned up Phase 3: Location mapping limited strictly to City, District, State, PIN
 */

export const FRANCHISE_APPLICATION_STATUS = {
  APPLICATION: 'application',
  SCREENING: 'screening',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
} as const;

export type FranchiseApplicationStatus =
  (typeof FRANCHISE_APPLICATION_STATUS)[keyof typeof FRANCHISE_APPLICATION_STATUS];

export interface FranchiseLocation {
  city: string;
  district: string;
  state: string;
  pin: string;
}

export interface FranchiseApplicationModel {
  id: string;
  organization_id: string | null;
  applicant_user_id: string | null;
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: FranchiseApplicationStatus;
  
  // Location fields for lead mapping (City, District, State, PIN)
  city: string;
  district: string;
  state: string;
  pin: string;
  
  screening_notes: string | null;
  rejection_reason: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
  
  created_at: string;
  updated_at: string;
}

export interface FranchiseProfileModel {
  id: string;
  organization_id: string;
  application_id: string | null;
  franchise_code: string;
  operating_name: string;
  legal_name: string;
  tax_id: string | null;
  contact_email: string;
  contact_phone: string;
  status: 'active' | 'deactivated' | 'suspended';

  // Location fields for lead mapping (City, District, State, PIN)
  city: string;
  district: string;
  state: string;
  pin: string;

  created_at: string;
  updated_at: string;
}
