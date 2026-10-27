/**
 * Server-side Reporting Types for LBSC Platform
 */

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

// ----------------------------------------------------------------------
// Custom Report Specifications
// ----------------------------------------------------------------------
export type CustomReportDataset = 'leads' | 'franchises' | 'commission_ledger' | 'services' | 'campaigns' | 'clients';

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
  summary?: Record<string, number>;
  executedAt: string;
  executionTimeMs: number;
}

export interface SavedCustomReportModel {
  id: string;
  name: string;
  description: string | null;
  dataset: CustomReportDataset;
  selected_fields: string; // JSON array
  filter_criteria: string; // JSON object
  group_by: string | null;
  aggregations: string | null; // JSON array
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------
// Phase 21A: Network Revenue & Margin Types
// ----------------------------------------------------------------------
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

