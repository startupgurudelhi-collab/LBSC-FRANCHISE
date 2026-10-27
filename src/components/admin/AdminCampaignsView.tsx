import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Search,
  Filter,
  RefreshCw,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Coins,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { Campaign, FranchiseCommissionAccountDetail } from '../../types';

export const AdminCampaignsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<FranchiseCommissionAccountDetail[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Processing batch state
  const [processingCharges, setProcessingCharges] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [campRes, accRes] = await Promise.all([
        ApiClient.getCampaigns(),
        ApiClient.getCommissionAccounts(),
      ]);

      if (campRes.success) setCampaigns(campRes.data || []);
      if (accRes.success) setAccounts(accRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading campaigns');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handlePauseCampaign = async (campaign: Campaign) => {
    setActionLoadingId(campaign.id);
    setError(null);
    try {
      const res = await ApiClient.pauseCampaign(campaign.id);
      if (res.success) {
        setSuccessMessage(`Campaign "${campaign.name}" paused.`);
        loadData();
      } else {
        setError(res.error?.message || 'Failed to pause campaign');
      }
    } catch (err: any) {
      setError(err.message || 'Error pausing campaign');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResumeCampaign = async (campaign: Campaign) => {
    setActionLoadingId(campaign.id);
    setError(null);
    try {
      const res = await ApiClient.resumeCampaign(campaign.id);
      if (res.success) {
        setSuccessMessage(`Campaign "${campaign.name}" resumed.`);
        loadData();
      } else {
        setError(res.error?.message || 'Failed to resume campaign');
      }
    } catch (err: any) {
      setError(err.message || 'Error resuming campaign');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleProcessDailyCharges = async () => {
    setProcessingCharges(true);
    setError(null);
    try {
      const res = await ApiClient.processDailyCharges();
      if (res.success) {
        setSuccessMessage(
          `Daily campaign run complete: ${res.data?.processedCount || 0} campaigns charged. Total: ₹${(
            res.data?.totalCharged || 0
          ).toLocaleString('en-IN')}`
        );
        loadData();
      } else {
        setError(res.error?.message || 'Failed to process daily charges');
      }
    } catch (err: any) {
      setError(err.message || 'Error processing charges');
    } finally {
      setProcessingCharges(false);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;
    const text = `${c.name || ''} ${c.service_name || ''} ${c.organization_id || ''}`.toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Active
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Paused
          </span>
        );
      case 'depleted':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Depleted
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Find franchise name map
  const orgMap = accounts.reduce((acc, a) => {
    acc[a.organization_id] = `${a.franchise_code || ''} ${a.operating_name || ''}`.trim();
    return acc;
  }, {} as Record<string, string>);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Campaign Management
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {campaigns.length} Platform Campaigns
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Oversee franchise lead-generation campaigns, daily budgets, performance metrics, and batch charge processing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleProcessDailyCharges}
            disabled={processingCharges}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>{processingCharges ? 'Debiting Wallets...' : 'Process Daily Charges'}</span>
          </button>

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

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Campaigns' },
            { id: 'active', label: 'Active' },
            { id: 'paused', label: 'Paused' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search campaigns by name, service, or franchise..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Campaigns Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-xl"></div>
          ))}
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/80 shadow-2xs text-slate-400 text-xs">
          <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-slate-700">No campaigns found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Campaign Name</th>
                  <th className="py-3 px-4">Franchise Owner</th>
                  <th className="py-3 px-4">Target Service</th>
                  <th className="py-3 px-4 text-right">Daily Fee</th>
                  <th className="py-3 px-4 text-center">Lead Allocation</th>
                  <th className="py-3 px-4 text-center">Leads Today</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCampaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{c.id}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {orgMap[c.organization_id] || (
                        <span className="font-mono text-[10px] text-slate-400">
                          {c.organization_id}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {c.service_name || 'General Ingestion'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      ₹{(c.daily_fee || 100).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-slate-700">
                      {c.max_leads_per_day || 5} / day
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {c.leads_today_count || 0}
                    </td>
                    <td className="py-3 px-4 text-center">{getStatusBadge(c.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === 'active' && (
                          <button
                            onClick={() => handlePauseCampaign(c)}
                            disabled={actionLoadingId === c.id}
                            className="p-1 text-slate-500 hover:text-amber-600 rounded hover:bg-slate-100"
                            title="Pause Campaign"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {c.status === 'paused' && (
                          <button
                            onClick={() => handleResumeCampaign(c)}
                            disabled={actionLoadingId === c.id}
                            className="p-1 text-slate-500 hover:text-emerald-600 rounded hover:bg-slate-100"
                            title="Resume Campaign"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
