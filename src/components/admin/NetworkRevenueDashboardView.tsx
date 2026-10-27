import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Briefcase,
  Layers,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  Building2,
  Printer,
  Download,
  ShieldCheck,
  Percent,
  Coins,
  ChevronRight,
  PieChart,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type {
  NetworkRevenueReport,
  ServiceMaster,
} from '../../types';

interface NetworkRevenueDashboardViewProps {
  onRefresh?: () => void;
}

export const NetworkRevenueDashboardView: React.FC<NetworkRevenueDashboardViewProps> = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [districtFilter, setDistrictFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [searchTableQuery, setSearchTableQuery] = useState<string>('');
  const [breakdownView, setBreakdownView] = useState<'service' | 'district'>('service');

  // Loaded Data
  const [reportData, setReportData] = useState<NetworkRevenueReport | null>(null);
  const [catalogServices, setCatalogServices] = useState<ServiceMaster[]>([]);

  // Load report data
  const loadReport = async () => {
    try {
      setError(null);
      const [res, svcRes] = await Promise.all([
        ApiClient.getNetworkRevenue({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          district: districtFilter || undefined,
          service: serviceFilter || undefined,
        }),
        ApiClient.getServices().catch(() => ({ data: [] })),
      ]);

      if (res.success && res.data) {
        setReportData(res.data);
      } else {
        throw new Error('Failed to load network revenue data');
      }

      if (svcRes?.data) {
        setCatalogServices(svcRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching network revenue data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [startDate, endDate, districtFilter, serviceFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadReport();
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setDistrictFilter('');
    setServiceFilter('');
  };

  // Quick Date Range Presets
  const applyPreset = (preset: 'all' | 'this_month' | 'last_month' | 'ytd') => {
    const now = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      setStartDate(`${year}-${month}-01`);
      setEndDate(now.toISOString().split('T')[0]);
      return;
    }
    if (preset === 'last_month') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonthDate.getFullYear();
      const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
      setStartDate(`${year}-${month}-01`);
      setEndDate(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
      return;
    }
    if (preset === 'ytd') {
      const year = now.getFullYear();
      setStartDate(`${year}-01-01`);
      setEndDate(now.toISOString().split('T')[0]);
      return;
    }
  };

  const kpis = reportData?.kpis;

  // Filtered breakdown rows
  const filteredServices = useMemo(() => {
    if (!reportData?.breakdowns?.byService) return [];
    if (!searchTableQuery.trim()) return reportData.breakdowns.byService;
    const q = searchTableQuery.toLowerCase();
    return reportData.breakdowns.byService.filter(
      (s) =>
        s.serviceName.toLowerCase().includes(q) ||
        s.serviceCode.toLowerCase().includes(q)
    );
  }, [reportData, searchTableQuery]);

  const filteredDistricts = useMemo(() => {
    if (!reportData?.breakdowns?.byDistrict) return [];
    if (!searchTableQuery.trim()) return reportData.breakdowns.byDistrict;
    const q = searchTableQuery.toLowerCase();
    return reportData.breakdowns.byDistrict.filter((d) =>
      d.district.toLowerCase().includes(q)
    );
  }, [reportData, searchTableQuery]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!reportData) return;
    const rows =
      breakdownView === 'service'
        ? filteredServices.map((s) => [
            s.serviceCode,
            `"${s.serviceName}"`,
            s.campaignFeeInflow,
            s.buyLeadInflow,
            s.completedServiceFeeValue,
            s.releasedFranchiseCommissions,
            s.retainedServiceMargin,
            s.totalRevenue,
          ])
        : filteredDistricts.map((d) => [
            `"${d.district}"`,
            d.campaignFeeInflow,
            d.buyLeadInflow,
            d.completedServiceFeeValue,
            d.releasedFranchiseCommissions,
            d.retainedServiceMargin,
            d.totalRevenue,
          ]);

    const headers =
      breakdownView === 'service'
        ? [
            'Service Code',
            'Service Name',
            'Campaign Inflow (INR)',
            'Buy Lead Inflow (INR)',
            'Completed Service Fee (INR)',
            'Released Commission (INR)',
            'Retained Margin (INR)',
            'Total Platform Revenue (INR)',
          ]
        : [
            'District / Territory',
            'Campaign Inflow (INR)',
            'Buy Lead Inflow (INR)',
            'Completed Service Fee (INR)',
            'Released Commission (INR)',
            'Retained Margin (INR)',
            'Total Platform Revenue (INR)',
          ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `LBSC_Network_Revenue_${breakdownView}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-700" />
        <span className="text-xs font-semibold text-slate-600">
          Calculating corporate network revenue and retained margins...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-slate-800" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Corporate Network Revenue & Retained Margin
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Corporate Financial Headquarters</span>
            <span aria-hidden="true">·</span>
            <span>Immutable Ledger Reconciliation</span>
            <span aria-hidden="true">·</span>
            <span>
              Generated {reportData?.generatedAt ? new Date(reportData.generatedAt).toLocaleTimeString() : 'now'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
            title="Print Executive Statement"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print View</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Filter Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-600" />
            <span>Financial Dimensions & Filters</span>
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              onClick={() => applyPreset('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                !startDate && !endDate
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => applyPreset('this_month')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors"
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset('last_month')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors"
            >
              Last Month
            </button>
            <button
              onClick={() => applyPreset('ytd')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors"
            >
              YTD
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white"
            />
          </div>

          {/* District Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              District / Territory
            </label>
            <input
              type="text"
              placeholder="e.g. Salem, Chennai..."
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white"
            />
          </div>

          {/* Service Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Catalog Service
            </label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white"
            >
              <option value="">All Services</option>
              {catalogServices.map((svc) => (
                <option key={svc.id} value={svc.code || svc.id}>
                  {svc.name} ({svc.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {(startDate || endDate || districtFilter || serviceFilter) && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Campaign Fee Inflow */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Campaign Inflow</span>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-900">
              ₹{(kpis?.campaignFeeInflow || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>₹100/day daily charges</span>
            <span className="font-semibold text-slate-700">{kpis?.campaignChargesCount || 0} debits</span>
          </div>
        </div>

        {/* 2. Buy Lead Inflow */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Buy Lead Inflow</span>
              <Coins className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-900">
              ₹{(kpis?.buyLeadInflow || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>₹20 marketplace buys</span>
            <span className="font-semibold text-slate-700">{kpis?.buyLeadCount || 0} leads</span>
          </div>
        </div>

        {/* 3. Completed Service Value */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Service Fee Value</span>
              <Briefcase className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-900">
              ₹{(kpis?.completedServiceFeeValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Completed filings value</span>
            <span className="font-semibold text-slate-700">{kpis?.completedServiceCount || 0} completed</span>
          </div>
        </div>

        {/* 4. Released Franchise Commissions */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Released Commission</span>
              <DollarSign className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-900">
              ₹{(kpis?.releasedFranchiseCommissions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Paid out to partners</span>
            <span className="font-semibold text-slate-700">Distributed</span>
          </div>
        </div>

        {/* 5. Retained Service Margin */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Retained Margin</span>
              <Percent className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700">
              ₹{(kpis?.retainedServiceMargin || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-emerald-700 mt-2 flex items-center justify-between border-t border-emerald-100 pt-1.5">
            <span>Fee Value - Commission</span>
            <span className="font-bold">{kpis?.retainedMarginPercentage || 0}% margin</span>
          </div>
        </div>

        {/* 6. Total Platform Inflow */}
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Net Platform Margin</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white">
              ₹{(kpis?.totalNetPlatformMargin || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800 pt-1.5">
            <span>Inflows + Margin</span>
            <span className="text-slate-300">Corporate HQ</span>
          </div>
        </div>
      </div>

      {/* Breakdowns Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Segmented Breakdown Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg print:hidden">
            <button
              onClick={() => setBreakdownView('service')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                breakdownView === 'service'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Catalog Service Breakdown ({reportData?.breakdowns?.byService?.length || 0})</span>
            </button>

            <button
              onClick={() => setBreakdownView('district')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                breakdownView === 'district'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Territory / District Breakdown ({reportData?.breakdowns?.byDistrict?.length || 0})</span>
            </button>
          </div>

          <div className="hidden print:block text-xs font-bold text-slate-900 uppercase">
            {breakdownView === 'service' ? 'Service Performance Breakdown' : 'District Territory Breakdown'}
          </div>

          {/* Table Search Filter */}
          <div className="relative w-full sm:w-64 print:hidden">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${breakdownView === 'service' ? 'services...' : 'districts...'}`}
              value={searchTableQuery}
              onChange={(e) => setSearchTableQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>

        {/* Service Breakdown Table */}
        {breakdownView === 'service' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Service</th>
                  <th className="py-2.5 px-4 text-right">Campaign Fee (₹)</th>
                  <th className="py-2.5 px-4 text-right">Buy Lead Inflow (₹)</th>
                  <th className="py-2.5 px-4 text-right">Service Fee Value (₹)</th>
                  <th className="py-2.5 px-4 text-right">Released Comm. (₹)</th>
                  <th className="py-2.5 px-4 text-right">Retained Margin (₹)</th>
                  <th className="py-2.5 px-4 text-right">Total Net Rev (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                      No service revenue records found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((svc) => (
                    <tr key={svc.serviceId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                        <div className="font-semibold">{svc.serviceName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{svc.serviceCode}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {svc.campaignFeeInflow > 0 ? `₹${svc.campaignFeeInflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {svc.buyLeadInflow > 0 ? `₹${svc.buyLeadInflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {svc.completedServiceFeeValue > 0 ? `₹${svc.completedServiceFeeValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {svc.releasedFranchiseCommissions > 0 ? `₹${svc.releasedFranchiseCommissions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-emerald-700">
                        {svc.retainedServiceMargin > 0 ? `₹${svc.retainedServiceMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                        ₹{svc.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Territory / District Breakdown Table */}
        {breakdownView === 'district' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">District / Territory</th>
                  <th className="py-2.5 px-4 text-right">Campaign Fee (₹)</th>
                  <th className="py-2.5 px-4 text-right">Buy Lead Inflow (₹)</th>
                  <th className="py-2.5 px-4 text-right">Service Fee Value (₹)</th>
                  <th className="py-2.5 px-4 text-right">Released Comm. (₹)</th>
                  <th className="py-2.5 px-4 text-right">Retained Margin (₹)</th>
                  <th className="py-2.5 px-4 text-right">Total Net Rev (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredDistricts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                      No territory revenue records found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredDistricts.map((dist) => (
                    <tr key={dist.district} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dist.district}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {dist.campaignFeeInflow > 0 ? `₹${dist.campaignFeeInflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {dist.buyLeadInflow > 0 ? `₹${dist.buyLeadInflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {dist.completedServiceFeeValue > 0 ? `₹${dist.completedServiceFeeValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {dist.releasedFranchiseCommissions > 0 ? `₹${dist.releasedFranchiseCommissions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-emerald-700">
                        {dist.retainedServiceMargin > 0 ? `₹${dist.retainedServiceMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                        ₹{dist.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Corporate Ledger Integrity Guarantee Callout */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Audit & Reconciliation Notice:</strong> Service Fee Value represents gross customer filing demand and is strictly distinguished from platform inflows until settled. All platform inflows reflect actual debited ledger transactions.
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
          LBSC Corp Fin v21.0
        </div>
      </div>
    </div>
  );
};
