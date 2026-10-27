import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileCheck2,
  Users2,
  Briefcase,
  Wallet,
  Megaphone,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Play,
  Layers,
  Search,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { AdminNavTab } from './AdminSidebar';
import type {
  FranchiseApplication,
  FranchiseCommissionAccountDetail,
  ServiceMaster,
  Lead,
} from '../../types';

interface AdminDashboardViewProps {
  onNavigate: (tab: AdminNavTab) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [accounts, setAccounts] = useState<FranchiseCommissionAccountDetail[]>([]);
  const [applications, setApplications] = useState<FranchiseApplication[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clientStats, setClientStats] = useState<any>(null);

  // Maintenance action states
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [processingDailyCharges, setProcessingDailyCharges] = useState(false);
  const [processingExpiredLeads, setProcessingExpiredLeads] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [accRes, appRes, srvRes, leadRes, statsRes] = await Promise.all([
        ApiClient.getCommissionAccounts(),
        ApiClient.getApplications(),
        ApiClient.getServices(),
        ApiClient.getLeads({ limit: 100 }),
        ApiClient.getClientStats(),
      ]);

      if (accRes.success) setAccounts(accRes.data || []);
      if (appRes.success) setApplications(appRes.data || []);
      if (srvRes.success) setServices(srvRes.data || []);
      if (leadRes.success) setLeads(leadRes.data || []);
      if (statsRes.success) setClientStats(statsRes.data || null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch platform dashboard metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleProcessDailyCharges = async () => {
    setProcessingDailyCharges(true);
    setActionMessage(null);
    try {
      const res = await ApiClient.processDailyCharges();
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Daily campaign charges processed: ${res.data?.processedCount || 0} active campaigns debited. Total: ₹${(res.data?.totalCharged || 0).toLocaleString('en-IN')}`,
        });
        fetchData();
      } else {
        setActionMessage({
          type: 'error',
          text: res.error?.message || 'Failed to process daily campaign charges',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Network error processing charges' });
    } finally {
      setProcessingDailyCharges(false);
    }
  };

  const handleProcessExpiredLeads = async () => {
    setProcessingExpiredLeads(true);
    setActionMessage(null);
    try {
      const res = await ApiClient.processExpiredOpportunities();
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Expired lead processing complete: ${res.data?.processedCount || 0} opportunities re-routed.`,
        });
        fetchData();
      } else {
        setActionMessage({
          type: 'error',
          text: res.error?.message || 'Failed to process expired leads',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error processing expired leads' });
    } finally {
      setProcessingExpiredLeads(false);
    }
  };

  // Calculations
  const pendingRequests = applications.filter(
    (a) => a.status === 'application' || a.status === 'screening'
  );
  const activeFranchisesCount = accounts.length;
  const totalEscrowBalance = accounts.reduce((acc, a) => acc + (a.current_balance || 0), 0);
  const activeServicesCount = services.filter((s) => Boolean(s.is_active)).length;
  const totalLeadsCount = leads.length;
  const totalClientsCount = clientStats?.totalClients || 0;

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-64 bg-slate-200 animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl"></div>
          ))}
        </div>
        <div className="h-64 bg-slate-100 animate-pulse rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Master Admin Operations
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              System Online
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Central command and oversight across the franchise network and client ecosystem.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-[11px] underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Active Franchises */}
        <div
          onClick={() => onNavigate('admin-franchises')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Franchises</span>
            <Building2 className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{activeFranchisesCount}</p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">Active Centers</p>
        </div>

        {/* Pending Requests */}
        <div
          onClick={() => onNavigate('admin-requests')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Requests</span>
            <FileCheck2 className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{pendingRequests.length}</p>
          <p className="text-[11px] text-amber-700 font-medium mt-1">Pending Review</p>
        </div>

        {/* Lead Volume */}
        <div
          onClick={() => onNavigate('admin-leads')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Platform Leads</span>
            <Users2 className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalLeadsCount}</p>
          <p className="text-[11px] text-indigo-600 font-medium mt-1">Ingested Leads</p>
        </div>

        {/* Registered Clients */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Clients</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalClientsCount}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Directory Total</p>
        </div>

        {/* Catalog Services */}
        <div
          onClick={() => onNavigate('admin-services')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Catalog</span>
            <Briefcase className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{activeServicesCount}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Active Services</p>
        </div>

        {/* Network Escrow */}
        <div
          onClick={() => onNavigate('admin-commissions')}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Escrow</span>
            <Wallet className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-slate-900 truncate">
            ₹{totalEscrowBalance.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">Franchise Balances</p>
        </div>
      </div>

      {/* Main Split Section: Quick Action Hub & Pending Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Operations & Batch Maintenance Hub */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Admin Action Center</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Automated batch routines and administrative tools</p>
            </div>
            <span className="p-1 rounded bg-slate-100 text-slate-600">
              <Play className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Batch Daily Charges */}
            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">Process Daily Campaign Charges</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Debits daily marketing fee from franchise wallets</p>
              </div>
              <button
                onClick={handleProcessDailyCharges}
                disabled={processingDailyCharges}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold transition-colors shrink-0 disabled:opacity-50"
              >
                {processingDailyCharges ? 'Running...' : 'Run Batch'}
              </button>
            </div>

            {/* Expired Opportunities Re-router */}
            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">Re-route Expired Leads</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Cleans 1-hr timed-out leads & routes to Marketplace</p>
              </div>
              <button
                onClick={handleProcessExpiredLeads}
                disabled={processingExpiredLeads}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold transition-colors shrink-0 disabled:opacity-50"
              >
                {processingExpiredLeads ? 'Re-routing...' : 'Process'}
              </button>
            </div>

            {/* Quick Navigation Shortcuts */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigate('admin-network-revenue')}
                className="p-2.5 text-left border border-indigo-200 bg-indigo-50/50 rounded-lg hover:bg-indigo-50 transition-colors col-span-2"
              >
                <p className="text-xs font-bold text-indigo-900 flex items-center justify-between">
                  <span>Corporate Network Revenue & Margins</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
                </p>
                <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
                  Campaign fees, Buy Leads & retained service margins
                </p>
              </button>

              <button
                onClick={() => onNavigate('admin-requests')}
                className="p-2.5 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <p className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Applications</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Review inquiries</p>
              </button>

              <button
                onClick={() => onNavigate('admin-commissions')}
                className="p-2.5 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <p className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Adjustment</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Manual credit / debit</p>
              </button>

              <button
                onClick={() => onNavigate('admin-services')}
                className="p-2.5 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <p className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Add Service</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Manage catalog</p>
              </button>

              <button
                onClick={() => onNavigate('admin-leads')}
                className="p-2.5 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <p className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Ingest Lead</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Create intake lead</p>
              </button>
            </div>
          </div>
        </div>

        {/* Pending Franchise Requests Stream */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Franchise Requests Pipeline</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Recent partner applications awaiting screening or approval</p>
              </div>
              <button
                onClick={() => onNavigate('admin-requests')}
                className="text-xs font-semibold text-slate-900 hover:text-slate-700 flex items-center gap-1"
              >
                <span>View All ({applications.length})</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {applications.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <FileCheck2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No franchise requests found.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-1">
                {applications.slice(0, 5).map((app) => (
                  <div key={app.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {app.business_name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${
                            app.status === 'application'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : app.status === 'screening'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : app.status === 'approved'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : app.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        Contact: {app.contact_name} • {app.contact_phone} • {app.city}, {app.state}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onNavigate('admin-requests')}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                      >
                        Action
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Workflow: Application → Screening → Approved → Active</span>
            <span className="font-medium text-slate-700">Instant Provisioning Enabled</span>
          </div>
        </div>
      </div>

      {/* Network Centers Snapshot */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Active Franchise Centers</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Licensed partner locations and current ledger balances</p>
          </div>
          <button
            onClick={() => onNavigate('admin-franchises')}
            className="text-xs font-semibold text-slate-900 hover:text-slate-700 flex items-center gap-1"
          >
            <span>Manage Centers</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No active franchise centers currently provisioned.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-semibold">Franchise Code</th>
                  <th className="pb-2 font-semibold">Operating Name</th>
                  <th className="pb-2 font-semibold">Organization ID</th>
                  <th className="pb-2 font-semibold text-right">Commission Wallet</th>
                  <th className="pb-2 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 font-mono font-semibold text-slate-900">
                      {acc.franchise_code || 'UNASSIGNED'}
                    </td>
                    <td className="py-2.5 font-medium text-slate-800">
                      {acc.operating_name || 'Partner Center'}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-slate-500">
                      {acc.organization_id}
                    </td>
                    <td className="py-2.5 font-bold text-slate-900 text-right">
                      ₹{acc.current_balance.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Operational
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
