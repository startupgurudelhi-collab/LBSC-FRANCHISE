import React, { useState, useEffect } from 'react';
import {
  Users2,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  MapPin,
  Mail,
  Phone,
  Tag,
  Calendar,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Smartphone,
  HelpCircle,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { Lead, ServiceMaster, LeadIntakeStatus } from '../../types';

export const AdminLeadDirectoryView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Phase 20B: Gateway Health & Observability State
  const [gatewayStatus, setGatewayStatus] = useState<LeadIntakeStatus | null>(null);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'processed' | 'duplicate'>('all');

  // Processing batch
  const [processingExpired, setProcessingExpired] = useState(false);

  // New Lead Modal
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    serviceId: '',
    source: 'admin_portal',
    city: '',
    district: '',
    state: 'Tamil Nadu',
    pin: '',
    notes: '',
  });
  const [submittingLead, setSubmittingLead] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [leadsRes, srvRes, gatewayRes] = await Promise.all([
        ApiClient.getLeads({ limit: 100 }),
        ApiClient.getServices(),
        ApiClient.getLeadIntakeStatus().catch(() => ({ success: false, data: null })),
      ]);

      if (leadsRes.success) setLeads(leadsRes.data || []);
      if (gatewayRes.success && gatewayRes.data) setGatewayStatus(gatewayRes.data);
      if (srvRes.success) {
        const srvList = srvRes.data || [];
        setServices(srvList);
        if (srvList.length > 0 && !newLeadForm.serviceId) {
          setNewLeadForm((prev) => ({ ...prev, serviceId: srvList[0].id }));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error loading lead directory');
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

  const handleProcessExpired = async () => {
    setProcessingExpired(true);
    setError(null);
    try {
      const res = await ApiClient.processExpiredOpportunities();
      if (res.success) {
        setSuccessMessage(
          `Processed expired leads: ${res.data?.processedCount || 0} opportunities re-routed.`
        );
        loadData();
      } else {
        setError(res.error?.message || 'Failed to process expired leads');
      }
    } catch (err: any) {
      setError(err.message || 'Error processing expired leads');
    } finally {
      setProcessingExpired(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLead(true);
    setError(null);
    try {
      const res = await ApiClient.createLead({
        customerName: newLeadForm.customerName.trim(),
        customerPhone: newLeadForm.customerPhone.trim(),
        customerEmail: newLeadForm.customerEmail.trim() || undefined,
        serviceId: newLeadForm.serviceId,
        source: newLeadForm.source.trim() || 'admin_portal',
        city: newLeadForm.city.trim(),
        district: newLeadForm.district.trim(),
        state: newLeadForm.state.trim(),
        pin: newLeadForm.pin.trim() || undefined,
        notes: newLeadForm.notes.trim() || undefined,
      });

      if (res.success) {
        setSuccessMessage(`Lead "${newLeadForm.customerName}" created and placed into distribution queue.`);
        setShowNewLeadModal(false);
        setNewLeadForm({
          customerName: '',
          customerPhone: '',
          customerEmail: '',
          serviceId: services[0]?.id || '',
          source: 'admin_portal',
          city: '',
          district: '',
          state: 'Tamil Nadu',
          pin: '',
          notes: '',
        });
        loadData();
      } else {
        setError(res.error?.message || 'Failed to create lead');
      }
    } catch (err: any) {
      setError(err.message || 'Error creating lead');
    } finally {
      setSubmittingLead(false);
    }
  };

  const handleCopyEndpoint = () => {
    const fullUrl = `${window.location.origin}/api/v1/integrations/lead-intake/webhook`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const filteredLeads = leads.filter((l) => {
    const matchesStatus = statusFilter === 'all' ? true : l.status === statusFilter;

    const sourceLower = (l.source || '').toLowerCase();
    let matchesSource = true;
    if (sourceFilter === 'meta') {
      matchesSource =
        sourceLower.includes('meta') ||
        sourceLower.includes('facebook') ||
        sourceLower.includes('instagram');
    } else if (sourceFilter === 'google') {
      matchesSource = sourceLower.includes('google');
    } else if (sourceFilter === 'landing_page') {
      matchesSource = sourceLower.includes('landing') || sourceLower.includes('lp');
    } else if (sourceFilter === 'website') {
      matchesSource = sourceLower.includes('website') || sourceLower.includes('web');
    } else if (sourceFilter === 'admin_portal') {
      matchesSource = sourceLower.includes('admin') || sourceLower.includes('portal');
    } else if (sourceFilter === 'other') {
      matchesSource =
        !sourceLower.includes('meta') &&
        !sourceLower.includes('facebook') &&
        !sourceLower.includes('instagram') &&
        !sourceLower.includes('google') &&
        !sourceLower.includes('landing') &&
        !sourceLower.includes('lp') &&
        !sourceLower.includes('website') &&
        !sourceLower.includes('web') &&
        !sourceLower.includes('admin') &&
        !sourceLower.includes('portal');
    } else if (sourceFilter !== 'all') {
      matchesSource = sourceLower === sourceFilter.toLowerCase();
    }

    const text = `${l.customer_name || ''} ${l.customer_phone || ''} ${l.customer_email || ''} ${l.service_code || ''} ${
      l.city || ''
    } ${l.state || ''} ${l.source || ''} ${l.source_reference || ''}`.toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSource && matchesSearch;
  });

  const getSourceBadge = (source?: string | null, sourceReference?: string | null) => {
    const s = (source || 'admin_portal').toLowerCase();
    let badge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <Tag className="w-2.5 h-2.5 text-slate-500" />
        <span className="capitalize">{source || 'Direct'}</span>
      </span>
    );

    if (s.includes('meta') || s.includes('facebook') || s.includes('instagram')) {
      badge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Smartphone className="w-2.5 h-2.5 text-blue-600" />
          <span>Meta Ads</span>
        </span>
      );
    } else if (s.includes('google')) {
      badge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Search className="w-2.5 h-2.5 text-emerald-600" />
          <span>Google Ads</span>
        </span>
      );
    } else if (s.includes('landing') || s.includes('lp')) {
      badge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <Globe className="w-2.5 h-2.5 text-purple-600" />
          <span>Landing Page</span>
        </span>
      );
    } else if (s.includes('website') || s.includes('web')) {
      badge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <ExternalLink className="w-2.5 h-2.5 text-cyan-600" />
          <span>Website</span>
        </span>
      );
    } else if (s.includes('admin') || s.includes('portal')) {
      badge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <ShieldCheck className="w-2.5 h-2.5 text-slate-500" />
          <span>Admin Portal</span>
        </span>
      );
    } else if (s.includes('lead_webhook')) {
      badge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Radio className="w-2.5 h-2.5 text-indigo-600" />
          <span>Webhook</span>
        </span>
      );
    }

    return (
      <div className="flex flex-col items-end gap-0.5">
        {badge}
        {sourceReference && (
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[130px]" title={sourceReference}>
            {sourceReference}
          </span>
        )}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_distribution':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Pending Queue
          </span>
        );
      case 'distributed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Distributed
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Accepted
          </span>
        );
      case 'converted':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            Converted
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Expired (Marketplace)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 capitalize">
            {status.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Platform Lead Directory
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {leads.length} Ingested Leads
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global repository of client inquiries, geographic routing, assignment states, and conversion histories.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewLeadModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ingest Lead</span>
          </button>

          <button
            onClick={handleProcessExpired}
            disabled={processingExpired}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
            title="Clean up 1-hour timed-out lead opportunities"
          >
            <Clock className={`w-3.5 h-3.5 ${processingExpired ? 'animate-spin' : ''}`} />
            <span>Expire Timed-Out Leads</span>
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

      {/* Phase 20B: Lead Intake Gateway Health & Multi-Channel Ingestion Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Lead Intake Gateway & Channel Operations
                </h2>
                {gatewayStatus?.webhookSecretConfigured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Secret Protected (Fail-Closed)</span>
                  </span>
                ) : gatewayStatus?.isProduction ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <ShieldAlert className="w-3 h-3 text-rose-600" />
                    <span>Secret Missing (Blocked in Prod)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Activity className="w-3 h-3 text-amber-600" />
                    <span>Development Sandbox</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ingests, normalizes, deduplicates, and routes leads from Meta, Google Ads, and landing pages with 24h idempotency protection.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyEndpoint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              title="Copy public webhook intake URL"
            >
              {copiedEndpoint ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied URL</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Webhook URL</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowGatewayModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Gateway Setup & Activity</span>
            </button>
          </div>
        </div>

        {/* Channel KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-medium">Meta Ads (FB/IG)</span>
              <Smartphone className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
              {gatewayStatus?.channels.meta ?? 0}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Forms & Campaigns</p>
          </div>

          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-medium">Google Ads</span>
              <Search className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
              {gatewayStatus?.channels.google ?? 0}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Search & PMax Leads</p>
          </div>

          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-medium">Landing Pages</span>
              <Globe className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
              {gatewayStatus?.channels.landingPage ?? 0}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Web Form Submissions</p>
          </div>

          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-medium">Other Webhooks</span>
              <Tag className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
              {gatewayStatus?.channels.other ?? 0}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">API & Aggregators</p>
          </div>

          <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
            <div className="flex items-center justify-between text-indigo-700">
              <span className="text-[11px] font-medium">Total Gateway Ingested</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <p className="text-lg font-bold text-indigo-900 mt-1 font-mono">
              {gatewayStatus?.totalUniqueLeadsIngested ?? 0}
            </p>
            <p className="text-[10px] text-indigo-600/80 mt-0.5">Routed to Campaigns</p>
          </div>

          <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200/70">
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-[11px] font-medium">Duplicates Prevented</span>
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-amber-900 mt-1 font-mono">
              {gatewayStatus?.duplicateAttemptsPrevented ?? 0}
            </p>
            <p className="text-[10px] text-amber-700/80 mt-0.5">Campaign Quota Saved</p>
          </div>
        </div>
      </div>

      {/* Filters & Channel Selector */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Status:
          </span>
          {[
            { id: 'all', label: 'All Leads' },
            { id: 'pending_distribution', label: 'Pending Queue' },
            { id: 'distributed', label: 'Distributed' },
            { id: 'accepted', label: 'Accepted' },
            { id: 'converted', label: 'Converted' },
            { id: 'expired', label: 'Expired' },
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

        {/* Source / Channel Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <span>Channel:</span>
          </span>
          {[
            { id: 'all', label: 'All Sources', icon: Layers },
            { id: 'meta', label: 'Meta Ads', icon: Smartphone },
            { id: 'google', label: 'Google Ads', icon: Search },
            { id: 'landing_page', label: 'Landing Page', icon: Globe },
            { id: 'website', label: 'Website', icon: ExternalLink },
            { id: 'admin_portal', label: 'Admin Portal', icon: ShieldCheck },
            { id: 'other', label: 'Other', icon: Tag },
          ].map((ch) => {
            const Icon = ch.icon;
            const isSelected = sourceFilter === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setSourceFilter(ch.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{ch.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads by customer name, phone, email, service code, city, source, or campaign ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Leads Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-xl"></div>
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/80 shadow-2xs text-slate-400 text-xs">
          <Users2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-slate-700">No leads match your filter</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Lead ID / Date</th>
                  <th className="py-3 px-4">Customer Contact</th>
                  <th className="py-3 px-4">Requested Service</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Source & Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <p className="font-mono font-semibold text-slate-900">{l.id.slice(0, 8)}...</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(l.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{l.customer_name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                        <span>{l.customer_phone}</span>
                        {l.customer_email && <span>• {l.customer_email}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-slate-800 px-1.5 py-0.5 bg-slate-100 rounded text-[11px]">
                        {l.service_code}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>
                          {l.city || 'Salem'}, {l.district || 'Salem'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">{getStatusBadge(l.status)}</td>
                    <td className="py-3 px-4 text-right">
                      {getSourceBadge(l.source, l.source_reference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ingest Lead Modal */}
      {showNewLeadModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ingest New Lead</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Route customer inquiry into automated distribution
                </p>
              </div>
              <button
                onClick={() => setShowNewLeadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newLeadForm.customerName}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, customerName: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit number"
                    value={newLeadForm.customerPhone}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, customerPhone: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="client@domain.com"
                    value={newLeadForm.customerEmail}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, customerEmail: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requested Service
                </label>
                <select
                  required
                  value={newLeadForm.serviceId}
                  onChange={(e) =>
                    setNewLeadForm({ ...newLeadForm, serviceId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) - ₹{s.service_fee}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lead Source
                  </label>
                  <select
                    value={newLeadForm.source}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, source: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="admin_portal">Admin Portal</option>
                    <option value="website">Website Inquiry</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="referral">Referral</option>
                    <option value="campaign">Territory Campaign</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Postal PIN (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 636001"
                    value={newLeadForm.pin}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, pin: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salem"
                    value={newLeadForm.city}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salem"
                    value={newLeadForm.district}
                    onChange={(e) =>
                      setNewLeadForm({ ...newLeadForm, district: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tamil Nadu"
                  value={newLeadForm.state}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, state: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inquiry Notes / Customer Context
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context or requirements..."
                  value={newLeadForm.notes}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewLeadModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLead}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {submittingLead ? 'Ingesting...' : 'Ingest & Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phase 20B: Read-only Gateway Setup & Activity Drawer/Modal */}
      {showGatewayModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Lead Intake Gateway & Observability
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Phase 20B
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    External webhook gateway configuration, channel volume & deduplication audit
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Refresh activity logs"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowGatewayModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 space-y-6 flex-1 text-xs">
              {/* Section 1: Gateway Configuration & Security (Read-Only) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Gateway Configuration & Security
                  </h4>
                  <span className="text-[11px] text-slate-400">Strict Read-Only Mode</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Webhook Endpoint Box */}
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Webhook Endpoint URL</span>
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold rounded text-[10px]">
                        POST
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800 break-all select-all">
                      <span>{window.location.origin}/api/v1/integrations/lead-intake/webhook</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500">Payload: application/json</span>
                      <button
                        onClick={handleCopyEndpoint}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                      >
                        {copiedEndpoint ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Secret Protection Status Box */}
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Authentication & Security</span>
                      {gatewayStatus?.webhookSecretConfigured ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Secret Enforced</span>
                        </span>
                      ) : gatewayStatus?.isProduction ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <ShieldAlert className="w-3 h-3 text-rose-600" />
                          <span>Fail-Closed (Prod)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Activity className="w-3 h-3 text-amber-600" />
                          <span>Sandbox Mode</span>
                        </span>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                      <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                        {gatewayStatus?.webhookSecretConfigured
                          ? 'HMAC-SHA256 signatures & secret token headers active.'
                          : gatewayStatus?.isProduction
                          ? 'LEAD_WEBHOOK_SECRET not configured in production. Webhooks fail closed.'
                          : 'Development mode active. Requests accepted without secret for testing.'}
                      </p>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Supported headers: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">x-lead-webhook-secret</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">x-hub-signature-256</code>, or Bearer auth.
                      </p>
                    </div>

                    <p className="text-[10px] text-slate-500 italic flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>For platform security, webhook secrets and HMAC keys are never exposed in the UI.</span>
                    </p>
                  </div>
                </div>

                {/* Handshake & Deduplication Safeguards Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100">
                    <span className="font-semibold text-indigo-900 block mb-1">
                      Meta Webhook Verification (Handshake)
                    </span>
                    <p className="text-[11px] text-indigo-800 leading-relaxed">
                      Supports <code className="bg-indigo-100/70 px-1 py-0.5 rounded font-mono text-[10px]">GET /webhook</code> handshake verification with <code className="bg-indigo-100/70 px-1 py-0.5 rounded font-mono text-[10px]">hub.mode=subscribe</code> and <code className="bg-indigo-100/70 px-1 py-0.5 rounded font-mono text-[10px]">hub.challenge</code> matching configured secret.
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-200/60">
                    <span className="font-semibold text-amber-900 block mb-1">
                      Durable 24-Hour Deduplication Safeguard
                    </span>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Submissions with matching <code className="bg-amber-100/70 px-1 py-0.5 rounded font-mono text-[10px]">idempotency_key</code> or same normalized phone + service within 24h are safely deduplicated without creating new leads or consuming daily campaign slots.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: Channel Metrics Summary */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Channel Volumes & Gateway Performance
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">Meta Ads</span>
                    <p className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                      {gatewayStatus?.channels.meta ?? 0}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">Google Ads</span>
                    <p className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                      {gatewayStatus?.channels.google ?? 0}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">Landing Pages</span>
                    <p className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                      {gatewayStatus?.channels.landingPage ?? 0}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">Other Sources</span>
                    <p className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                      {gatewayStatus?.channels.other ?? 0}
                    </p>
                  </div>
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                    <span className="text-[10px] text-indigo-700 font-medium">Unique Ingested</span>
                    <p className="text-lg font-bold text-indigo-900 font-mono mt-0.5">
                      {gatewayStatus?.totalUniqueLeadsIngested ?? 0}
                    </p>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-amber-800 font-medium">Duplicates Prevented</span>
                    <p className="text-lg font-bold text-amber-900 font-mono mt-0.5">
                      {gatewayStatus?.duplicateAttemptsPrevented ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 3: Recent Webhook Intake Activity & Duplicate Prevention Results */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Recent Ingestion Activity & Deduplication Log
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Real-time stream of incoming webhook submissions, duplicate interceptions, and routing outcomes.
                    </p>
                  </div>

                  {/* Activity Filter Buttons */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    {[
                      { id: 'all', label: `All (${gatewayStatus?.recentActivity?.length || 0})` },
                      {
                        id: 'processed',
                        label: `Processed (${gatewayStatus?.recentActivity?.filter((a) => !a.isDuplicate).length || 0})`,
                      },
                      {
                        id: 'duplicate',
                        label: `Duplicates (${gatewayStatus?.recentActivity?.filter((a) => a.isDuplicate).length || 0})`,
                      },
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => setActivityFilter(btn.id as any)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                          activityFilter === btn.id
                            ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity List / Table */}
                {(() => {
                  const activities = (gatewayStatus?.recentActivity || []).filter((item) => {
                    if (activityFilter === 'processed') return !item.isDuplicate;
                    if (activityFilter === 'duplicate') return item.isDuplicate;
                    return true;
                  });

                  if (activities.length === 0) {
                    return (
                      <div className="bg-slate-50/70 p-8 rounded-xl border border-slate-200 text-center text-slate-400">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                        <p className="font-semibold text-slate-600">No Webhook Intake Activity Yet</p>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                          External lead submissions from Meta Webhooks, Google Ads forms, or landing pages will be logged here with timestamps, normalized fields, and duplicate prevention outcomes.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                            <tr>
                              <th className="py-2.5 px-3">Timestamp</th>
                              <th className="py-2.5 px-3">Channel & Ref</th>
                              <th className="py-2.5 px-3">Contact (Masked)</th>
                              <th className="py-2.5 px-3">Requested Service</th>
                              <th className="py-2.5 px-3 text-center">Outcome</th>
                              <th className="py-2.5 px-3 text-right">Idempotency Key</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activities.map((act) => (
                              <tr
                                key={act.id}
                                className={`hover:bg-slate-50/60 ${
                                  act.isDuplicate ? 'bg-amber-50/20' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <p className="font-medium text-slate-900">
                                    {new Date(act.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {new Date(act.timestamp).toLocaleDateString()}
                                  </p>
                                </td>

                                <td className="py-2.5 px-3">
                                  <div className="flex flex-col items-start gap-0.5">
                                    {getSourceBadge(act.source, null)}
                                    {act.sourceReference && (
                                      <span
                                        className="text-[10px] font-mono text-slate-500 truncate max-w-[130px]"
                                        title={act.sourceReference}
                                      >
                                        ref: {act.sourceReference}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-2.5 px-3">
                                  <p className="font-semibold text-slate-800">{act.customerName}</p>
                                  <p className="font-mono text-[11px] text-slate-500">
                                    {act.customerPhoneMasked}
                                  </p>
                                </td>

                                <td className="py-2.5 px-3">
                                  <span className="font-mono font-semibold text-slate-800 px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">
                                    {act.serviceCode}
                                  </span>
                                  <p className="text-[10px] text-slate-500 truncate max-w-[140px] mt-0.5">
                                    {act.serviceName}
                                  </p>
                                </td>

                                <td className="py-2.5 px-3 text-center">
                                  {act.isDuplicate ? (
                                    <div className="inline-flex flex-col items-center">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                        <ShieldCheck className="w-2.5 h-2.5 text-amber-600" />
                                        <span>Duplicate Prevented</span>
                                      </span>
                                      {act.leadNumber && (
                                        <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                                          Original: {act.leadNumber}
                                        </span>
                                      )}
                                      {act.duplicateReason && (
                                        <span
                                          className="text-[9px] text-amber-700/80 max-w-[160px] truncate mt-0.5"
                                          title={act.duplicateReason}
                                        >
                                          {act.duplicateReason}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="inline-flex flex-col items-center">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                        <span>Ingested & Routed</span>
                                      </span>
                                      {act.leadNumber && (
                                        <span className="text-[10px] font-mono text-slate-600 font-semibold mt-0.5">
                                          {act.leadNumber}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 text-right">
                                  <span
                                    className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded max-w-[150px] inline-block truncate"
                                    title={act.idempotencyKey}
                                  >
                                    {act.idempotencyKey}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Observability data refreshed automatically upon webhook events.
              </span>
              <button
                onClick={() => setShowGatewayModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Close Gateway Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
