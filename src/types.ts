export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId?: string | null;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface FranchiseProfile {
  id: string;
  organization_id: string;
  franchise_code: string;
  operating_name: string;
  legal_name: string;
  tax_id?: string | null;
  contact_email: string;
  contact_phone: string;
  status: string;
  city: string;
  district: string;
  state: string;
  pin: string;
  address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FranchiseApplication {
  id: string;
  application_number?: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: 'application' | 'screening' | 'approved' | 'rejected' | 'active' | 'deactivated' | string;
  city: string;
  district: string;
  state: string;
  pin: string;
  organization_id?: string | null;
  applicant_user_id?: string | null;
  screening_notes?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface FranchiseCommissionAccountDetail {
  id: string;
  organization_id: string;
  current_balance: number;
  currency: string;
  version: number;
  created_at: string;
  updated_at: string;
  franchise_code?: string;
  operating_name?: string;
  zero_balance_buy_count?: number;
  total_credit_count?: number;
  total_debit_count?: number;
}

export interface ServiceCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: number | boolean;
  display_order: number;
}

export interface ServiceMaster {
  id: string;
  category_id: string;
  category_name?: string;
  code: string;
  name: string;
  description?: string | null;
  service_fee: number;
  commission_value: number;
  is_active: number | boolean;
  turnaround_days: number;
  sla_hours: number;
  required_documents?: string | any[];
}

export interface CommissionBalance {
  id: string;
  organization_id: string;
  current_balance: number;
  total_credits: number;
  total_debits: number;
  currency: string;
  status: string;
  zero_balance_buy_count?: number;
  last_entry_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  organization_id: string;
  entry_type: 'credit' | 'debit';
  category: string;
  amount: number;
  balance_after: number;
  reference_id: string;
  external_reference?: string | null;
  description: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  organization_id: string;
  organization_name?: string;
  service_id: string;
  service_name?: string;
  service_code?: string;
  name: string;
  city: string;
  district: string;
  state: string;
  status: 'active' | 'paused' | 'exhausted' | 'cancelled';
  daily_fee: number;
  max_leads_per_day: number;
  start_date: string;
  end_date?: string | null;
  last_charged_date?: string | null;
  leads_today_count?: number;
  created_at: string;
}

export interface Lead {
  id: string;
  lead_number: string;
  source: string;
  source_reference?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  service_id: string;
  service_name?: string;
  service_code?: string;
  assigned_franchise_id?: string | null;
  franchise_name?: string | null;
  assigned_campaign_id?: string | null;
  city: string;
  district: string;
  state: string;
  status: 'new' | 'offered' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'own_lead_center';
  assigned_at?: string | null;
  created_at: string;
  notes?: string | null;
  service_fee?: number;
  commission_value?: number;
  client_id?: string | null;
}

// Phase 20: Lead Intake Gateway Types
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
  status: string;
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

export interface LeadOpportunity {
  id: string;
  lead_id: string;
  franchise_id: string;
  campaign_id: string;
  status: 'pending' | 'accepted' | 'expired' | 'released';
  offered_at: string;
  expires_at: string;
  responded_at?: string | null;
  response_notes?: string | null;
  lead_number: string;
  source: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  city: string;
  district: string;
  state: string;
  service_id: string;
  service_name?: string;
  service_code?: string;
  service_fee?: number;
  commission_value?: number;
  campaign_name?: string;
  franchise_name?: string;
  seconds_remaining?: number;
  is_expired?: boolean;
}

export interface LeadHistoryItem {
  id: string;
  lead_id: string;
  action: string;
  from_franchise_id?: string | null;
  to_franchise_id?: string | null;
  from_franchise_name?: string | null;
  to_franchise_name?: string | null;
  campaign_id?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface OwnLead {
  id: string;
  lead_number: string;
  source: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  service_id: string;
  service_code?: string;
  service_name?: string;
  service_fee?: number;
  category_name?: string;
  city: string;
  district: string;
  state: string;
  status: string;
  price: number;
  created_at: string;
  notes?: string | null;
}

export interface LeadPurchase {
  id: string;
  lead_id: string;
  franchise_id: string;
  purchased_by_user_id?: string | null;
  price: number;
  currency: string;
  ledger_entry_id: string;
  ledger_reference_id: string;
  balance_before: number;
  balance_after: number;
  purchased_at: string;
  lead_number?: string;
  customer_name?: string;
  customer_phone?: string;
  city?: string;
  district?: string;
  state?: string;
  service_name?: string;
  franchise_name?: string;
  purchaser_first_name?: string;
  purchaser_last_name?: string;
}

export interface Client {
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
  status: 'active' | 'inactive' | 'archived';
  source: 'direct' | 'lead' | 'referral' | 'walk_in' | 'other';
  initial_lead_id?: string | null;
  notes?: string | null;
  tags?: string | null;
  created_at: string;
  updated_at: string;
  franchise_name?: string;
  franchise_code?: string;
  leads_count?: number;
  latest_lead_at?: string | null;
}

export type ReportTabType = 'network_revenue' | 'franchise' | 'leads' | 'commissions' | 'services' | 'custom';

export interface ReportFilterCriteria {
  startDate?: string;
  endDate?: string;
  franchise?: string;
  service?: string;
  status?: string;
  city?: string;
  district?: string;
  state?: string;
  search?: string;
}

export interface FranchiseSummaryKPIs {
  total: number;
  active: number;
  totalBalance: number;
  activeCampaigns: number;
}

export interface FranchiseSummaryReport {
  kpis: FranchiseSummaryKPIs;
  breakdowns: {
    byState: Array<{ state: string; count: number; totalBalance: number }>;
    byStatus: Array<{ status: string; count: number }>;
  };
  records: Array<{
    organizationId: string;
    franchiseCode: string;
    operatingName: string;
    city: string;
    district: string;
    state: string;
    status: string;
    currentBalance: number;
    activeCampaignsCount: number;
    createdAt: string;
  }>;
}

export interface LeadMetricsKPIs {
  total: number;
  offered: number;
  assigned: number;
  ownLeadCenter: number;
  converted: number;
  closed: number;
  grossValue: number;
}

export interface LeadMetricsReport {
  kpis: LeadMetricsKPIs;
  breakdowns: {
    byStatus: Array<{ status: string; count: number; grossValue: number }>;
    byService: Array<{ serviceId: string; serviceName: string; count: number; grossValue: number }>;
    byState: Array<{ state: string; count: number }>;
    byCity: Array<{ city: string; count: number }>;
  };
  records: Array<{
    id: string;
    leadNumber: string;
    customerName: string;
    customerPhone: string;
    serviceId: string;
    serviceName: string;
    city: string;
    district: string;
    state: string;
    status: string;
    serviceFee: number;
    assignedFranchiseName?: string;
    createdAt: string;
  }>;
}

export interface CommissionMetricsKPIs {
  totalEntries: number;
  totalCredits: number;
  totalDebits: number;
  netBalance: number;
}

export interface CommissionMetricsReport {
  kpis: CommissionMetricsKPIs;
  breakdowns: {
    byCategory: Array<{ category: string; entryType: string; count: number; totalAmount: number }>;
    byFranchise: Array<{ organizationId: string; franchiseName: string; credits: number; debits: number; net: number }>;
  };
  records: Array<{
    id: string;
    organizationId: string;
    franchiseName: string;
    entryType: 'credit' | 'debit';
    category: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceId: string;
    description: string;
    createdAt: string;
  }>;
}

export interface ServiceMetricsKPIs {
  totalCatalog: number;
  activeServices: number;
  totalDemands: number;
  grossDemandFee: number;
  avgFee: number;
}

export interface ServiceMetricsReport {
  kpis: ServiceMetricsKPIs;
  breakdowns: {
    byCategory: Array<{ categoryName: string; count: number; activeCount: number }>;
    byPopularity: Array<{ serviceId: string; code: string; name: string; demandCount: number; demandRevenue: number }>;
  };
  records: Array<{
    id: string;
    code: string;
    name: string;
    categoryName: string;
    serviceFee: number;
    commissionValue: number;
    isActive: boolean;
    totalDemands: number;
    demandRevenue: number;
  }>;
}

export type CustomReportDataset = 'leads' | 'franchises' | 'commission_ledger' | 'services';

export interface CustomReportFieldDefinition {
  id: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  dbColumn: string;
  aggregatable?: boolean;
  groupable?: boolean;
}

export interface CustomReportDatasetSchema {
  dataset: CustomReportDataset;
  label: string;
  description: string;
  fields: CustomReportFieldDefinition[];
  supportedFilters: Array<'dateRange' | 'franchise' | 'service' | 'status' | 'city' | 'district' | 'state' | 'search'>;
}

export interface CustomReportAggregation {
  field: string;
  func: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  alias?: string;
}

export interface CustomReportRequest {
  dataset: CustomReportDataset;
  fields: string[];
  filters?: ReportFilterCriteria;
  groupBy?: string;
  aggregations?: CustomReportAggregation[];
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

export interface CustomReportResult {
  dataset: CustomReportDataset;
  totalRecords: number;
  fields: Array<{ id: string; label: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  executedAt: string;
  executionTimeMs: number;
}

export interface SavedCustomReportModel {
  id: string;
  name: string;
  description: string | null;
  dataset: CustomReportDataset;
  selected_fields: string;
  filter_criteria: string;
  group_by: string | null;
  aggregations: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportReadyReportData {
  reportType: ReportTabType;
  reportTitle: string;
  generatedAt: string;
  generatedBy: string;
  filtersApplied: Record<string, string>;
  summaryMetrics: Record<string, any>;
  columns: string[];
  rows: (string | number)[][];
  rowCount: number;
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory =
  | 'technical'
  | 'commission_billing'
  | 'lead_dispute'
  | 'service_inquiry'
  | 'general';

export interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal: number;
  created_at: string;
  author_name?: string;
  author_email?: string;
  author_role?: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  organization_id: string;
  created_by_user_id: string;
  assigned_to_user_id: string | null;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  organization_name?: string;
  franchise_code?: string;
  city?: string;
  creator_name?: string;
  creator_email?: string;
  assignee_name?: string;
  assignee_email?: string;
  message_count?: number;
  last_message_at?: string;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  urgent: number;
}

// ==========================================
// KNOWLEDGEBASE TYPES (PHASE 13B)
// ==========================================

export type KbArticleStatus = 'draft' | 'published' | 'archived';

export interface KbCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
  article_count?: number;
}

export interface KbArticle {
  id: string;
  category_id: string;
  category_name?: string;
  category_slug?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: KbArticleStatus;
  author_user_id: string;
  author_name?: string;
  author_email?: string;
  published_at: string | null;
  tags: string[] | string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface KbArticleDetail extends KbArticle {
  related_articles?: Array<{
    id: string;
    title: string;
    slug: string;
    summary: string;
  }>;
}

export interface KbStats {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  archivedArticles: number;
  totalCategories: number;
  totalViews: number;
}

// ==========================================
// OFFERS TYPES (PHASE 14A)
// ==========================================

export interface OfferServiceMapping {
  service_id: string;
  service_name: string;
  service_code: string;
  category_name?: string | null;
}

export interface Offer {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  is_active: number | boolean;
  created_by_user_id: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  services: OfferServiceMapping[];
}

export interface CreateOfferPayload {
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  service_ids: string[];
}

export interface UpdateOfferPayload {
  title?: string;
  description?: string | null;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  service_ids?: string[];
}

export interface OfferFilters {
  service_id?: string;
  search?: string;
  is_active?: boolean | string;
  page?: number;
  limit?: number;
}

// ==========================================
// MARKETING MATERIAL TYPES (PHASE 15A)
// ==========================================

export type MarketingMaterialType =
  | 'flyer'
  | 'brochure'
  | 'social_media'
  | 'banner'
  | 'poster'
  | 'presentation'
  | 'video'
  | 'document'
  | 'other';

export interface MarketingMaterialServiceMapping {
  service_id: string;
  service_name: string;
  service_code: string;
  category_name?: string | null;
}

export interface MarketingMaterial {
  id: string;
  title: string;
  description: string | null;
  material_type: MarketingMaterialType;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  file_url: string | null;
  file_data: string | null;
  is_published: number | boolean;
  is_archived: number | boolean;
  created_by_user_id: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  services: MarketingMaterialServiceMapping[];
}

export interface CreateMarketingMaterialPayload {
  title: string;
  description?: string | null;
  material_type: MarketingMaterialType;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  file_url?: string | null;
  file_data?: string | null;
  is_published?: boolean;
  service_ids: string[];
}

export interface UpdateMarketingMaterialPayload {
  title?: string;
  description?: string | null;
  material_type?: MarketingMaterialType;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  file_url?: string | null;
  file_data?: string | null;
  is_published?: boolean;
  is_archived?: boolean;
  service_ids?: string[];
}

export interface MarketingMaterialFilters {
  service_id?: string;
  material_type?: string;
  search?: string;
  is_published?: boolean | string;
  is_archived?: boolean | string;
  page?: number;
  limit?: number;
}

// ==========================================
// SERVICE APPLICATION TYPES (PHASE 15B)
// ==========================================

export type ServiceApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACTION_REQUIRED'
  | 'REJECTED'
  | 'APPROVED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export type DocumentStatus = 'MISSING' | 'UPLOADED' | 'VERIFIED' | 'REJECTED';

export type CommissionStatus = 'PENDING' | 'RELEASED';

export interface ServiceApplicationDocument {
  id: string;
  application_id: string;
  document_name: string;
  description: string | null;
  is_required: boolean | number;
  status: DocumentStatus;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  file_url: string | null;
  file_data?: string | null;
  uploaded_at: string | null;
  uploaded_by_user_id: string | null;
  uploaded_by_name?: string | null;
  verified_at: string | null;
  verified_by_user_id: string | null;
  verified_by_name?: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceApplication {
  id: string;
  application_number: string;
  franchise_id: string;
  franchise_name?: string;
  franchise_code?: string;
  client_id: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  service_id: string;
  service_name?: string;
  service_code?: string;
  status: ServiceApplicationStatus;
  status_reason: string | null;
  custom_fields: Record<string, any> | null;
  notes: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Financial & Commission Snapshots
  service_fee_snapshot: number;
  commission_value_snapshot: number;
  commission_notes_snapshot: string | null;

  // Lifecycle
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  submitted_by_name?: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name?: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  approved_by_name?: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  completed_by_name?: string | null;

  // Assignment & Work Operations (Phase 16)
  assigned_to_user_id: string | null;
  assigned_to_name?: string | null;
  assigned_at: string | null;
  assigned_by_user_id: string | null;
  assigned_by_name?: string | null;
  assignment_notes: string | null;
  last_reassigned_at?: string | null;
  reassigned_count?: number;

  // SLA & Turnaround (Phase 16)
  sla_due_at?: string | null;
  sla_hours?: number | null;
  turnaround_days?: number | null;
  sla_remaining_hours?: number | null;
  sla_status?: SlaStatus;

  // Work Notes Tracking (Phase 16)
  work_notes_count?: number;
  latest_work_note?: string | null;
  last_work_note_at?: string | null;

  // Commission Release
  commission_status: CommissionStatus;
  commission_released_at: string | null;
  commission_released_by_user_id: string | null;
  ledger_entry_id: string | null;
  ledger_reference_id: string | null;

  // Phase 19: Efilingg & Government Filing References
  external_filing_id?: string | null;
  arn_number?: string | null;
  srn_number?: string | null;
  challan_number?: string | null;
  efilingg_status?: string | null;
  efilingg_synced_at?: string | null;
  efilingg_sync_error?: string | null;

  // Metadata
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;

  // Associated Documents
  documents?: ServiceApplicationDocument[];
}

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

export type SlaStatus = 'on_track' | 'approaching' | 'breached' | 'none';

export interface ServiceApplicationWorkNote {
  id: string;
  application_id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  note_type: 'note' | 'assignment' | 'reassignment' | 'status_change';
  note: string;
  is_internal: boolean;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface WorkQueueSummary {
  active_total: number;
  unassigned_total: number;
  assigned_total: number;
  in_progress_total: number;
  sla_approaching_total: number;
  sla_breached_total: number;
  sla_on_track_total: number;
  completed_total: number;
}

export interface WorkQueueAssigneeOption {
  id: string;
  name: string;
  email: string;
  role: string;
  active_assignments_count: number;
  pending_sla_breach_count: number;
}

export interface CreateServiceApplicationPayload {
  client_id: string;
  service_id: string;
  franchise_id?: string;
  status?: 'DRAFT' | 'SUBMITTED';
  custom_fields?: Record<string, any> | null;
  notes?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface UpdateServiceApplicationPayload {
  custom_fields?: Record<string, any> | null;
  notes?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface ServiceApplicationFilters {
  franchise_id?: string;
  client_id?: string;
  service_id?: string;
  status?: string;
  commission_status?: string;
  assigned_to_user_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ==========================================
// ADVERTISEMENT REQUESTS (PHASE 17A)
// ==========================================

export type AdvertisementRequestStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED';

export interface AdvertisementRequest {
  id: string;
  request_number: string;
  franchise_id: string;
  franchise_name?: string;
  franchise_code?: string;
  created_by_user_id: string;
  created_by_name?: string;
  created_by_email?: string;
  title: string;
  description: string;
  advertising_type: string;
  service_id: string | null;
  service_name?: string | null;
  service_code?: string | null;
  target_audience: string | null;
  target_location: string | null;
  preferred_timeline: string | null;
  notes: string | null;
  reference_details: string | null;
  status: AdvertisementRequestStatus;
  rejection_reason: string | null;
  admin_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  approved_by_user_id: string | null;
  approved_by_name?: string | null;
  approved_at: string | null;
  completed_by_user_id: string | null;
  completed_by_name?: string | null;
  completed_at: string | null;
  rejected_by_user_id: string | null;
  rejected_by_name?: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvertisementRequestHistory {
  id: string;
  request_id: string;
  author_user_id: string;
  author_name?: string;
  author_role?: string;
  action_type:
    | 'created'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'in_progress'
    | 'completed'
    | 'status_change'
    | 'admin_note';
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface AdvertisementRequestSummary {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  in_progress: number;
  completed: number;
  rejected: number;
}

export interface CreateAdvertisementRequestPayload {
  franchise_id?: string;
  title: string;
  description: string;
  advertising_type: string;
  service_id?: string | null;
  target_audience?: string | null;
  target_location?: string | null;
  preferred_timeline?: string | null;
  notes?: string | null;
  reference_details?: string | null;
}

export interface AdvertisementRequestFilters {
  franchise_id?: string;
  status?: string;
  advertising_type?: string;
  service_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'created_at' | 'updated_at' | 'title' | 'status';
  sort_order?: 'asc' | 'desc';
}

export type NotificationType =
  | 'campaign_charge'
  | 'campaign_paused'
  | 'lead_opportunity'
  | 'opportunity_expired'
  | 'lead_unassigned'
  | 'sla_approaching'
  | 'sla_breached'
  | 'system';

export interface InAppNotification {
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

export interface NotificationListResponse {
  notifications: InAppNotification[];
  total: number;
  unreadCount: number;
}

export interface BackgroundJob {
  id: string;
  job_name: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  trigger_type: 'SYSTEM' | 'MANUAL' | 'SCHEDULED';
  run_key?: string | null;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  summary?: Record<string, any> | null;
  error_message?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
}

export interface JobExecutionResult {
  jobId: string;
  jobName: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  data?: any;
  summary?: Record<string, any>;
  error?: string;
}

export interface ActiveJobLock {
  lock_name: string;
  locked_by: string;
  locked_at: string;
  expires_at: string;
}

// ==========================================
// Phase 21B: Financial Reporting & Settlement Types
// ==========================================

export interface NetworkRevenueFilterCriteria {
  startDate?: string;
  endDate?: string;
  district?: string;
  service?: string;
}

export interface NetworkRevenueKPIs {
  campaignFeeInflow: number;
  campaignChargesCount: number;
  buyLeadInflow: number;
  buyLeadCount: number;
  completedServiceFeeValue: number;
  completedServiceCount: number;
  releasedFranchiseCommissions: number;
  retainedServiceMargin: number;
  retainedMarginPercentage: number;
  totalPlatformInflow: number;
  totalNetPlatformMargin: number;
}

export interface NetworkRevenueServiceBreakdown {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  campaignFeeInflow: number;
  buyLeadInflow: number;
  completedServiceFeeValue: number;
  releasedFranchiseCommissions: number;
  retainedServiceMargin: number;
  totalRevenue: number;
}

export interface NetworkRevenueDistrictBreakdown {
  district: string;
  campaignFeeInflow: number;
  buyLeadInflow: number;
  completedServiceFeeValue: number;
  releasedFranchiseCommissions: number;
  retainedServiceMargin: number;
  totalRevenue: number;
}

export interface NetworkRevenueReport {
  campaignFeeInflow: number;
  buyLeadInflow: number;
  completedServiceFeeValue: number;
  releasedFranchiseCommissions: number;
  retainedServiceMargin: number;
  campaign_fee_inflow?: number;
  buy_lead_inflow?: number;
  completed_service_fee_value?: number;
  released_franchise_commissions?: number;
  retained_service_margin?: number;
  kpis: NetworkRevenueKPIs;
  breakdowns: {
    byService: NetworkRevenueServiceBreakdown[];
    byDistrict: NetworkRevenueDistrictBreakdown[];
  };
  filterCriteria: NetworkRevenueFilterCriteria;
  generatedAt: string;
}

export interface SettlementStatementPeriod {
  startDate: string | null;
  endDate: string | null;
}

export interface SettlementStatementSummary {
  openingBalance: number;
  earnedCommissions: number;
  campaignDeductions: number;
  buyLeadDeductions: number;
  manualAdjustments: number;
  manualCredits: number;
  manualDebits: number;
  payouts: number;
  reversals: number;
  closingBalance: number;
  netChange: number;
}

export interface SettlementStatementFranchiseInfo {
  organizationId: string;
  franchiseCode: string;
  operatingName: string;
  legalName?: string;
  city?: string;
  district?: string;
  state?: string;
  currency: string;
  currentAccountBalance: number;
}

export interface SettlementStatementEntry {
  id: string;
  date: string;
  category: string;
  entryType: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  externalReference?: string | null;
  description: string;
}

export interface SettlementStatementResult {
  openingBalance: number;
  earnedCommissions: number;
  campaignDeductions: number;
  buyLeadDeductions: number;
  manualAdjustments: number;
  payouts: number;
  closingBalance: number;
  opening_balance?: number;
  earned_commissions?: number;
  campaign_deductions?: number;
  buy_lead_deductions?: number;
  manual_adjustments?: number;
  closing_balance?: number;
  franchise: SettlementStatementFranchiseInfo;
  period: SettlementStatementPeriod;
  summary: SettlementStatementSummary;
  entries: SettlementStatementEntry[];
  totalEntriesCount: number;
  generatedAt: string;
}



