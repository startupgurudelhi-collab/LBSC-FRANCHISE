export const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
} as const;

export type ClientStatusCode = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];

export const CLIENT_SOURCE = {
  DIRECT: 'direct',
  LEAD: 'lead',
  REFERRAL: 'referral',
  WALK_IN: 'walk_in',
  OTHER: 'other',
} as const;

export type ClientSourceCode = (typeof CLIENT_SOURCE)[keyof typeof CLIENT_SOURCE];

export interface ClientModel {
  id: string;
  client_number: string;
  franchise_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string | null;
  phone: string;
  alternate_phone?: string | null;
  business_name?: string | null;
  pan?: string | null;
  gstin?: string | null;
  city: string;
  district: string;
  state: string;
  pin?: string | null;
  address?: string | null;
  status: ClientStatusCode;
  source: ClientSourceCode;
  initial_lead_id?: string | null;
  notes?: string | null;
  tags?: string | null;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientWithDetails extends ClientModel {
  franchise_name?: string;
  franchise_code?: string;
  leads_count: number;
  latest_lead_at?: string | null;
  initial_lead_number?: string | null;
  initial_service_name?: string | null;
}

export interface CreateClientDto {
  franchiseId?: string; // Optional for franchise users (inferred from JWT), required for super admins
  firstName: string;
  lastName?: string;
  email?: string | null;
  phone: string;
  alternatePhone?: string | null;
  businessName?: string | null;
  pan?: string | null;
  gstin?: string | null;
  city: string;
  district: string;
  state: string;
  pin?: string | null;
  address?: string | null;
  source?: ClientSourceCode;
  initialLeadId?: string | null;
  notes?: string | null;
  tags?: string[] | string | null;
}

export interface UpdateClientDto {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string;
  alternatePhone?: string | null;
  businessName?: string | null;
  pan?: string | null;
  gstin?: string | null;
  city?: string;
  district?: string;
  state?: string;
  pin?: string | null;
  address?: string | null;
  status?: ClientStatusCode;
  notes?: string | null;
  tags?: string[] | string | null;
}

export interface ClientFilterQuery {
  franchiseId?: string;
  search?: string;
  city?: string;
  district?: string;
  state?: string;
  status?: ClientStatusCode;
  source?: ClientSourceCode;
  limit?: number;
  offset?: number;
}

export interface LinkedLeadItem {
  id: string;
  lead_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  service_id: string;
  service_name?: string;
  service_code?: string;
  service_fee?: number;
  commission_value?: number;
  city: string;
  district: string;
  state: string;
  status: string;
  assigned_franchise_id?: string | null;
  assigned_at?: string | null;
  created_at: string;
}

export interface ClientDetailResponse {
  client: ClientWithDetails;
  linkedLeads: LinkedLeadItem[];
}
