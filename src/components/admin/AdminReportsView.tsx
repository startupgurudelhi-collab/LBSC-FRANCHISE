import React, { useState, useEffect, useMemo } from 'react';
import {
  FileBarChart2,
  Building2,
  Users2,
  Wallet,
  Briefcase,
  Filter,
  RefreshCw,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  RotateCcw,
  Code2,
  X,
  FileSpreadsheet,
  AlertCircle,
  Database,
  Sparkles,
  Download,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import { ApiClient } from '../../api';
import { CustomReportBuilder } from './CustomReportBuilder';
import { NetworkRevenueDashboardView } from './NetworkRevenueDashboardView';
import type {
  FranchiseCommissionAccountDetail,
  FranchiseApplication,
  ServiceMaster,
  LedgerEntry,
  Lead,
  Campaign,
  ReportTabType,
  ExportReadyReportData,
  FranchiseSummaryReport,
  LeadMetricsReport,
  CommissionMetricsReport,
  ServiceMetricsReport,
} from '../../types';

export const AdminReportsView: React.FC = () => {
  // Active Report Tab
  const [activeTab, setActiveTab] = useState<ReportTabType>('network_revenue');

  // Loading & State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Raw Database Records loaded via existing APIs
  const [accounts, setAccounts] = useState<FranchiseCommissionAccountDetail[]>([]);
  const [applications, setApplications] = useState<FranchiseApplication[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [franchiseFilter, setFranchiseFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [districtFilter, setDistrictFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Phase 12B - Server-Side Aggregated Reports & DB Metrics
  const [serverFranchiseReport, setServerFranchiseReport] = useState<FranchiseSummaryReport | null>(null);
  const [serverLeadReport, setServerLeadReport] = useState<LeadMetricsReport | null>(null);
  const [serverCommissionReport, setServerCommissionReport] = useState<CommissionMetricsReport | null>(null);
  const [serverServiceReport, setServerServiceReport] = useState<ServiceMetricsReport | null>(null);
  const [serverAggregating, setServerAggregating] = useState<boolean>(false);

  // Export structure preview modal
  const [showExportModal, setShowExportModal] = useState(false);

  // Load all foundational backend records
  const loadReportData = async () => {
    try {
      setError(null);
      const [accRes, appRes, srvRes, ledRes, leadRes, campRes] = await Promise.all([
        ApiClient.getCommissionAccounts(),
        ApiClient.getApplications(),
        ApiClient.getServices(),
        ApiClient.getCommissionLedger({ limit: 200 }),
        ApiClient.getLeads({ limit: 100 }),
        ApiClient.getCampaigns(),
      ]);

      if (accRes.success) setAccounts(Array.isArray(accRes.data) ? accRes.data : []);
      if (appRes.success) setApplications(Array.isArray(appRes.data) ? appRes.data : []);
      if (srvRes.success) setServices(Array.isArray(srvRes.data) ? srvRes.data : []);
      if (ledRes.success) setLedgerEntries(Array.isArray(ledRes.data) ? ledRes.data : []);
      if (leadRes.success) setLeads(Array.isArray(leadRes.data) ? leadRes.data : (leadRes.data?.leads || []));
      if (campRes.success) setCampaigns(Array.isArray(campRes.data) ? campRes.data : []);
    } catch (err: any) {
      setError(err.message || 'Error loading report dataset from backend APIs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, []);

  // Phase 12B: Load Server-Side Aggregated Reports whenever filters or activeTab changes
  const loadServerReports = async () => {
    if (activeTab === 'custom') return;
    try {
      setServerAggregating(true);
      const queryFilters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        franchise: franchiseFilter !== 'all' ? franchiseFilter : undefined,
        service: serviceFilter !== 'all' ? serviceFilter : undefined,
        city: cityFilter || undefined,
        district: districtFilter || undefined,
        state: stateFilter || undefined,
        search: searchQuery || undefined,
      };

      if (activeTab === 'franchise') {
        const res = await ApiClient.getFranchiseSummaryReport(queryFilters);
        if (res.success && res.data) setServerFranchiseReport(res.data);
      } else if (activeTab === 'leads') {
        const res = await ApiClient.getLeadMetricsReport(queryFilters);
        if (res.success && res.data) setServerLeadReport(res.data);
      } else if (activeTab === 'commissions') {
        const res = await ApiClient.getCommissionMetricsReport(queryFilters);
        if (res.success && res.data) setServerCommissionReport(res.data);
      } else if (activeTab === 'services') {
        const res = await ApiClient.getServiceMetricsReport(queryFilters);
        if (res.success && res.data) setServerServiceReport(res.data);
      }
    } catch (err: any) {
      console.warn('Failed to load server-side aggregated report:', err);
    } finally {
      setServerAggregating(false);
    }
  };

  useEffect(() => {
    loadServerReports();
  }, [
    activeTab,
    startDate,
    endDate,
    statusFilter,
    franchiseFilter,
    serviceFilter,
    cityFilter,
    districtFilter,
    stateFilter,
    searchQuery,
  ]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadReportData();
    loadServerReports();
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
    setFranchiseFilter('all');
    setServiceFilter('all');
    setCityFilter('');
    setDistrictFilter('');
    setStateFilter('');
    setSearchQuery('');
  };

  // Quick Date Range Presets
  const setQuickDatePreset = (preset: 'today' | '7d' | '30d' | 'month' | 'all') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (preset === 'today') {
      const todayStr = formatDate(today);
      setStartDate(todayStr);
      setEndDate(todayStr);
      return;
    }

    if (preset === '7d') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setStartDate(formatDate(past));
      setEndDate(formatDate(today));
      return;
    }

    if (preset === '30d') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setStartDate(formatDate(past));
      setEndDate(formatDate(today));
      return;
    }

    if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(today));
      return;
    }
  };

  // Helper to check date range inclusion
  const isDateInRange = (dateStr?: string | null) => {
    if (!dateStr) return true;
    const target = new Date(dateStr).getTime();
    if (isNaN(target)) return true;

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00').getTime();
      if (target < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59').getTime();
      if (target > end) return false;
    }
    return true;
  };

  // Map application location details by organization_id
  const appByOrgId = useMemo(() => {
    const map = new Map<string, FranchiseApplication>();
    for (const app of applications) {
      if (app.organization_id) {
        map.set(app.organization_id, app);
      }
    }
    return map;
  }, [applications]);

  // Distinct Filter Option Lists
  const availableFranchises = useMemo(() => {
    return accounts.map((acc) => ({
      id: acc.organization_id,
      name: acc.operating_name || acc.franchise_code || acc.organization_id,
      code: acc.franchise_code || '',
    }));
  }, [accounts]);

  // ----------------------------------------------------
  // 1. Franchise-wise Report Data Processing
  // ----------------------------------------------------
  const filteredFranchises = useMemo(() => {
    return accounts.filter((acc) => {
      const app = appByOrgId.get(acc.organization_id);

      // Date range filter based on account creation
      if (!isDateInRange(acc.created_at)) return false;

      // Status filter
      if (statusFilter !== 'all') {
        const currentStatus = app?.status || (acc.current_balance >= 0 ? 'active' : 'inactive');
        if (currentStatus.toLowerCase() !== statusFilter.toLowerCase()) return false;
      }

      // Franchise specific filter
      if (franchiseFilter !== 'all' && acc.organization_id !== franchiseFilter) {
        return false;
      }

      // Location filters
      const city = app?.city || '';
      const district = app?.district || '';
      const state = app?.state || '';

      if (cityFilter && !city.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (districtFilter && !district.toLowerCase().includes(districtFilter.toLowerCase())) return false;
      if (stateFilter && !state.toLowerCase().includes(stateFilter.toLowerCase())) return false;

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = (acc.operating_name || '').toLowerCase().includes(query);
        const matchCode = (acc.franchise_code || '').toLowerCase().includes(query);
        const matchCity = city.toLowerCase().includes(query);
        const matchDistrict = district.toLowerCase().includes(query);
        if (!matchName && !matchCode && !matchCity && !matchDistrict) return false;
      }

      return true;
    });
  }, [
    accounts,
    appByOrgId,
    startDate,
    endDate,
    statusFilter,
    franchiseFilter,
    cityFilter,
    districtFilter,
    stateFilter,
    searchQuery,
  ]);

  // ----------------------------------------------------
  // 2. Lead Report Data Processing
  // ----------------------------------------------------
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Date range
      if (!isDateInRange(lead.created_at)) return false;

      // Status
      if (statusFilter !== 'all' && lead.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Franchise
      if (franchiseFilter !== 'all' && lead.assigned_franchise_id !== franchiseFilter) {
        return false;
      }

      // Service
      if (serviceFilter !== 'all' && lead.service_id !== serviceFilter) {
        return false;
      }

      // Location
      if (cityFilter && !(lead.city || '').toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (districtFilter && !(lead.district || '').toLowerCase().includes(districtFilter.toLowerCase()))
        return false;
      if (stateFilter && !(lead.state || '').toLowerCase().includes(stateFilter.toLowerCase())) return false;

      // Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchNum = lead.lead_number.toLowerCase().includes(query);
        const matchName = lead.customer_name.toLowerCase().includes(query);
        const matchPhone = lead.customer_phone.toLowerCase().includes(query);
        const matchService = (lead.service_name || '').toLowerCase().includes(query);
        if (!matchNum && !matchName && !matchPhone && !matchService) return false;
      }

      return true;
    });
  }, [
    leads,
    startDate,
    endDate,
    statusFilter,
    franchiseFilter,
    serviceFilter,
    cityFilter,
    districtFilter,
    stateFilter,
    searchQuery,
  ]);

  // ----------------------------------------------------
  // 3. Commission / Revenue Report Data Processing
  // ----------------------------------------------------
  const filteredLedger = useMemo(() => {
    return ledgerEntries.filter((entry) => {
      // Date range
      if (!isDateInRange(entry.created_at)) return false;

      // Status / Entry Type (credit or debit)
      if (statusFilter !== 'all' && entry.entry_type.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Franchise
      if (franchiseFilter !== 'all' && entry.organization_id !== franchiseFilter) {
        return false;
      }

      // Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchRef = entry.reference_id.toLowerCase().includes(query);
        const matchDesc = (entry.description || '').toLowerCase().includes(query);
        const matchCat = (entry.category || '').toLowerCase().includes(query);
        const app = appByOrgId.get(entry.organization_id);
        const matchOrg = (app?.business_name || entry.organization_id).toLowerCase().includes(query);
        if (!matchRef && !matchDesc && !matchCat && !matchOrg) return false;
      }

      return true;
    });
  }, [ledgerEntries, startDate, endDate, statusFilter, franchiseFilter, searchQuery, appByOrgId]);

  // ----------------------------------------------------
  // 4. Applied Service Report Data Processing
  // ----------------------------------------------------
  const filteredServices = useMemo(() => {
    return services.filter((srv) => {
      // Status
      if (statusFilter !== 'all') {
        const isActive = Boolean(srv.is_active);
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'inactive' && isActive) return false;
      }

      // Service filter
      if (serviceFilter !== 'all' && srv.id !== serviceFilter) {
        return false;
      }

      // Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchCode = srv.code.toLowerCase().includes(query);
        const matchName = srv.name.toLowerCase().includes(query);
        const matchCat = (srv.category_name || '').toLowerCase().includes(query);
        if (!matchCode && !matchName && !matchCat) return false;
      }

      return true;
    });
  }, [services, statusFilter, serviceFilter, searchQuery]);

  // ----------------------------------------------------
  // Summary KPI Calculations (Phase 12B: Server-Side DB Aggregations)
  // ----------------------------------------------------
  const franchiseKPIs = useMemo(() => {
    if (serverFranchiseReport?.kpis) {
      return serverFranchiseReport.kpis;
    }
    const total = filteredFranchises.length;
    const active = filteredFranchises.filter((acc) => {
      const app = appByOrgId.get(acc.organization_id);
      return app?.status === 'active' || acc.current_balance >= 0;
    }).length;
    const totalBalance = filteredFranchises.reduce((sum, f) => sum + (f.current_balance || 0), 0);
    const activeCampaigns = campaigns.filter(
      (c) => c.status === 'active' && filteredFranchises.some((f) => f.organization_id === c.organization_id)
    ).length;

    return {
      total,
      active,
      totalBalance,
      activeCampaigns,
    };
  }, [serverFranchiseReport, filteredFranchises, appByOrgId, campaigns]);

  const leadKPIs = useMemo(() => {
    if (serverLeadReport?.kpis) {
      return serverLeadReport.kpis;
    }
    const total = filteredLeads.length;
    const offered = filteredLeads.filter((l) => l.status === 'offered').length;
    const assigned = filteredLeads.filter((l) => l.status === 'assigned').length;
    const ownLeadCenter = filteredLeads.filter((l) => l.status === 'own_lead_center').length;
    const grossValue = filteredLeads.reduce((sum, l) => sum + (l.service_fee || 0), 0);

    return {
      total,
      offered,
      assigned,
      ownLeadCenter,
      grossValue,
    };
  }, [serverLeadReport, filteredLeads]);

  const commissionKPIs = useMemo(() => {
    if (serverCommissionReport?.kpis) {
      return serverCommissionReport.kpis;
    }
    const totalEntries = filteredLedger.length;
    const totalCredits = filteredLedger
      .filter((e) => e.entry_type === 'credit')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalDebits = filteredLedger
      .filter((e) => e.entry_type === 'debit')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const netBalance = totalCredits - totalDebits;

    return {
      totalEntries,
      totalCredits,
      totalDebits,
      netBalance,
    };
  }, [serverCommissionReport, filteredLedger]);

  const serviceKPIs = useMemo(() => {
    if (serverServiceReport?.kpis) {
      return serverServiceReport.kpis;
    }
    const totalCatalog = filteredServices.length;
    const activeServices = filteredServices.filter((s) => Boolean(s.is_active)).length;
    // Count associated leads for filtered services
    const matchedServiceIds = new Set(filteredServices.map((s) => s.id));
    const serviceLeads = leads.filter(
      (l) => matchedServiceIds.has(l.service_id) && isDateInRange(l.created_at)
    );
    const totalDemands = serviceLeads.length;
    const grossDemandFee = serviceLeads.reduce((sum, l) => sum + (l.service_fee || 0), 0);
    const avgFee =
      totalCatalog > 0
        ? Math.round(filteredServices.reduce((sum, s) => sum + (s.service_fee || 0), 0) / totalCatalog)
        : 0;

    return {
      totalCatalog,
      activeServices,
      totalDemands,
      grossDemandFee,
      avgFee,
    };
  }, [serverServiceReport, filteredServices, leads, startDate, endDate]);

  // Phase 12B: CSV Export Downloader
  const downloadExportCsv = () => {
    if (!exportPayload || exportPayload.rows.length === 0) return;
    const headers = exportPayload.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
    const rows = exportPayload.rows.map((row) =>
      row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lbsc_${exportPayload.reportType}_report_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ----------------------------------------------------
  // Export-Ready Data Structure Constructor
  // ----------------------------------------------------
  const exportPayload: ExportReadyReportData = useMemo(() => {
    const generatedAt = new Date().toISOString();
    const generatedBy = 'Super Administrator (Master HQ)';
    const filtersApplied: Record<string, string> = {
      tab: activeTab,
      startDate: startDate || 'All',
      endDate: endDate || 'All',
      status: statusFilter,
      franchise: franchiseFilter,
      service: serviceFilter,
      city: cityFilter || 'All',
      district: districtFilter || 'All',
      state: stateFilter || 'All',
      search: searchQuery || 'None',
    };

    if (activeTab === 'franchise') {
      const columns = [
        'Franchise Code',
        'Business Name',
        'District',
        'State',
        'PIN',
        'Status',
        'Current Balance (₹)',
        'Active Campaigns',
        'Assigned Leads',
      ];
      const rows = filteredFranchises.map((f) => {
        const app = appByOrgId.get(f.organization_id);
        const assignedLeadsCount = leads.filter((l) => l.assigned_franchise_id === f.organization_id).length;
        const activeCamps = campaigns.filter(
          (c) => c.organization_id === f.organization_id && c.status === 'active'
        ).length;
        return [
          f.franchise_code || '-',
          f.operating_name || app?.business_name || f.organization_id,
          app?.district || '-',
          app?.state || '-',
          app?.pin || '-',
          app?.status || 'active',
          f.current_balance || 0,
          activeCamps,
          assignedLeadsCount,
        ];
      });

      return {
        reportType: 'franchise',
        reportTitle: 'Franchise-wise Performance & Balance Report',
        generatedAt,
        generatedBy,
        filtersApplied,
        summaryMetrics: {
          totalFranchises: franchiseKPIs.total,
          activeFranchises: franchiseKPIs.active,
          totalNetworkBalance: `₹${franchiseKPIs.totalBalance.toLocaleString('en-IN')}`,
          activeCampaigns: franchiseKPIs.activeCampaigns,
        },
        columns,
        rows,
        rowCount: rows.length,
      };
    }

    if (activeTab === 'leads') {
      const columns = [
        'Lead Number',
        'Date & Time',
        'Customer Name',
        'Phone',
        'Service Code',
        'Service Name',
        'Statutory Fee (₹)',
        'City',
        'District',
        'State',
        'Source',
        'Status',
        'Assigned Franchise',
      ];
      const rows = filteredLeads.map((l) => [
        l.lead_number,
        l.created_at || '-',
        l.customer_name,
        l.customer_phone,
        l.service_code || '-',
        l.service_name || '-',
        l.service_fee || 0,
        l.city,
        l.district,
        l.state,
        l.source,
        l.status,
        l.franchise_name || '-',
      ]);

      return {
        reportType: 'leads',
        reportTitle: 'Lead Ingestion, Routing & Conversion Report',
        generatedAt,
        generatedBy,
        filtersApplied,
        summaryMetrics: {
          totalLeads: leadKPIs.total,
          offeredLeads: leadKPIs.offered,
          assignedLeads: leadKPIs.assigned,
          ownLeadCenter: leadKPIs.ownLeadCenter,
          grossLeadValue: `₹${leadKPIs.grossValue.toLocaleString('en-IN')}`,
        },
        columns,
        rows,
        rowCount: rows.length,
      };
    }

    if (activeTab === 'commissions') {
      const columns = [
        'Entry ID',
        'Timestamp',
        'Franchise / Org',
        'Entry Type',
        'Category',
        'Amount (₹)',
        'Balance After (₹)',
        'Reference ID',
        'Description',
      ];
      const rows = filteredLedger.map((e) => {
        const app = appByOrgId.get(e.organization_id);
        const orgName = app?.business_name || e.organization_id;
        return [
          e.id,
          e.created_at || '-',
          orgName,
          e.entry_type.toUpperCase(),
          e.category,
          e.amount,
          e.balance_after,
          e.reference_id,
          e.description || '-',
        ];
      });

      return {
        reportType: 'commissions',
        reportTitle: 'Commission Ledger & Revenue Movement Report',
        generatedAt,
        generatedBy,
        filtersApplied,
        summaryMetrics: {
          totalEntries: commissionKPIs.totalEntries,
          totalCredits: `₹${commissionKPIs.totalCredits.toLocaleString('en-IN')}`,
          totalDebits: `₹${commissionKPIs.totalDebits.toLocaleString('en-IN')}`,
          netMovement: `₹${commissionKPIs.netBalance.toLocaleString('en-IN')}`,
        },
        columns,
        rows,
        rowCount: rows.length,
      };
    }

    // Applied Service Report
    const columns = [
      'Service Code',
      'Service Name',
      'Category',
      'Service Fee (₹)',
      'LBSC Commission (₹)',
      'Turnaround (Days)',
      'SLA (Hours)',
      'Leads Demanded',
      'Assigned Volume',
      'Gross Demand (₹)',
      'Status',
    ];
    const rows = filteredServices.map((s) => {
      const matchedLeads = leads.filter((l) => l.service_id === s.id && isDateInRange(l.created_at));
      const assignedCount = matchedLeads.filter((l) => l.status === 'assigned').length;
      const gross = matchedLeads.length * (s.service_fee || 0);

      return [
        s.code,
        s.name,
        s.category_name || s.category_id || '-',
        s.service_fee || 0,
        s.commission_value || 0,
        s.turnaround_days || 3,
        s.sla_hours || 72,
        matchedLeads.length,
        assignedCount,
        gross,
        s.is_active ? 'Active' : 'Inactive',
      ];
    });

    return {
      reportType: 'services',
      reportTitle: 'Applied Statutory Services Performance Report',
      generatedAt,
      generatedBy,
      filtersApplied,
      summaryMetrics: {
        totalCatalog: serviceKPIs.totalCatalog,
        activeServices: serviceKPIs.activeServices,
        totalDemands: serviceKPIs.totalDemands,
        grossDemandFee: `₹${serviceKPIs.grossDemandFee.toLocaleString('en-IN')}`,
        avgFee: `₹${serviceKPIs.avgFee.toLocaleString('en-IN')}`,
      },
      columns,
      rows,
      rowCount: rows.length,
    };
  }, [
    activeTab,
    startDate,
    endDate,
    statusFilter,
    franchiseFilter,
    serviceFilter,
    cityFilter,
    districtFilter,
    stateFilter,
    searchQuery,
    filteredFranchises,
    filteredLeads,
    filteredLedger,
    filteredServices,
    appByOrgId,
    leads,
    campaigns,
    franchiseKPIs,
    leadKPIs,
    commissionKPIs,
    serviceKPIs,
  ]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-900 text-white shadow-xs">
              <FileBarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Super Admin Reports & Analytics
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Comprehensive operational ledger, franchise velocity, lead conversions, and statutory service analytics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-60"
            title="Refresh from backend"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {activeTab !== 'network_revenue' && (
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-2xs transition-colors"
              title="View Export-Ready Structured Dataset"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-950" />
              <span>Export Ready Structure</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={loadReportData} className="underline font-semibold hover:text-rose-950">
            Retry
          </button>
        </div>
      )}

      {/* Report Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-2 md:space-x-4 overflow-x-auto pb-1" aria-label="Report Views">
          <button
            onClick={() => {
              setActiveTab('network_revenue');
            }}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'network_revenue'
                ? 'border-slate-900 text-slate-900 bg-slate-100/60'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-700" />
            <span>Network Revenue & Margins</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 font-bold border border-emerald-200">
              Corporate
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('franchise');
              setStatusFilter('all');
            }}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'franchise'
                ? 'border-slate-900 text-slate-900 bg-slate-100/60'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Franchise-wise Report</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 font-mono text-slate-700">
              {filteredFranchises.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('leads');
              setStatusFilter('all');
            }}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'leads'
                ? 'border-slate-900 text-slate-900 bg-slate-100/60'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>Lead Report</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 font-mono text-slate-700">
              {filteredLeads.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('commissions');
              setStatusFilter('all');
            }}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'commissions'
                ? 'border-slate-900 text-slate-900 bg-slate-100/60'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Commission / Revenue Report</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 font-mono text-slate-700">
              {filteredLedger.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('services');
              setStatusFilter('all');
            }}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'services'
                ? 'border-slate-900 text-slate-900 bg-slate-100/60'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Applied Service Report</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 font-mono text-slate-700">
              {filteredServices.length}
            </span>
          </button>

          {/* Phase 12B: Custom Report Studio Tab */}
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'custom'
                ? 'border-slate-900 text-slate-900 bg-slate-100/60'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-600" />
            <span>Custom Report Studio</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200">
              Phase 12B
            </span>
          </button>
        </nav>
      </div>

      {/* Network Revenue Dashboard (Phase 21B) */}
      {activeTab === 'network_revenue' && (
        <NetworkRevenueDashboardView />
      )}

      {/* When on Custom Report Tab, Render CustomReportBuilder */}
      {activeTab === 'custom' && (
        <CustomReportBuilder
          franchisesList={availableFranchises}
          servicesList={services.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}

      {/* Comprehensive Filter Controls & Standard Reports (Rendered when in standard report views) */}
      {activeTab !== 'custom' && activeTab !== 'network_revenue' && (
        <>
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
            <Filter className="w-3.5 h-3.5 text-amber-500" />
            <span>Report Filters</span>
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[11px] font-medium text-slate-400 mr-1 hidden sm:inline">Range:</span>
            <button
              onClick={() => setQuickDatePreset('all')}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-100 text-slate-600 border border-slate-200"
            >
              All Time
            </button>
            <button
              onClick={() => setQuickDatePreset('today')}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-100 text-slate-600 border border-slate-200"
            >
              Today
            </button>
            <button
              onClick={() => setQuickDatePreset('7d')}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-100 text-slate-600 border border-slate-200"
            >
              7 Days
            </button>
            <button
              onClick={() => setQuickDatePreset('30d')}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-100 text-slate-600 border border-slate-200"
            >
              30 Days
            </button>
            <button
              onClick={() => setQuickDatePreset('month')}
              className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-100 text-slate-600 border border-slate-200"
            >
              This Month
            </button>
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 ml-2 px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 rounded"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Filter Input Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1 text-xs">
          {/* Search Query */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Search Keywords</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search name, code, phone, ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date</label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date</label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Dynamic Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50 font-medium"
            >
              <option value="all">All Statuses</option>
              {activeTab === 'franchise' && (
                <>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                  <option value="pending">Pending</option>
                  <option value="screening">Screening</option>
                </>
              )}
              {activeTab === 'leads' && (
                <>
                  <option value="new">New Ingestion</option>
                  <option value="offered">Offered / In Transit</option>
                  <option value="assigned">Assigned to Partner</option>
                  <option value="own_lead_center">Own Lead Center</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </>
              )}
              {activeTab === 'commissions' && (
                <>
                  <option value="credit">Credit (Earnings & Additions)</option>
                  <option value="debit">Debit (Deductions & Charges)</option>
                </>
              )}
              {activeTab === 'services' && (
                <>
                  <option value="active">Active Catalog Services</option>
                  <option value="inactive">Inactive Services</option>
                </>
              )}
            </select>
          </div>

          {/* Franchise Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Franchise</label>
            <select
              value={franchiseFilter}
              onChange={(e) => setFranchiseFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50 font-medium truncate"
            >
              <option value="all">All Franchises</option>
              {availableFranchises.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code || f.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Geo & Service Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 border-t border-slate-100/80 text-xs">
          {/* Service Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Service Filter</label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50 truncate"
            >
              <option value="all">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">City</label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. Salem"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50"
              />
            </div>
          </div>

          {/* District */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">District</label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. Salem, Coimbatore"
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50"
              />
            </div>
          </div>

          {/* State */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">State</label>
            <input
              type="text"
              placeholder="e.g. Tamil Nadu"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50/50"
            />
          </div>
        </div>
      </div>

      {/* DB Aggregation Status Banner */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-semibold text-slate-800">
            Calculations: Database-Level Aggregated
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            (SQL COUNT / SUM / GROUP BY)
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {serverAggregating ? (
            <span className="flex items-center gap-1 text-amber-700 font-medium">
              <RefreshCw className="w-3 h-3 animate-spin" /> Aggregating...
            </span>
          ) : (
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Live DB Sync
            </span>
          )}
        </div>
      </div>

      {/* Summary KPI Cards tailored to active report tab */}
      {activeTab === 'franchise' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Franchises In Scope</span>
              <Building2 className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{franchiseKPIs.total}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">
              {franchiseKPIs.active} operating actively
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Active Operational</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{franchiseKPIs.active}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Ready for automated lead routing</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Net Balance</span>
              <Wallet className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
              ₹{franchiseKPIs.totalBalance.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Across filtered accounts</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Active Ad Campaigns</span>
              <ArrowUpRight className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
              {franchiseKPIs.activeCampaigns}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Currently serving territory leads</p>
          </div>
        </div>
      )}

      {activeTab === 'leads' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Total Ingested Leads</span>
            <p className="text-2xl font-bold text-slate-900 mt-2">{leadKPIs.total}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Intake records in scope</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Offered / In Transit</span>
            <p className="text-2xl font-bold text-amber-600 mt-2 font-mono">{leadKPIs.offered}</p>
            <p className="text-[11px] text-amber-700 font-medium mt-1">1-hr acceptance timer active</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Assigned to Partner</span>
            <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">{leadKPIs.assigned}</p>
            <p className="text-[11px] text-emerald-700 font-medium mt-1">Accepted by territory campaigns</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Own Lead Center</span>
            <p className="text-2xl font-bold text-indigo-600 mt-2 font-mono">{leadKPIs.ownLeadCenter}</p>
            <p className="text-[11px] text-indigo-700 font-medium mt-1">Available for direct purchase</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Gross Statutory Demand</span>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
              ₹{leadKPIs.grossValue.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Total customer fee value</p>
          </div>
        </div>
      )}

      {activeTab === 'commissions' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Ledger Transactions</span>
            <p className="text-2xl font-bold text-slate-900 mt-2">{commissionKPIs.totalEntries}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Immutable double-entry events</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Commissions Credited</span>
            <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">
              ₹{commissionKPIs.totalCredits.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium mt-1">Partner earnings & adjustments</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Campaign / Debit Charges</span>
            <p className="text-2xl font-bold text-rose-600 mt-2 font-mono">
              ₹{commissionKPIs.totalDebits.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-rose-700 font-medium mt-1">Daily ₹100 charges & debit memos</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Net Ledger Movement</span>
            <p
              className={`text-2xl font-bold mt-2 font-mono ${
                commissionKPIs.netBalance >= 0 ? 'text-slate-900' : 'text-rose-600'
              }`}
            >
              ₹{commissionKPIs.netBalance.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Credits less system deductions</p>
          </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Statutory Catalog</span>
            <p className="text-2xl font-bold text-slate-900 mt-2">{serviceKPIs.totalCatalog}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Configured service masters</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Active Services</span>
            <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">
              {serviceKPIs.activeServices}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium mt-1">Available for campaign subscription</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Total Client Demands</span>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">{serviceKPIs.totalDemands}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Leads requesting these services</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Gross Service Demand</span>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
              ₹{serviceKPIs.grossDemandFee.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Estimated network intake fee</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Avg. Statutory Fee</span>
            <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
              ₹{serviceKPIs.avgFee.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Standard tariff across catalog</p>
          </div>
        </div>
      )}

      {/* Tabular Report Views */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
        {/* Table Title Bar */}
        <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              {exportPayload.reportTitle}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-medium text-slate-500">
              Showing {exportPayload.rowCount} record{exportPayload.rowCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Generated: {new Date().toLocaleTimeString('en-IN')}
          </div>
        </div>

        {/* Dynamic Table Body */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400" />
            <p className="text-xs font-medium">Aggregating database records across network...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* 1. Franchise-wise Table */}
            {activeTab === 'franchise' && (
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Code & Name</th>
                    <th className="px-4 py-3">Territory / Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Commission Balance</th>
                    <th className="px-4 py-3 text-center">Active Campaigns</th>
                    <th className="px-4 py-3 text-center">Assigned Leads</th>
                    <th className="px-4 py-3 text-right">Account Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredFranchises.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No franchise records match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFranchises.map((f) => {
                      const app = appByOrgId.get(f.organization_id);
                      const status = app?.status || (f.current_balance >= 0 ? 'active' : 'inactive');
                      const activeCamps = campaigns.filter(
                        (c) => c.organization_id === f.organization_id && c.status === 'active'
                      ).length;
                      const assignedLeadsCount = leads.filter(
                        (l) => l.assigned_franchise_id === f.organization_id
                      ).length;

                      return (
                        <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-[11px] font-bold text-slate-700 block">
                              {f.franchise_code || f.organization_id.slice(0, 10)}
                            </span>
                            <span className="font-semibold text-slate-900 block">
                              {f.operating_name || app?.business_name || 'Franchise Partner'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-slate-800 font-medium block">
                              {app?.district || app?.city || 'Salem'}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {app?.state || 'Tamil Nadu'} {app?.pin ? `• ${app.pin}` : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : status === 'deactivated'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              ₹{(f.current_balance || 0).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-semibold text-slate-800">
                            {activeCamps}
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-semibold text-slate-800">
                            {assignedLeadsCount}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-500 font-mono">
                            {f.created_at ? f.created_at.slice(0, 10) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* 2. Lead Report Table */}
            {activeTab === 'leads' && (
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Lead # / Date</th>
                    <th className="px-4 py-3">Customer Information</th>
                    <th className="px-4 py-3">Service Requested</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned Partner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No lead records match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-slate-900 block">{l.lead_number}</span>
                          <span className="text-[11px] text-slate-400 font-mono block">
                            {l.created_at ? l.created_at.replace('T', ' ').slice(0, 16) : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900 block">{l.customer_name}</span>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            {l.customer_phone}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800 block">
                            {l.service_name || l.service_code || 'Statutory Service'}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-emerald-700 block">
                            ₹{l.service_fee || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-800 font-medium block">{l.city}</span>
                          <span className="text-[11px] text-slate-400 block">
                            {l.district}, {l.state}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase tracking-tight">
                            {l.source}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-tight ${
                              l.status === 'assigned'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : l.status === 'offered'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : l.status === 'own_lead_center'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {l.franchise_name || (
                            <span className="text-slate-400 font-normal">Unassigned</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 3. Commission / Revenue Table */}
            {activeTab === 'commissions' && (
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Reference / Date</th>
                    <th className="px-4 py-3">Franchise Account</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Running Balance</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No ledger transactions match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((e) => {
                      const app = appByOrgId.get(e.organization_id);
                      const isCredit = e.entry_type === 'credit';

                      return (
                        <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-slate-900 block">{e.reference_id}</span>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              {e.created_at ? e.created_at.slice(0, 16).replace('T', ' ') : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900 block">
                              {app?.business_name || e.organization_id}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              {e.organization_id}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isCredit
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {isCredit ? (
                                <ArrowDownLeft className="w-3 h-3" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3" />
                              )}
                              {e.entry_type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {e.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-sm">
                            <span className={isCredit ? 'text-emerald-700' : 'text-rose-700'}>
                              {isCredit ? '+' : '-'}₹{(e.amount || 0).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                            ₹{(e.balance_after || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-[11px] max-w-xs truncate">
                            {e.description || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* 4. Applied Service Table */}
            {activeTab === 'services' && (
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Service Code & Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Statutory Fee</th>
                    <th className="px-4 py-3 text-right">LBSC Commission</th>
                    <th className="px-4 py-3 text-center">Processing SLA</th>
                    <th className="px-4 py-3 text-center">Leads Demanded</th>
                    <th className="px-4 py-3 text-right">Est. Demand Volume</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No service masters match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredServices.map((s) => {
                      const matchedLeads = leads.filter(
                        (l) => l.service_id === s.id && isDateInRange(l.created_at)
                      );
                      const grossVolume = matchedLeads.length * (s.service_fee || 0);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-[11px] font-bold text-amber-700 block">
                              {s.code}
                            </span>
                            <span className="font-semibold text-slate-900 block">{s.name}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-medium">
                            {s.category_name || s.category_id}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            ₹{(s.service_fee || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                            ₹{(s.commission_value || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 font-medium">
                            {s.turnaround_days || 3} days ({s.sla_hours || 72}h SLA)
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-900">
                            {matchedLeads.length}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            ₹{grossVolume.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                s.is_active
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {s.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {/* Export-Ready Data Structure Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    Export-Ready Structured Payload Preview
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Standardized pre-compiled data matrix ready for downstream CSV / Excel generation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Summary of Export Schema */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Report Type</span>
                  <span className="font-semibold text-slate-900 uppercase">{exportPayload.reportType}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Rows In Payload</span>
                  <span className="font-mono font-bold text-slate-900">{exportPayload.rowCount} items</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Columns Defined</span>
                  <span className="font-mono font-bold text-slate-900">{exportPayload.columns.length} columns</span>
                </div>
              </div>

              {/* Column Layout */}
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block mb-1.5">
                  Pre-Structured Schema Headers:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {exportPayload.columns.map((col, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* JSON Structure Inspector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Compiled Export Matrix (JSON Inspection):
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Phase 12A Foundation Architecture
                  </span>
                </div>
                <pre className="bg-slate-950 text-emerald-400 p-3.5 rounded-lg text-[11px] font-mono overflow-x-auto max-h-64 select-all border border-slate-800">
                  {JSON.stringify(
                    {
                      reportType: exportPayload.reportType,
                      reportTitle: exportPayload.reportTitle,
                      generatedAt: exportPayload.generatedAt,
                      generatedBy: exportPayload.generatedBy,
                      filtersApplied: exportPayload.filtersApplied,
                      summaryMetrics: exportPayload.summaryMetrics,
                      rowCount: exportPayload.rowCount,
                      sampleRows: exportPayload.rows.slice(0, 3),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                Export engine configured. File download triggers deferred per Phase 12A specifications.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={downloadExportCsv}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-2xs transition-colors"
                  title="Download compiled CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
