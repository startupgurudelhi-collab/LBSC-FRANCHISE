import React, { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Calendar,
  Layers,
  MapPin,
  Users,
  Info,
  History,
  Send,
  Sparkles,
} from 'lucide-react';
import { ApiClient } from '../api';
import type {
  AdvertisementRequest,
  AdvertisementRequestHistory,
  AdvertisementRequestStatus,
  AdvertisementRequestSummary,
  CreateAdvertisementRequestPayload,
  ServiceMaster,
} from '../types';

const ADVERTISING_TYPE_OPTIONS = [
  { value: 'local_hoarding', label: 'Local Hoarding / Outdoor Billboard' },
  { value: 'digital_display', label: 'Digital Display / Transit Screens' },
  { value: 'social_media', label: 'Social Media Organic Campaigns' },
  { value: 'meta_ads', label: 'Meta Ads (Facebook & Instagram)' },
  { value: 'google_search', label: 'Google Search & Maps Ads' },
  { value: 'print_newspaper', label: 'Print Newspaper & Regional Press' },
  { value: 'flyers_brochures', label: 'Flyers & Pamphlets Distribution' },
  { value: 'radio_fm', label: 'Radio FM Jingles & Broadcast' },
  { value: 'other', label: 'Other Custom Advertisement' },
];

export const AdvertisementRequestsView: React.FC = () => {
  const [requests, setRequests] = useState<AdvertisementRequest[]>([]);
  const [summary, setSummary] = useState<AdvertisementRequestSummary | null>(null);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [serviceFilter, setServiceFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AdvertisementRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [requestHistory, setRequestHistory] = useState<AdvertisementRequestHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Create Form State
  const [createForm, setCreateForm] = useState<CreateAdvertisementRequestPayload>({
    title: '',
    description: '',
    advertising_type: 'local_hoarding',
    service_id: '',
    target_audience: '',
    target_location: '',
    preferred_timeline: '',
    notes: '',
    reference_details: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch Requests List
  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, any> = { limit: 100 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (typeFilter !== 'ALL') params.advertising_type = typeFilter;
      if (serviceFilter !== 'ALL') params.service_id = serviceFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const [listRes, summaryRes] = await Promise.all([
        ApiClient.getAdvertisementRequests(params),
        ApiClient.getAdvertisementRequestSummary().catch(() => ({ data: null })),
      ]);

      if (listRes?.data) setRequests(listRes.data);
      if (summaryRes?.data) setSummary(summaryRes.data);
    } catch (err: any) {
      console.error('Failed to load advertisement requests:', err);
      setError(err?.message || 'Failed to load advertisement requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, serviceFilter, searchTerm]);

  // Initial load
  useEffect(() => {
    fetchRequests();
    // Load services for dropdown
    ApiClient.getServices()
      .then((res: any) => {
        if (res?.data) setServices(res.data);
      })
      .catch(() => {});
  }, [fetchRequests]);

  // View Details and History Modal
  const openDetailsModal = async (req: AdvertisementRequest) => {
    setSelectedRequest(req);
    setShowDetailsModal(true);
    setLoadingHistory(true);
    setRequestHistory([]);

    try {
      const [freshReq, histRes] = await Promise.all([
        ApiClient.getAdvertisementRequestById(req.id).catch(() => ({ data: req })),
        ApiClient.getAdvertisementRequestHistory(req.id).catch(() => ({ data: [] })),
      ]);
      if (freshReq?.data) setSelectedRequest(freshReq.data);
      if (histRes?.data) setRequestHistory(histRes.data);
    } catch (err) {
      console.error('Error fetching request history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Submit Create Form
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setFormError('Request title is required');
      return;
    }
    if (!createForm.description.trim()) {
      setFormError('Description is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload: CreateAdvertisementRequestPayload = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        advertising_type: createForm.advertising_type,
        service_id: createForm.service_id || null,
        target_audience: createForm.target_audience?.trim() || null,
        target_location: createForm.target_location?.trim() || null,
        preferred_timeline: createForm.preferred_timeline?.trim() || null,
        notes: createForm.notes?.trim() || null,
        reference_details: createForm.reference_details?.trim() || null,
      };

      const res = await ApiClient.createAdvertisementRequest(payload);
      if (res?.data) {
        setShowCreateModal(false);
        // Reset form
        setCreateForm({
          title: '',
          description: '',
          advertising_type: 'local_hoarding',
          service_id: '',
          target_audience: '',
          target_location: '',
          preferred_timeline: '',
          notes: '',
          reference_details: '',
        });
        fetchRequests();
        openDetailsModal(res.data);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit advertisement request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: AdvertisementRequestStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            Pending Review
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Eye className="w-3 h-3 text-sky-600 animate-pulse" />
            Under Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Approved
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-3 h-3 text-indigo-600 animate-spin" />
            In Progress
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <CheckCircle2 className="w-3 h-3 text-teal-600" />
            Completed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const formatAdvertisingType = (type: string) => {
    const found = ADVERTISING_TYPE_OPTIONS.find((o) => o.value === type);
    return found ? found.label : type.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-sm">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Advertisement Requests</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Phase 17
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Submit local advertising and promotional proposals to LBSC Headquarters. Track real-time review status,
                approval clearances, and active campaign fulfillment.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                setRefreshing(true);
                fetchRequests();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-2xs disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                setFormError(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Ad Request
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-6 pt-5 border-t border-slate-100">
            <div
              onClick={() => setStatusFilter('ALL')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/80 text-slate-700'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.total}</p>
            </div>

            <div
              onClick={() => setStatusFilter('PENDING')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'PENDING'
                  ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                  : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/80 text-slate-700'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'PENDING' ? 'text-slate-300' : 'text-slate-500'}`}>
                Pending
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.pending}</p>
            </div>

            <div
              onClick={() => setStatusFilter('UNDER_REVIEW')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'UNDER_REVIEW'
                  ? 'bg-sky-700 text-white border-sky-700 shadow-sm'
                  : 'bg-sky-50/50 border-sky-100 hover:bg-sky-100/60 text-sky-800'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'UNDER_REVIEW' ? 'text-sky-200' : 'text-sky-600'}`}>
                In Review
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.under_review}</p>
            </div>

            <div
              onClick={() => setStatusFilter('APPROVED')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'APPROVED'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                  : 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-100/60 text-emerald-800'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'APPROVED' ? 'text-emerald-200' : 'text-emerald-600'}`}>
                Approved
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.approved}</p>
            </div>

            <div
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-indigo-700 text-white border-indigo-700 shadow-sm'
                  : 'bg-indigo-50/50 border-indigo-100 hover:bg-indigo-100/60 text-indigo-800'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'IN_PROGRESS' ? 'text-indigo-200' : 'text-indigo-600'}`}>
                Active
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.in_progress}</p>
            </div>

            <div
              onClick={() => setStatusFilter('COMPLETED')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'COMPLETED'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                  : 'bg-teal-50/50 border-teal-100 hover:bg-teal-100/60 text-teal-800'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'COMPLETED' ? 'text-teal-200' : 'text-teal-600'}`}>
                Completed
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.completed}</p>
            </div>

            <div
              onClick={() => setStatusFilter('REJECTED')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'REJECTED'
                  ? 'bg-rose-700 text-white border-rose-700 shadow-sm'
                  : 'bg-rose-50/50 border-rose-100 hover:bg-rose-100/60 text-rose-800'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'REJECTED' ? 'text-rose-200' : 'text-rose-600'}`}>
                Rejected
              </p>
              <p className="text-xl font-bold mt-0.5">{summary.rejected}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, description, ADR number, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="ALL">All Channels</option>
            {ADVERTISING_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Service Filter */}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-indigo-500 max-w-[160px] truncate"
          >
            <option value="ALL">All Services</option>
            {services.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-2" />
            <p className="text-xs font-medium">Loading advertisement requests...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 bg-rose-50/50">
            <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-rose-500" />
            <p className="text-xs font-semibold">{error}</p>
            <button
              onClick={fetchRequests}
              className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
            >
              Retry
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Megaphone className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No advertisement requests found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'ALL' || typeFilter !== 'ALL' || serviceFilter !== 'ALL'
                ? 'Try adjusting your search criteria or active filters.'
                : 'You have not submitted any advertisement requests yet. Click "New Ad Request" to submit one.'}
            </p>
            <button
              onClick={() => {
                setFormError(null);
                setShowCreateModal(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Create First Request
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Request # & Date</th>
                  <th className="py-3 px-4">Campaign Title & Type</th>
                  <th className="py-3 px-4">Linked Service</th>
                  <th className="py-3 px-4">Territory / Audience</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      req.status === 'REJECTED' ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    {/* Number & Date */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono font-semibold text-slate-900">{req.request_number}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Title & Type */}
                    <td className="py-3.5 px-4 align-top max-w-[260px]">
                      <div className="font-semibold text-slate-800 line-clamp-1">{req.title}</div>
                      <div className="text-[11px] text-indigo-600 font-medium mt-0.5">
                        {formatAdvertisingType(req.advertising_type)}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">{req.description}</div>
                    </td>

                    {/* Linked Service */}
                    <td className="py-3.5 px-4 align-top">
                      {req.service_name ? (
                        <div>
                          <span className="font-medium text-slate-800 line-clamp-1">{req.service_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{req.service_code}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">General Promotion</span>
                      )}
                    </td>

                    {/* Target Territory & Audience */}
                    <td className="py-3.5 px-4 align-top max-w-[180px]">
                      {req.target_location && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-700">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{req.target_location}</span>
                        </div>
                      )}
                      {req.target_audience && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                          <Users className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{req.target_audience}</span>
                        </div>
                      )}
                    </td>

                    {/* Status & Rejection Notice */}
                    <td className="py-3.5 px-4 align-top">
                      <div>{getStatusBadge(req.status)}</div>
                      {req.status === 'REJECTED' && req.rejection_reason && (
                        <div className="text-[10px] text-rose-700 font-medium truncate max-w-[180px] mt-1 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                          Reason: {req.rejection_reason}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right align-top">
                      <button
                        onClick={() => openDetailsModal(req)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details & History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* CREATE ADVERTISEMENT REQUEST MODAL                        */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">New Advertisement Request</h3>
                  <p className="text-[11px] text-slate-500">
                    Submit advertising and promotional requirements to Headquarters.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Advertisement Campaign Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali Festive Corporate Tax & GST Hoarding Campaign"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Advertising Channel Type & Linked Service */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Advertising Channel <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={createForm.advertising_type}
                    onChange={(e) => setCreateForm({ ...createForm, advertising_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                  >
                    {ADVERTISING_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Related Service (Optional)
                  </label>
                  <select
                    value={createForm.service_id || ''}
                    onChange={(e) => setCreateForm({ ...createForm, service_id: e.target.value || null })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden truncate"
                  >
                    <option value="">-- General Franchise Promotion --</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} ({svc.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Campaign Description & Requirements <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail campaign objectives, specific messaging, placement requirements, and target metrics..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Target Location & Audience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Location / Area
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Salem City Center, Commercial Street, NH-44"
                    value={createForm.target_location || ''}
                    onChange={(e) => setCreateForm({ ...createForm, target_location: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Audience / Segment
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Local MSME owners, manufacturers, partnership firms"
                    value={createForm.target_audience || ''}
                    onChange={(e) => setCreateForm({ ...createForm, target_audience: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Timeline & Reference Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preferred Timeline / Duration
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 15 Oct 2026 - 15 Nov 2026 (30 Days)"
                    value={createForm.preferred_timeline || ''}
                    onChange={(e) => setCreateForm({ ...createForm, preferred_timeline: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference Assets / Dimensions
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 20x10 ft billboard, Google Drive asset link, etc."
                    value={createForm.reference_details || ''}
                    onChange={(e) => setCreateForm({ ...createForm, reference_details: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Notes for Headquarters
                </label>
                <textarea
                  rows={2}
                  placeholder="Any special remarks, municipal clearances, regional language requirements..."
                  value={createForm.notes || ''}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Submit Advertisement Request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DETAILS & LIFECYCLE HISTORY MODAL                         */}
      {/* ========================================================= */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {selectedRequest.request_number}
                    </span>
                    {getStatusBadge(selectedRequest.status)}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5">{selectedRequest.title}</h3>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Rejection Alert Banner (if applicable) */}
              {selectedRequest.status === 'REJECTED' && selectedRequest.rejection_reason && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-900 text-xs">Advertisement Request Rejected</h4>
                    <p className="text-xs text-rose-700 mt-1">{selectedRequest.rejection_reason}</p>
                    {selectedRequest.rejected_at && (
                      <p className="text-[10px] text-rose-500 mt-1.5">
                        Rejected on {new Date(selectedRequest.rejected_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Core Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Advertising Channel</span>
                  <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                    {formatAdvertisingType(selectedRequest.advertising_type)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Associated Service</span>
                  <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                    {selectedRequest.service_name || 'General Promotion'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Target Territory</span>
                  <span className="font-medium text-slate-700 text-xs mt-0.5 block">
                    {selectedRequest.target_location || 'Not Specified'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Target Audience</span>
                  <span className="font-medium text-slate-700 text-xs mt-0.5 block">
                    {selectedRequest.target_audience || 'Not Specified'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Preferred Timeline</span>
                  <span className="font-medium text-slate-700 text-xs mt-0.5 block">
                    {selectedRequest.preferred_timeline || 'Flexible'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Created Date</span>
                  <span className="font-medium text-slate-700 text-xs mt-0.5 block">
                    {new Date(selectedRequest.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Description & Reference Details */}
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    Campaign Description
                  </h4>
                  <p className="text-slate-700 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed whitespace-pre-wrap">
                    {selectedRequest.description}
                  </p>
                </div>

                {selectedRequest.reference_details && (
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Reference Assets & Specifications
                    </h4>
                    <p className="text-slate-700 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed whitespace-pre-wrap font-mono text-[11px]">
                      {selectedRequest.reference_details}
                    </p>
                  </div>
                )}

                {selectedRequest.notes && (
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-500" />
                      Franchise Submission Notes
                    </h4>
                    <p className="text-slate-700 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed whitespace-pre-wrap">
                      {selectedRequest.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Lifecycle History Trail (Strictly sanitized - NO internal admin notes) */}
              <div>
                <div className="flex items-center justify-between mb-3 pt-4 border-t border-slate-100">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-indigo-600" />
                    Lifecycle & Status History
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">Audit Log</span>
                </div>

                {loadingHistory ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-indigo-500 mb-1" />
                    <p className="text-[11px]">Loading lifecycle history...</p>
                  </div>
                ) : requestHistory.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-lg">
                    No status history recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2.5 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-200">
                    {requestHistory.map((h) => (
                      <div key={h.id} className="relative flex items-start gap-3 pl-1">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10 text-[9px] font-bold ${
                            h.action_type === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 ring-2 ring-white'
                              : h.action_type === 'rejected'
                              ? 'bg-rose-100 text-rose-800 ring-2 ring-white'
                              : h.action_type === 'under_review'
                              ? 'bg-sky-100 text-sky-800 ring-2 ring-white'
                              : h.action_type === 'completed'
                              ? 'bg-teal-100 text-teal-800 ring-2 ring-white'
                              : 'bg-indigo-100 text-indigo-800 ring-2 ring-white'
                          }`}
                        >
                          {h.action_type === 'approved' ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : h.action_type === 'rejected' ? (
                            <XCircle className="w-2.5 h-2.5" />
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                        </div>

                        <div className="flex-1 bg-slate-50/80 border border-slate-200/80 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 capitalize">
                              {h.action_type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                          {h.note && <p className="text-slate-600 text-[11px]">{h.note}</p>}
                          {h.new_status && (
                            <div className="text-[10px] text-slate-500 font-medium">
                              Status changed to: <span className="font-semibold text-slate-800">{h.new_status}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
