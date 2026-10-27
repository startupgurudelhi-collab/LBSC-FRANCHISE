import React, { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
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
  Building,
  User,
  MapPin,
  Users,
  Send,
  Sparkles,
  History,
  ShieldAlert,
  ArrowRight,
  MessageSquare,
  Lock,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type {
  AdvertisementRequest,
  AdvertisementRequestHistory,
  AdvertisementRequestStatus,
  AdvertisementRequestSummary,
  ServiceMaster,
} from '../../types';

interface FranchiseOption {
  id: string;
  name: string;
  code?: string;
}

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

export const AdminAdvertisementRequestsView: React.FC = () => {
  const [requests, setRequests] = useState<AdvertisementRequest[]>([]);
  const [summary, setSummary] = useState<AdvertisementRequestSummary | null>(null);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [franchiseFilter, setFranchiseFilter] = useState('ALL');

  // Selected Request Modal
  const [selectedRequest, setSelectedRequest] = useState<AdvertisementRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [requestHistory, setRequestHistory] = useState<AdvertisementRequestHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Admin Actions State
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Review Modal / Notes
  const [reviewNotes, setReviewNotes] = useState('');

  // Approve Modal / Notes
  const [approveAdminNotes, setApproveAdminNotes] = useState('');
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  // Reject Modal / Reason
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectAdminNotes, setRejectAdminNotes] = useState('');

  // Lifecycle Status Modal
  const [lifecycleNotes, setLifecycleNotes] = useState('');

  // Internal Admin Note Form State
  const [newAdminNote, setNewAdminNote] = useState('');
  const [isAddingAdminNote, setIsAddingAdminNote] = useState(false);

  // Fetch Requests List
  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, any> = { limit: 100 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (typeFilter !== 'ALL') params.advertising_type = typeFilter;
      if (serviceFilter !== 'ALL') params.service_id = serviceFilter;
      if (franchiseFilter !== 'ALL') params.franchise_id = franchiseFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const [listRes, summaryRes] = await Promise.all([
        ApiClient.getAdvertisementRequests(params),
        ApiClient.getAdvertisementRequestSummary().catch(() => ({ data: null })),
      ]);

      if (listRes?.data) setRequests(listRes.data);
      if (summaryRes?.data) setSummary(summaryRes.data);
    } catch (err: any) {
      console.error('Failed to load advertisement requests in Admin:', err);
      setError(err?.message || 'Failed to load advertisement requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, serviceFilter, franchiseFilter, searchTerm]);

  // Initial Data
  useEffect(() => {
    fetchRequests();

    // Services
    ApiClient.getServices()
      .then((res: any) => {
        if (res?.data) setServices(res.data);
      })
      .catch(() => {});

    // Franchises
    ApiClient.getFranchises()
      .then((res: any) => {
        if (res?.data && Array.isArray(res.data)) {
          const list = res.data.map((f: any) => ({
            id: f.organization_id || f.id,
            name: f.business_name || f.operating_name || f.name,
            code: f.franchise_code,
          }));
          setFranchises(list);
        }
      })
      .catch(() => {});
  }, [fetchRequests]);

  // Open Details Modal with fresh data & full history
  const openDetailsModal = async (req: AdvertisementRequest) => {
    setSelectedRequest(req);
    setShowDetailsModal(true);
    setLoadingHistory(true);
    setRequestHistory([]);
    setActionError(null);
    setActionSuccess(null);
    setNewAdminNote('');
    setShowApproveConfirm(false);
    setShowRejectModal(false);

    try {
      const [freshReq, histRes] = await Promise.all([
        ApiClient.getAdvertisementRequestById(req.id).catch(() => ({ data: req })),
        ApiClient.getAdvertisementRequestHistory(req.id).catch(() => ({ data: [] })),
      ]);
      if (freshReq?.data) setSelectedRequest(freshReq.data);
      if (histRes?.data) setRequestHistory(histRes.data);
    } catch (err) {
      console.error('Error fetching admin request details:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Reload history helper
  const reloadHistory = async (reqId: string) => {
    try {
      const [freshReq, histRes] = await Promise.all([
        ApiClient.getAdvertisementRequestById(reqId),
        ApiClient.getAdvertisementRequestHistory(reqId),
      ]);
      if (freshReq?.data) setSelectedRequest(freshReq.data);
      if (histRes?.data) setRequestHistory(histRes.data);
    } catch (err) {
      console.error('Failed to reload history:', err);
    }
  };

  // 1. Move to Under Review
  const handleMoveToUnderReview = async () => {
    if (!selectedRequest) return;
    try {
      setIsProcessingAction(true);
      setActionError(null);
      await ApiClient.reviewAdvertisementRequest(selectedRequest.id, reviewNotes.trim() || undefined);
      setActionSuccess('Advertisement request moved to Under Review');
      setReviewNotes('');
      await reloadHistory(selectedRequest.id);
      fetchRequests();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to move request to Under Review');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 2. Approve Request
  const handleApprove = async () => {
    if (!selectedRequest) return;
    try {
      setIsProcessingAction(true);
      setActionError(null);
      await ApiClient.approveAdvertisementRequest(selectedRequest.id, approveAdminNotes.trim() || undefined);
      setActionSuccess('Advertisement request approved successfully');
      setApproveAdminNotes('');
      setShowApproveConfirm(false);
      await reloadHistory(selectedRequest.id);
      fetchRequests();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to approve advertisement request');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 3. Reject Request
  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!rejectionReason.trim()) {
      setActionError('Rejection reason is required');
      return;
    }

    try {
      setIsProcessingAction(true);
      setActionError(null);
      await ApiClient.rejectAdvertisementRequest(
        selectedRequest.id,
        rejectionReason.trim(),
        rejectAdminNotes.trim() || undefined
      );
      setActionSuccess('Advertisement request rejected');
      setRejectionReason('');
      setRejectAdminNotes('');
      setShowRejectModal(false);
      await reloadHistory(selectedRequest.id);
      fetchRequests();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reject advertisement request');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 4. Update Lifecycle Status (Approved -> In Progress, In Progress -> Completed)
  const handleUpdateStatus = async (status: 'IN_PROGRESS' | 'COMPLETED') => {
    if (!selectedRequest) return;
    try {
      setIsProcessingAction(true);
      setActionError(null);
      await ApiClient.updateAdvertisementRequestStatus(
        selectedRequest.id,
        status,
        lifecycleNotes.trim() || undefined
      );
      setActionSuccess(`Advertisement request marked as ${status.replace(/_/g, ' ')}`);
      setLifecycleNotes('');
      await reloadHistory(selectedRequest.id);
      fetchRequests();
    } catch (err: any) {
      setActionError(err?.message || `Failed to update status to ${status}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 5. Add Internal Admin Note
  const handleAddAdminNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !newAdminNote.trim()) return;

    try {
      setIsAddingAdminNote(true);
      setActionError(null);
      await ApiClient.addAdvertisementRequestAdminNote(selectedRequest.id, newAdminNote.trim());
      setNewAdminNote('');
      setActionSuccess('Internal admin note saved to audit record');
      await reloadHistory(selectedRequest.id);
      fetchRequests();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save admin note');
    } finally {
      setIsAddingAdminNote(false);
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
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-slate-900 text-amber-400 rounded-xl flex items-center justify-center shadow-sm font-bold">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Advertisement Requests Queue
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  Headquarters Review
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Review, evaluate, and clear promotional proposals from network franchises. Maintain internal admin
                notes, enforce compliance, and transition approved campaigns into active fulfillment.
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-2xs disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
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
                Total Queue
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

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col lg:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, franchise name, request number, or area..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-hidden text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Franchise Filter */}
          <div className="flex items-center gap-1 shrink-0">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={franchiseFilter}
              onChange={(e) => setFranchiseFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-amber-500 max-w-[170px] truncate"
            >
              <option value="ALL">All Franchises</option>
              {franchises.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.code ? `(${f.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-amber-500"
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

          {/* Advertising Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-amber-500"
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
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-2 px-2.5 focus:outline-hidden focus:border-amber-500 max-w-[150px] truncate"
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

      {/* Queue Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-2" />
            <p className="text-xs font-medium">Loading advertisement queue...</p>
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
          <div className="p-12 text-center text-slate-400">
            <Megaphone className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">No advertisement requests found in queue</p>
            <p className="text-[11px] text-slate-400 mt-1">Try adjusting your active search terms or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Request # & Date</th>
                  <th className="py-3 px-4">Franchise Unit</th>
                  <th className="py-3 px-4">Campaign Title & Type</th>
                  <th className="py-3 px-4">Service & Target</th>
                  <th className="py-3 px-4">Status & Action</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      req.status === 'PENDING' ? 'bg-amber-50/20' : req.status === 'REJECTED' ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    {/* Request # & Date */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono font-semibold text-slate-900">{req.request_number}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Franchise Info */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="line-clamp-1">{req.franchise_name || 'Franchise Partner'}</span>
                      </div>
                      {req.created_by_name && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" />
                          <span>{req.created_by_name}</span>
                        </div>
                      )}
                    </td>

                    {/* Title & Type */}
                    <td className="py-3.5 px-4 align-top max-w-[240px]">
                      <div className="font-semibold text-slate-800 line-clamp-1">{req.title}</div>
                      <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                        {formatAdvertisingType(req.advertising_type)}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{req.description}</div>
                    </td>

                    {/* Service & Territory */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-medium text-slate-800 line-clamp-1">
                        {req.service_name || 'General Promotion'}
                      </div>
                      {req.target_location && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{req.target_location}</span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 align-top">
                      <div>{getStatusBadge(req.status)}</div>
                      {req.status === 'REJECTED' && req.rejection_reason && (
                        <div className="text-[10px] text-rose-700 font-medium truncate max-w-[180px] mt-1">
                          Reason: {req.rejection_reason}
                        </div>
                      )}
                      {req.admin_notes && (
                        <div className="text-[10px] text-amber-700 font-mono flex items-center gap-1 mt-1 truncate max-w-[180px]">
                          <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                          <span>Admin note recorded</span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right align-top">
                      <button
                        onClick={() => openDetailsModal(req)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Manage & Review
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
      {/* SUPER ADMIN REVIEW & DETAILS MODAL                         */}
      {/* ========================================================= */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {selectedRequest.request_number}
                    </span>
                    {getStatusBadge(selectedRequest.status)}
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200/80 text-slate-700">
                      {selectedRequest.franchise_name}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">{selectedRequest.title}</h3>
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
              {/* Feedback messages */}
              {actionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{actionSuccess}</span>
                </div>
              )}
              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Core Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Advertising Channel</span>
                  <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                    {formatAdvertisingType(selectedRequest.advertising_type)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Service Master</span>
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
                  <span className="text-slate-400 text-[11px] block uppercase font-semibold">Submission Date</span>
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
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      Franchise Remarks
                    </h4>
                    <p className="text-slate-700 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed whitespace-pre-wrap">
                      {selectedRequest.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Rejection Alert (if rejected) */}
              {selectedRequest.status === 'REJECTED' && selectedRequest.rejection_reason && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="flex items-center gap-2 text-rose-800 font-bold mb-1">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Rejection Reason</span>
                  </div>
                  <p className="text-rose-700">{selectedRequest.rejection_reason}</p>
                </div>
              )}

              {/* ========================================================= */}
              {/* SUPER ADMIN WORKFLOW & LIFECYCLE CONTROLS                 */}
              {/* ========================================================= */}
              <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-700" />
                    Headquarters Lifecycle Actions
                  </h4>
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    Super Admin Controls
                  </span>
                </div>

                {/* 1. Action when PENDING -> Move to Under Review */}
                {selectedRequest.status === 'PENDING' && (
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <input
                      type="text"
                      placeholder="Optional review notes (e.g. Clearance initiated with local municipal vendor)..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-amber-500"
                    />
                    <button
                      onClick={handleMoveToUnderReview}
                      disabled={isProcessingAction}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-xs transition-colors shrink-0 disabled:opacity-60 flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Move to Under Review
                    </button>
                  </div>
                )}

                {/* 2. Actions when UNDER_REVIEW (or PENDING) -> Approve or Reject */}
                {(selectedRequest.status === 'UNDER_REVIEW' || selectedRequest.status === 'PENDING') && (
                  <div className="flex flex-wrap items-center gap-3">
                    {!showApproveConfirm && !showRejectModal && (
                      <>
                        <button
                          onClick={() => setShowApproveConfirm(true)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve Request
                        </button>
                        <button
                          onClick={() => setShowRejectModal(true)}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject Request...
                        </button>
                      </>
                    )}

                    {/* Approve Confirmation Sub-form */}
                    {showApproveConfirm && (
                      <div className="w-full bg-white p-3.5 rounded-lg border border-emerald-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-800">Confirm Proposal Approval</span>
                          <button
                            onClick={() => setShowApproveConfirm(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Optional internal admin notes regarding approval terms..."
                          value={approveAdminNotes}
                          onChange={(e) => setApproveAdminNotes(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowApproveConfirm(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleApprove}
                            disabled={isProcessingAction}
                            className="px-3.5 py-1.5 text-xs bg-emerald-600 text-white font-semibold rounded hover:bg-emerald-700 flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm Approval
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Reject Confirmation Sub-form */}
                    {showRejectModal && (
                      <div className="w-full bg-white p-3.5 rounded-lg border border-rose-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-800">Reject Advertisement Request</span>
                          <button
                            onClick={() => setShowRejectModal(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Rejection Reason (Visible to Franchise) <span className="text-rose-500">*</span>
                          </label>
                          <textarea
                            rows={2}
                            required
                            placeholder="Provide reason for rejection (mandatory)..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Internal Admin Notes (HQ Only)
                          </label>
                          <input
                            type="text"
                            placeholder="Optional internal remarks..."
                            value={rejectAdminNotes}
                            onChange={(e) => setRejectAdminNotes(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowRejectModal(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleReject}
                            disabled={isProcessingAction || !rejectionReason.trim()}
                            className="px-3.5 py-1.5 text-xs bg-rose-600 text-white font-semibold rounded hover:bg-rose-700 flex items-center gap-1 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Confirm Rejection
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Action when APPROVED -> Move to IN_PROGRESS */}
                {selectedRequest.status === 'APPROVED' && (
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <input
                      type="text"
                      placeholder="Optional notes regarding printing/launch commencement..."
                      value={lifecycleNotes}
                      onChange={(e) => setLifecycleNotes(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                    <button
                      onClick={() => handleUpdateStatus('IN_PROGRESS')}
                      disabled={isProcessingAction}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1.5"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Move to In Progress
                    </button>
                  </div>
                )}

                {/* 4. Action when IN_PROGRESS -> Move to COMPLETED */}
                {selectedRequest.status === 'IN_PROGRESS' && (
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <input
                      type="text"
                      placeholder="Optional completion remarks / campaign wrap-up summary..."
                      value={lifecycleNotes}
                      onChange={(e) => setLifecycleNotes(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                    <button
                      onClick={() => handleUpdateStatus('COMPLETED')}
                      disabled={isProcessingAction}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Completed
                    </button>
                  </div>
                )}

                {selectedRequest.status === 'COMPLETED' && (
                  <p className="text-teal-700 font-semibold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    This campaign is completed and fulfilled.
                  </p>
                )}
              </div>

              {/* ========================================================= */}
              {/* INTERNAL ADMIN NOTES (SUPER ADMIN ONLY)                   */}
              {/* ========================================================= */}
              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold uppercase tracking-wider text-[11px] text-amber-300">
                      Internal Admin Notes (HQ Only)
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Strictly Private</span>
                </div>

                {selectedRequest.admin_notes && (
                  <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 text-slate-200 leading-relaxed font-mono text-[11px]">
                    {selectedRequest.admin_notes}
                  </div>
                )}

                {/* Add Admin Note Input */}
                <form onSubmit={handleAddAdminNote} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    required
                    placeholder="Append an internal admin note (e.g. Budget ceiling clearance approved, vendor quote: ₹25,000)..."
                    value={newAdminNote}
                    onChange={(e) => setNewAdminNote(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={isAddingAdminNote || !newAdminNote.trim()}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isAddingAdminNote ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Save Note</span>
                  </button>
                </form>
              </div>

              {/* ========================================================= */}
              {/* AUDIT HISTORY TRAIL (SUPER ADMIN FULL VIEW)               */}
              {/* ========================================================= */}
              <div>
                <div className="flex items-center justify-between mb-3 pt-4 border-t border-slate-100">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-indigo-600" />
                    Full Audit History & Trail
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">Headquarters Log</span>
                </div>

                {loadingHistory ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-amber-500 mb-1" />
                    <p className="text-[11px]">Loading audit trail...</p>
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
                            h.action_type === 'admin_note'
                              ? 'bg-amber-100 text-amber-800 ring-2 ring-white'
                              : h.action_type === 'approved'
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
                          {h.action_type === 'admin_note' ? (
                            <Lock className="w-2.5 h-2.5" />
                          ) : h.action_type === 'approved' ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : h.action_type === 'rejected' ? (
                            <XCircle className="w-2.5 h-2.5" />
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                        </div>

                        <div className="flex-1 bg-slate-50/80 border border-slate-200/80 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 capitalize">
                                {h.action_type.replace(/_/g, ' ')}
                              </span>
                              {h.action_type === 'admin_note' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                  Internal HQ
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                          {h.author_name && (
                            <div className="text-[10px] text-slate-500">
                              By: <span className="font-medium text-slate-700">{h.author_name}</span>{' '}
                              {h.author_role ? `(${h.author_role})` : ''}
                            </div>
                          )}
                          {h.note && (
                            <p
                              className={`text-[11px] ${
                                h.action_type === 'admin_note' ? 'text-amber-900 font-mono bg-amber-50 p-2 rounded' : 'text-slate-600'
                              }`}
                            >
                              {h.note}
                            </p>
                          )}
                          {h.new_status && (
                            <div className="text-[10px] text-slate-500 font-medium">
                              Transition: {h.previous_status || 'INIT'} <ArrowRight className="w-2.5 h-2.5 inline" />{' '}
                              <span className="font-semibold text-slate-800">{h.new_status}</span>
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
