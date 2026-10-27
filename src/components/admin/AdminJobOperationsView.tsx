import React, { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../../api';
import type { BackgroundJob, ActiveJobLock } from '../../types';
import {
  Activity,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Calendar,
  Shield,
  Zap,
  RefreshCw,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';

export const AdminJobOperationsView: React.FC = () => {
  // Data states
  const [history, setHistory] = useState<BackgroundJob[]>([]);
  const [totalHistory, setTotalHistory] = useState(0);
  const [activeLocks, setActiveLocks] = useState<ActiveJobLock[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Filters & pagination
  const [filterJobName, setFilterJobName] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Manual Trigger states
  const [campaignDate, setCampaignDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [triggeringCampaign, setTriggeringCampaign] = useState(false);
  const [triggeringExpiry, setTriggeringExpiry] = useState(false);
  const [triggeringSla, setTriggeringSla] = useState(false);

  // Latest Execution Feedback Banner
  const [latestResult, setLatestResult] = useState<{
    jobName: string;
    status: 'COMPLETED' | 'FAILED';
    durationMs: number;
    summary?: any;
    error?: string;
    timestamp: string;
  } | null>(null);

  // 1. Fetch Lock Status & System Health
  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await ApiClient.getJobStatus();
      if (res?.success && res.data?.activeLocks) {
        setActiveLocks(res.data.activeLocks);
      } else {
        setActiveLocks([]);
      }
    } catch (err) {
      console.error('Failed to fetch job status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // 2. Fetch Job Execution History
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const offset = (page - 1) * limit;
      const res = await ApiClient.getJobHistory({
        job_name: filterJobName || undefined,
        status: filterStatus || undefined,
        limit,
        offset,
      });

      if (res?.success && res.data) {
        setHistory(res.data.jobs || []);
        setTotalHistory(res.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch job history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [filterJobName, filterStatus, page, limit]);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
  }, [fetchStatus, fetchHistory]);

  // Handle Manual Trigger: Campaign Daily Charges
  const handleTriggerCampaign = async () => {
    setTriggeringCampaign(true);
    try {
      const res = await ApiClient.triggerCampaignDailyChargesJob(campaignDate);
      if (res?.success && res.data) {
        setLatestResult({
          jobName: 'Campaign Daily Charges',
          status: res.data.status,
          durationMs: res.data.durationMs,
          summary: res.data.summary,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchHistory();
      await fetchStatus();
    } catch (err: any) {
      setLatestResult({
        jobName: 'Campaign Daily Charges',
        status: 'FAILED',
        durationMs: 0,
        error: err.message || 'Execution failed',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setTriggeringCampaign(false);
    }
  };

  // Handle Manual Trigger: Lead Opportunity Expiry
  const handleTriggerExpiry = async () => {
    setTriggeringExpiry(true);
    try {
      const res = await ApiClient.triggerLeadOpportunityExpiryJob();
      if (res?.success && res.data) {
        setLatestResult({
          jobName: 'Lead Opportunity Expiry',
          status: res.data.status,
          durationMs: res.data.durationMs,
          summary: res.data.summary,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchHistory();
      await fetchStatus();
    } catch (err: any) {
      setLatestResult({
        jobName: 'Lead Opportunity Expiry',
        status: 'FAILED',
        durationMs: 0,
        error: err.message || 'Execution failed',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setTriggeringExpiry(false);
    }
  };

  // Handle Manual Trigger: Service Application SLA
  const handleTriggerSla = async () => {
    setTriggeringSla(true);
    try {
      const res = await ApiClient.triggerServiceApplicationSlaJob();
      if (res?.success && res.data) {
        setLatestResult({
          jobName: 'Service Application SLA',
          status: res.data.status,
          durationMs: res.data.durationMs,
          summary: res.data.summary,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchHistory();
      await fetchStatus();
    } catch (err: any) {
      setLatestResult({
        jobName: 'Service Application SLA',
        status: 'FAILED',
        durationMs: 0,
        error: err.message || 'Execution failed',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setTriggeringSla(false);
    }
  };

  const totalPages = Math.ceil(totalHistory / limit) || 1;

  // Format job code display
  const getJobBadge = (name: string) => {
    switch (name) {
      case 'campaign_daily_charges':
        return (
          <span className="font-mono text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            campaign_daily_charges
          </span>
        );
      case 'lead_opportunity_expiry':
        return (
          <span className="font-mono text-xs font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            lead_opportunity_expiry
          </span>
        );
      case 'service_application_sla':
        return (
          <span className="font-mono text-xs font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            service_application_sla
          </span>
        );
      default:
        return (
          <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            {name}
          </span>
        );
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 text-slate-900">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-950 tracking-tight">
              Job Operations & Background Runners
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              Super Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Durable database-backed job runner dashboard. Monitor distributed locks, trigger scheduled business tasks, and review execution audit logs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchStatus();
            fetchHistory();
          }}
          disabled={loadingStatus || loadingHistory}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus || loadingHistory ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh All</span>
        </button>
      </div>

      {/* System Health & Lock Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Lock Engine Status */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Distributed Lock Provider</span>
            <Shield className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Operational (DB Locks)
          </p>
          <p className="text-[11px] text-slate-500">
            Zero external Redis dependency. Mutual exclusion guaranteed by durable transactions.
          </p>
        </div>

        {/* Active Locks */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Active Running Locks</span>
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-base font-bold text-slate-900">
            {activeLocks.length === 0 ? (
              <span className="text-emerald-700 font-semibold text-sm">All runners idle (0 active locks)</span>
            ) : (
              <span className="text-amber-700 font-semibold text-sm">{activeLocks.length} Active Lock(s)</span>
            )}
          </p>
          <p className="text-[11px] text-slate-500">
            {activeLocks.length > 0
              ? `Lock: ${activeLocks.map((l) => l.lock_name).join(', ')}`
              : 'Safe for concurrent task execution.'}
          </p>
        </div>

        {/* Total Historical Runs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Total Recorded Runs</span>
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{totalHistory}</p>
          <p className="text-[11px] text-slate-500">
            Audit logs stored with runtime durations & summaries.
          </p>
        </div>
      </div>

      {/* Latest Execution Feedback Banner */}
      {latestResult && (
        <div
          className={`p-4 rounded-xl border transition-all ${
            latestResult.status === 'COMPLETED'
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/70 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {latestResult.status === 'COMPLETED' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <div>
                <span className="font-bold text-sm">
                  {latestResult.jobName} — {latestResult.status}
                </span>
                <span className="text-xs text-slate-500 ml-2">
                  (Duration: {latestResult.durationMs}ms at {latestResult.timestamp})
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLatestResult(null)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 self-end sm:self-auto"
            >
              Dismiss
            </button>
          </div>

          {latestResult.summary && (
            <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex flex-wrap gap-2 text-xs">
              {Object.entries(latestResult.summary).map(([key, val]) => (
                <span
                  key={key}
                  className="bg-white/90 px-2 py-0.5 rounded border border-emerald-200 font-mono text-[11px]"
                >
                  <strong className="font-semibold text-slate-700">{key}:</strong>{' '}
                  <span className="text-emerald-900 font-bold">{String(val)}</span>
                </span>
              ))}
            </div>
          )}

          {latestResult.error && (
            <p className="mt-2 text-xs text-rose-800 font-mono bg-white/80 p-2 rounded border border-rose-200">
              Error: {latestResult.error}
            </p>
          )}
        </div>
      )}

      {/* Manual Job Triggers Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Manual Task Execution (Super Admin Triggers)
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Card 1: Campaign Daily Charges */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">1. Campaign Daily Charges</span>
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ₹100/day
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Debits ₹100 daily fee from active territory campaign franchises. Preserves date idempotency, 3-day negative balance grace, and auto-pause rules.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Target Charge Date:
                </label>
                <input
                  type="date"
                  value={campaignDate}
                  onChange={(e) => setCampaignDate(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleTriggerCampaign}
                disabled={triggeringCampaign}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-2xs disabled:opacity-50"
              >
                {triggeringCampaign ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Daily Charges...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Campaign Charges</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 2: Lead Opportunity Expiry */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">2. Lead Opportunity Expiry</span>
                <span className="text-[10px] font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  1-Hour Window
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Identifies unaccepted leads past their 1-hour window. Re-routes to the next eligible campaign franchise, or transfers to Own Lead Center if exhausted.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                <span className="font-semibold text-slate-700">Safety Rule:</span> Atomic status checks prevent double-expiring or concurrent duplicate redistribution.
              </div>

              <button
                type="button"
                onClick={handleTriggerExpiry}
                disabled={triggeringExpiry}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 transition-colors shadow-2xs disabled:opacity-50"
              >
                {triggeringExpiry ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Checking Expired Leads...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Run Expiry Processor</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 3: Service Application SLA */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">3. Service Application SLA</span>
                <span className="text-[10px] font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Audit & Alert
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Evaluates active service applications against turnaround targets. Emits approaching (≤24h) and breached (&lt;0h) alerts <strong>without mutating application statuses</strong>.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                <span className="font-semibold text-slate-700">Invariant:</span> 24-hour window deduplication prevents repetitive alert storming.
              </div>

              <button
                type="button"
                onClick={handleTriggerSla}
                disabled={triggeringSla}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-purple-700 text-white hover:bg-purple-800 transition-colors shadow-2xs disabled:opacity-50"
              >
                {triggeringSla ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditing Service SLAs...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Run SLA Monitor</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Execution History Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Header with Filters */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600" />
            <span className="font-bold text-sm text-slate-900">Execution Audit History</span>
            <span className="text-xs text-slate-500">({totalHistory} records)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Job Name */}
            <select
              value={filterJobName}
              onChange={(e) => {
                setFilterJobName(e.target.value);
                setPage(1);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
            >
              <option value="">All Jobs</option>
              <option value="campaign_daily_charges">campaign_daily_charges</option>
              <option value="lead_opportunity_expiry">lead_opportunity_expiry</option>
              <option value="service_application_sla">service_application_sla</option>
            </select>

            {/* Filter by Status */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="RUNNING">RUNNING</option>
            </select>
          </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Job Name</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Trigger</th>
                <th className="py-2.5 px-4">Started At</th>
                <th className="py-2.5 px-4">Duration</th>
                <th className="py-2.5 px-4">Execution Summary / Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingHistory ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading job execution logs...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No execution records match the selected filter.
                  </td>
                </tr>
              ) : (
                history.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Job Name */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getJobBadge(job.job_name)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {job.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          COMPLETED
                        </span>
                      ) : job.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          FAILED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                          RUNNING
                        </span>
                      )}
                    </td>

                    {/* Trigger */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      {job.trigger_type}
                    </td>

                    {/* Started At */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {new Date(job.started_at).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-700">
                      {job.duration_ms !== null && job.duration_ms !== undefined ? `${job.duration_ms}ms` : '—'}
                    </td>

                    {/* Summary / Error */}
                    <td className="py-3 px-4 text-slate-600">
                      {job.error_message ? (
                        <span className="text-rose-700 font-mono text-[11px] block truncate max-w-md" title={job.error_message}>
                          Error: {job.error_message}
                        </span>
                      ) : job.summary ? (
                        <div className="flex flex-wrap gap-1 max-w-lg">
                          {Object.entries(job.summary).slice(0, 4).map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-block bg-slate-100 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 font-mono"
                            >
                              {k}: <strong>{String(v)}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} of {totalPages} ({totalHistory} total runs)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5 inline mr-0.5" />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 inline ml-0.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
