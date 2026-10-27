import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  RefreshCw,
  X,
  Upload,
  Download,
  FileText,
  User,
  Phone,
  Building,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Coins,
  Check,
  Send,
  Calendar,
  Layers,
  FileCheck,
  UserCheck,
  History,
  Flame,
  ArrowRightLeft,
  MessageSquare,
} from 'lucide-react';
import { ApiClient } from '../api';
import type {
  ServiceApplication,
  ServiceApplicationDocument,
  ServiceApplicationStatus,
  ServiceApplicationWorkNote,
  Client,
  ServiceMaster,
} from '../types';

interface ServiceApplicationsViewProps {
  onRefreshParent?: () => void;
  onNavigateToClients?: () => void;
}

export const ServiceApplicationsView: React.FC<ServiceApplicationsViewProps> = ({
  onRefreshParent,
  onNavigateToClients,
}) => {
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available metadata for dropdowns
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);

  // Work notes history for selected application
  const [workNotes, setWorkNotes] = useState<ServiceApplicationWorkNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ServiceApplication | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // New Application Form State
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [applicationPriority, setApplicationPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [applicationNotes, setApplicationNotes] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Document Upload State inside Details Modal
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Efilingg Gateway Mode (Phase 19B.3)
  const [gatewayMode, setGatewayMode] = useState<string | null>(null);

  // Fetch list of applications
  const fetchApplications = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, any> = { limit: 100 };
      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      if (serviceFilter !== 'ALL') {
        params.service_id = serviceFilter;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const res = await ApiClient.getServiceApplications(params);
      if (res?.data) {
        setApplications(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load service applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, serviceFilter, searchTerm]);

  // Initial load: Fetch applications, clients, and services
  useEffect(() => {
    fetchApplications();
    // Load clients
    ApiClient.getClients({ limit: 200 })
      .then((res: any) => {
        if (res?.data) setClients(res.data);
      })
      .catch(() => {});

    // Load services
    ApiClient.getServices()
      .then((res: any) => {
        if (res?.data) setServices(res.data);
      })
      .catch(() => {});

    // Check Efilingg Gateway status if accessible (Phase 19B.3)
    ApiClient.getEfilinggStatus()
      .then((res: any) => {
        if (res?.data?.mode) {
          setGatewayMode(res.data.mode);
        }
      })
      .catch(() => {});
  }, [fetchApplications]);

  // Open details modal and fetch fresh record with full documents & work notes
  const openDetailsModal = async (app: ServiceApplication) => {
    try {
      setSelectedApplication(app);
      setShowDetailsModal(true);
      setActionSuccess(null);
      setWorkNotes([]);
      setLoadingNotes(true);

      // Fetch fresh details with documents
      const freshPromise = ApiClient.getServiceApplicationById(app.id);
      // Fetch operational work history read-only
      const notesPromise = ApiClient.getServiceApplicationWorkNotes(app.id).catch(() => ({ data: [] }));

      const [freshRes, notesRes] = await Promise.all([freshPromise, notesPromise]);

      if (freshRes?.data) {
        setSelectedApplication(freshRes.data);
      }
      if (notesRes?.data) {
        setWorkNotes(notesRes.data);
      }
    } catch (err: any) {
      console.error('Failed to load application details or work notes:', err);
    } finally {
      setLoadingNotes(false);
    }
  };

  // Submit Application (DRAFT or ACTION_REQUIRED -> SUBMITTED)
  const handleSubmitApplication = async (appId: string) => {
    try {
      setActionLoading(true);
      setActionSuccess(null);
      const res = await ApiClient.submitServiceApplication(appId);
      if (res?.data) {
        setSelectedApplication(res.data);
        setActionSuccess('Application submitted successfully! Service fee & commission have been snapshotted.');
        fetchApplications();
        onRefreshParent?.();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to submit application');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Document Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docId: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedApplication) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds maximum allowed size of 15MB');
      return;
    }

    try {
      setUploadingDocId(docId);
      setActionSuccess(null);

      // Convert file to Base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          await ApiClient.uploadServiceApplicationDocument(selectedApplication.id, docId, {
            file_name: file.name,
            file_type: file.type || 'application/octet-stream',
            file_size: file.size,
            file_data: base64Data,
          });

          // Refresh details
          const fresh = await ApiClient.getServiceApplicationById(selectedApplication.id);
          if (fresh?.data) {
            setSelectedApplication(fresh.data);
          }
          setActionSuccess(`Document "${file.name}" uploaded successfully!`);
          fetchApplications();
        } catch (uploadErr: any) {
          alert(uploadErr?.message || 'Failed to upload document file');
        } finally {
          setUploadingDocId(null);
        }
      };
      reader.onerror = () => {
        alert('Failed to read file from disk');
        setUploadingDocId(null);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadingDocId(null);
      alert(err?.message || 'Failed to process document upload');
    }
  };

  // Create Application Form Submit
  const handleCreateApplication = async (submitNow: boolean) => {
    if (!selectedClientId) {
      setFormError('Please select a client from your client directory');
      return;
    }
    if (!selectedServiceId) {
      setFormError('Please select a service from the catalog');
      return;
    }

    try {
      setIsSubmittingForm(true);
      setFormError(null);

      const payload = {
        client_id: selectedClientId,
        service_id: selectedServiceId,
        status: (submitNow ? 'SUBMITTED' : 'DRAFT') as 'DRAFT' | 'SUBMITTED',
        priority: applicationPriority,
        notes: applicationNotes.trim() || null,
      };

      const res = await ApiClient.createServiceApplication(payload);
      if (res?.data) {
        setShowApplyModal(false);
        // Reset form
        setSelectedClientId('');
        setSelectedServiceId('');
        setApplicationPriority('normal');
        setApplicationNotes('');
        // Refresh list
        fetchApplications();
        onRefreshParent?.();
        // Open details modal for the new application
        openDetailsModal(res.data);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create service application');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Helper for Status Badge
  const getStatusBadge = (status: ServiceApplicationStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            Draft
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Send className="w-3 h-3 text-blue-600" />
            Submitted
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Eye className="w-3 h-3 text-purple-600" />
            Under Review
          </span>
        );
      case 'ACTION_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Action Required
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Check className="w-3 h-3 text-cyan-600" />
            Approved
          </span>
        );
      case 'ASSIGNED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <User className="w-3 h-3 text-indigo-600" />
            Assigned
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <RefreshCw className="w-3 h-3 text-sky-600 animate-spin" />
            In Progress
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  // Helper for Document Status Badge
  const getDocStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Verified
          </span>
        );
      case 'UPLOADED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            Uploaded (Pending Review)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Rejected
          </span>
        );
      case 'MISSING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Missing
          </span>
        );
    }
  };

  // Helper for Efilingg Upstream Status Badge (Read-Only - Phase 19B)
  const getEfilinggStatusBadge = (status?: string | null) => {
    if (!status || status === 'NOT_SYNCED') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          PENDING FILING
        </span>
      );
    }
    const s = status.toUpperCase();
    if (s === 'SYNCED') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          SYNCED / ACKNOWLEDGED
        </span>
      );
    }
    if (s === 'IN_PROGRESS') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          IN PROGRESS
        </span>
      );
    }
    if (s === 'APPROVED') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
          APPROVED
        </span>
      );
    }
    if (s === 'QUERY_RAISED') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          QUERY RAISED
        </span>
      );
    }
    if (s === 'REJECTED' || s === 'FAILED') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          {s}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        {status}
      </span>
    );
  };

  // Helper for SLA Badge
  const getSlaBadge = (app: ServiceApplication) => {
    const status = app.sla_status;
    const remaining = app.sla_remaining_hours;

    if (app.status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <Check className="w-3 h-3 text-slate-500" />
          Completed
        </span>
      );
    }

    if (status === 'breached') {
      const overdueHours = remaining !== null && remaining !== undefined ? Math.abs(remaining) : null;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Flame className="w-3 h-3 text-rose-600" />
          SLA Breached {overdueHours !== null ? `(${overdueHours.toFixed(1)}h overdue)` : ''}
        </span>
      );
    }

    if (status === 'approaching') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
          <Clock className="w-3 h-3 text-amber-600" />
          Due Soon {remaining !== null && remaining !== undefined ? `(${remaining.toFixed(1)}h left)` : ''}
        </span>
      );
    }

    if (status === 'on_track') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          On Track {remaining !== null && remaining !== undefined ? `(${remaining.toFixed(1)}h left)` : ''}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
        <Clock className="w-2.5 h-2.5 text-slate-400" />
        No SLA
      </span>
    );
  };

  // Calculate summary counts
  const totalCount = applications.length;
  const inReviewCount = applications.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length;
  const actionRequiredCount = applications.filter((a) => a.status === 'ACTION_REQUIRED').length;
  const inProgressCount = applications.filter((a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS').length;
  const completedCount = applications.filter((a) => a.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Applied Services Workflow</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Phase 15B
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Apply corporate and legal services on behalf of your onboarded clients. Track required document
                verifications, resolve review actions, and monitor service completion and snapshotted commissions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                setRefreshing(true);
                fetchApplications();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                setFormError(null);
                setShowApplyModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Apply Service
            </button>
          </div>
        </div>

        {/* Quick KPI Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Applications</span>
            <div className="text-lg font-bold text-slate-800 mt-0.5">{totalCount}</div>
          </div>
          <div className="bg-purple-50/60 p-3 rounded-lg border border-purple-100/70">
            <span className="text-[11px] font-medium text-purple-700 uppercase tracking-wider">Review Queue</span>
            <div className="text-lg font-bold text-purple-900 mt-0.5">{inReviewCount}</div>
          </div>
          <div
            className={`p-3 rounded-lg border transition-all ${
              actionRequiredCount > 0
                ? 'bg-amber-50 border-amber-300 shadow-sm ring-1 ring-amber-200'
                : 'bg-slate-50/70 border-slate-100'
            }`}
          >
            <span
              className={`text-[11px] font-medium uppercase tracking-wider ${
                actionRequiredCount > 0 ? 'text-amber-800 font-bold' : 'text-slate-500'
              }`}
            >
              Action Required
            </span>
            <div
              className={`text-lg font-bold mt-0.5 ${
                actionRequiredCount > 0 ? 'text-amber-900' : 'text-slate-800'
              }`}
            >
              {actionRequiredCount}
            </div>
          </div>
          <div className="bg-indigo-50/60 p-3 rounded-lg border border-indigo-100/70">
            <span className="text-[11px] font-medium text-indigo-700 uppercase tracking-wider">In Progress</span>
            <div className="text-lg font-bold text-indigo-900 mt-0.5">{inProgressCount}</div>
          </div>
          <div className="bg-emerald-50/60 p-3 rounded-lg border border-emerald-100/70">
            <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Completed</span>
            <div className="text-lg font-bold text-emerald-900 mt-0.5">{completedCount}</div>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Required Callout if any */}
      {actionRequiredCount > 0 && statusFilter !== 'ACTION_REQUIRED' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300/80 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 text-amber-800 rounded-lg flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                {actionRequiredCount} Application{actionRequiredCount > 1 ? 's' : ''} Require Immediate Action
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                Super Admin has requested additional document clarification or re-uploads.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('ACTION_REQUIRED')}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors shrink-0"
          >
            Filter Action Required
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by application number, client name, or service..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* Service Filter */}
          <div className="w-full sm:w-64">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
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

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-none text-xs">
          {[
            { id: 'ALL', label: 'All Statuses' },
            { id: 'DRAFT', label: 'Draft' },
            { id: 'SUBMITTED', label: 'Submitted' },
            { id: 'UNDER_REVIEW', label: 'Under Review' },
            { id: 'ACTION_REQUIRED', label: 'Action Required', highlight: actionRequiredCount > 0 },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'ASSIGNED', label: 'Assigned' },
            { id: 'IN_PROGRESS', label: 'In Progress' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'REJECTED', label: 'Rejected' },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : tab.highlight
                    ? 'bg-amber-100/70 text-amber-800 hover:bg-amber-100 border border-amber-200 font-semibold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Applications List / Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-2" />
            <p className="text-xs font-medium">Loading applied service applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No applications found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'ALL' || serviceFilter !== 'ALL'
                ? 'Try adjusting your filters or search terms.'
                : 'You have not submitted any service applications yet. Click "Apply Service" to create one.'}
            </p>
            <button
              onClick={() => setShowApplyModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Apply First Service
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Application #</th>
                  <th className="py-3 px-4">Service & SLA</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Fee / Commission</th>
                  <th className="py-3 px-4">Status & Assignee</th>
                  <th className="py-3 px-4">Submission / Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      app.status === 'ACTION_REQUIRED' ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    {/* App Number & Priority */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-semibold text-slate-900">{app.application_number}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                            app.priority === 'urgent'
                              ? 'bg-rose-100 text-rose-700'
                              : app.priority === 'high'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {app.priority}
                        </span>
                      </div>
                    </td>

                    {/* Service & SLA */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-semibold text-slate-800 line-clamp-1">{app.service_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{app.service_code}</div>
                      <div className="mt-1.5 flex flex-col items-start gap-1">
                        {getSlaBadge(app)}
                        {app.sla_due_at && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Due: {new Date(app.sla_due_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Client */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{app.client_name}</span>
                      </div>
                      {app.client_phone && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{app.client_phone}</span>
                        </div>
                      )}
                    </td>

                    {/* Snapshotted Fee & Commission */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-medium text-slate-800">
                        Fee: ₹{Number(app.service_fee_snapshot).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                        <Coins className="w-3 h-3" />
                        <span>Comm: ₹{Number(app.commission_value_snapshot).toLocaleString('en-IN')}</span>
                      </div>
                    </td>

                    {/* Status & Specialist Assignee */}
                    <td className="py-3.5 px-4 align-top">
                      <div>{getStatusBadge(app.status)}</div>
                      <div className="mt-1">
                        {getEfilinggStatusBadge(app.efilingg_status)}
                      </div>
                      {app.status === 'ACTION_REQUIRED' && app.status_reason && (
                        <div className="text-[10px] text-amber-700 font-medium truncate max-w-[180px] mt-1">
                          Fix: {app.status_reason}
                        </div>
                      )}
                      <div className="mt-1.5">
                        {app.assigned_to_name ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 font-medium bg-slate-100 px-2 py-0.5 rounded">
                            <UserCheck className="w-3 h-3 text-indigo-600" />
                            <span>{app.assigned_to_name}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Pending Assignment</span>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-slate-500 text-[11px] align-top">
                      {app.submitted_at ? (
                        <div>Submitted: {new Date(app.submitted_at).toLocaleDateString()}</div>
                      ) : (
                        <div>Created: {new Date(app.created_at).toLocaleDateString()}</div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right align-top">
                      <button
                        onClick={() => openDetailsModal(app)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Checklist & Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: APPLY SERVICE FOR CLIENT                                        */}
      {/* ========================================================================= */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Apply Service for Client</h3>
                  <p className="text-[11px] text-slate-500">Initiate service application workflow</p>
                </div>
              </div>
              <button
                onClick={() => setShowApplyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body Form */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Client Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Client <span className="text-rose-500">*</span>
                </label>
                {clients.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-center">
                    <p>No clients found in your directory.</p>
                    {onNavigateToClients && (
                      <button
                        onClick={() => {
                          setShowApplyModal(false);
                          onNavigateToClients();
                        }}
                        className="text-indigo-600 hover:underline font-semibold mt-1 inline-block"
                      >
                        Create Client First →
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                  >
                    <option value="">-- Choose existing client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.phone}) {c.city ? `- ${c.city}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Service Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Service Master <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                >
                  <option value="">-- Select corporate/legal service --</option>
                  {services
                    .filter((s) => s.is_active !== false && s.is_active !== 0)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Fee: ₹{s.service_fee} | Commission: ₹{s.commission_value})
                      </option>
                    ))}
                </select>

                {/* Selected Service Preview */}
                {selectedServiceId && (
                  (() => {
                    const svc = services.find((s) => s.id === selectedServiceId);
                    if (!svc) return null;
                    return (
                      <div className="mt-2.5 p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 flex items-center justify-between text-indigo-900">
                        <div>
                          <div className="font-semibold">{svc.name}</div>
                          <div className="text-[11px] text-indigo-700 mt-0.5">
                            Turnaround: {svc.turnaround_days || 3} days (SLA: {svc.sla_hours || 72}h)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-900">Fee: ₹{svc.service_fee}</div>
                          <div className="text-[11px] font-semibold text-emerald-700">Commission: ₹{svc.commission_value}</div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setApplicationPriority(p)}
                      className={`py-1.5 rounded-lg border font-semibold capitalize text-center transition-colors ${
                        applicationPriority === p
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Initial Notes / Instructions
                </label>
                <textarea
                  rows={3}
                  value={applicationNotes}
                  onChange={(e) => setApplicationNotes(e.target.value)}
                  placeholder="Provide any client specifics, urgent filing instructions, or special requests..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white resize-none"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Snapshot Notice:</strong> Submitting will lock the current service fee and commission value
                  for this application and create the mandatory document checklist.
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 font-medium hover:text-slate-800"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmittingForm || !selectedClientId || !selectedServiceId}
                  onClick={() => handleCreateApplication(false)}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={isSubmittingForm || !selectedClientId || !selectedServiceId}
                  onClick={() => handleCreateApplication(true)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingForm ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Submit Application
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: APPLICATION DETAILS & REQUIRED DOCUMENT CHECKLIST                 */}
      {/* ========================================================================= */}
      {showDetailsModal && selectedApplication && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {selectedApplication.application_number}
                    </h3>
                    {getStatusBadge(selectedApplication.status)}
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {selectedApplication.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedApplication.service_name} • Client: {selectedApplication.client_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Action Success Alert */}
              {actionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{actionSuccess}</span>
                  </div>
                  <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* ACTION REQUIRED BANNER */}
              {selectedApplication.status === 'ACTION_REQUIRED' && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-bold text-amber-900 text-sm">Action Required by Super Admin</h4>
                      <p className="text-xs text-amber-800 mt-1 font-medium bg-amber-100/60 p-2.5 rounded-lg border border-amber-200">
                        {selectedApplication.status_reason || 'Please upload the requested documents below and resubmit.'}
                      </p>
                      <div className="mt-3">
                        <button
                          onClick={() => handleSubmitApplication(selectedApplication.id)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                        >
                          {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Re-submit Application Now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Client Box */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Client Details
                  </div>
                  <div className="font-bold text-slate-900">{selectedApplication.client_name}</div>
                  <div className="text-slate-600 mt-0.5">{selectedApplication.client_phone}</div>
                  {selectedApplication.client_email && (
                    <div className="text-slate-500 text-[11px] truncate">{selectedApplication.client_email}</div>
                  )}
                </div>

                {/* Snapshots Box */}
                <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Coins className="w-3.5 h-3.5 text-indigo-500" />
                    Financial Snapshots
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Service Fee:</span>
                    <span className="font-bold text-slate-900">
                      ₹{Number(selectedApplication.service_fee_snapshot).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-slate-600">Commission:</span>
                    <span className="font-bold text-emerald-700">
                      ₹{Number(selectedApplication.commission_value_snapshot).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="text-slate-500">Commission Status:</span>
                    <span
                      className={`font-semibold ${
                        selectedApplication.commission_status === 'RELEASED'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {selectedApplication.commission_status}
                    </span>
                  </div>
                </div>

                {/* Assignment & Specialist */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    Specialist Assignment
                  </div>
                  {selectedApplication.assigned_to_name ? (
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{selectedApplication.assigned_to_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Assigned:{' '}
                        {selectedApplication.assigned_at
                          ? new Date(selectedApplication.assigned_at).toLocaleDateString()
                          : 'Active'}
                      </div>
                      {selectedApplication.assignment_notes && (
                        <div className="text-[11px] text-slate-600 italic mt-1 line-clamp-2">
                          "{selectedApplication.assignment_notes}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-400 italic mt-2">Pending assignment by HQ.</div>
                  )}
                </div>

                {/* SLA & Turnaround Box */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    SLA & Turnaround
                  </div>
                  <div className="mb-1.5">{getSlaBadge(selectedApplication)}</div>
                  {selectedApplication.sla_due_at ? (
                    <div className="text-[11px] text-slate-700">
                      <strong>Due Date:</strong> {new Date(selectedApplication.sla_due_at).toLocaleDateString()}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">No SLA due date set</div>
                  )}
                  {(selectedApplication.turnaround_days || selectedApplication.sla_hours) && (
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      Target:{' '}
                      {selectedApplication.turnaround_days
                        ? `${selectedApplication.turnaround_days} days`
                        : `${selectedApplication.sla_hours} hours`}
                    </div>
                  )}
                </div>
              </div>

              {/* GOVERNMENT FILING REFERENCES CARD (READ-ONLY - PHASE 19B.3) */}
              {(() => {
                const isSimulatedSandbox = Boolean(
                  gatewayMode === 'SANDBOX' ||
                  selectedApplication.external_filing_id?.includes('SIMULATED') ||
                  selectedApplication.arn_number?.includes('SIMULATED') ||
                  selectedApplication.srn_number?.includes('SIMULATED') ||
                  selectedApplication.challan_number?.includes('SIMULATED') ||
                  workNotes.some((n) => n.note?.includes('[SANDBOX') || n.note?.includes('SIMULATED'))
                );

                return (
                  <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-indigo-600" />
                          Government Filing References
                        </h4>
                        {getEfilinggStatusBadge(selectedApplication.efilingg_status)}
                        {isSimulatedSandbox && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300">
                            SANDBOX SIMULATED
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded self-start sm:self-auto">
                        Official Records (Read-Only)
                      </span>
                    </div>

                    {/* Simulated Sandbox Data Notice */}
                    {isSimulatedSandbox && (
                      <div className="p-3 bg-blue-50/70 border border-blue-200/90 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase bg-blue-200 text-blue-900 border border-blue-300">
                            SIMULATED SANDBOX DATA
                          </span>
                          <span className="text-[11px] font-bold text-blue-900">
                            Gateway Simulation Active
                          </span>
                        </div>
                        <p className="text-[11px] text-blue-800">
                          This application was processed through the test sandbox gateway. Acknowledgment identifiers (ARN, SRN, Challan) are simulated tokens generated for workflow demonstration.
                        </p>
                      </div>
                    )}

                    {/* Grid of Government Filing References */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* ARN Number */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          ARN Number
                        </span>
                        <div className="mt-1 font-mono text-[11px]">
                          {selectedApplication.arn_number ? (
                            <span className="font-bold text-slate-900 select-all">
                              {selectedApplication.arn_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not yet generated</span>
                          )}
                        </div>
                      </div>

                      {/* SRN Number */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          SRN Number
                        </span>
                        <div className="mt-1 font-mono text-[11px]">
                          {selectedApplication.srn_number ? (
                            <span className="font-bold text-slate-900 select-all">
                              {selectedApplication.srn_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not yet generated</span>
                          )}
                        </div>
                      </div>

                      {/* Challan / Receipt Number */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Challan / Receipt #
                        </span>
                        <div className="mt-1 font-mono text-[11px]">
                          {selectedApplication.challan_number ? (
                            <span className="font-bold text-slate-900 select-all">
                              {selectedApplication.challan_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not yet generated</span>
                          )}
                        </div>
                      </div>

                      {/* External Filing ID */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          External Filing ID
                        </span>
                        <div className="mt-1 font-mono text-[11px]">
                          {selectedApplication.external_filing_id ? (
                            <span className="font-semibold text-slate-800 select-all truncate block">
                              {selectedApplication.external_filing_id}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not yet generated</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer Status & Last-Sync Timestamp */}
                    <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span>Last Gateway Synchronization:</span>
                        <strong className="text-slate-700">
                          {selectedApplication.efilingg_synced_at
                            ? new Date(selectedApplication.efilingg_synced_at).toLocaleString()
                            : 'Not yet generated'}
                        </strong>
                      </div>
                      {selectedApplication.efilingg_sync_error && (
                        <div className="text-rose-600 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Sync Note: {selectedApplication.efilingg_sync_error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* REQUIRED DOCUMENT CHECKLIST */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      Required Document Checklist
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Upload mandatory proofs for Super Admin review and verification.
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Verified:{' '}
                    <span className="font-bold text-emerald-700">
                      {selectedApplication.documents?.filter((d) => d.status === 'VERIFIED').length || 0}
                    </span>{' '}
                    / {selectedApplication.documents?.length || 0}
                  </div>
                </div>

                {/* Checklist Cards */}
                <div className="space-y-3">
                  {selectedApplication.documents && selectedApplication.documents.length > 0 ? (
                    selectedApplication.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className={`p-4 rounded-xl border transition-all ${
                          doc.status === 'REJECTED'
                            ? 'bg-rose-50/50 border-rose-200'
                            : doc.status === 'VERIFIED'
                            ? 'bg-emerald-50/30 border-emerald-200'
                            : doc.status === 'UPLOADED'
                            ? 'bg-blue-50/30 border-blue-200'
                            : 'bg-white border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{doc.document_name}</span>
                              {doc.is_required && (
                                <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                  Required
                                </span>
                              )}
                              {getDocStatusBadge(doc.status)}
                            </div>
                            {doc.description && (
                              <p className="text-[11px] text-slate-500">{doc.description}</p>
                            )}

                            {/* File Upload Info if present */}
                            {doc.file_name && (
                              <div className="text-[11px] text-slate-600 flex items-center gap-2 pt-1 font-mono">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span className="font-semibold text-slate-800">{doc.file_name}</span>
                                {doc.file_size && (
                                  <span className="text-slate-400">
                                    ({(doc.file_size / 1024).toFixed(1)} KB)
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Rejection Note */}
                            {doc.status === 'REJECTED' && doc.rejection_reason && (
                              <div className="text-[11px] text-rose-700 bg-rose-100/70 p-2 rounded border border-rose-200 font-medium mt-1">
                                <strong>Rejection Reason:</strong> {doc.rejection_reason}
                              </div>
                            )}
                          </div>

                          {/* Upload / Re-upload & Download Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Download button if file exists */}
                            {(doc.status === 'UPLOADED' || doc.status === 'VERIFIED') && (
                              <a
                                href={ApiClient.getServiceApplicationDocumentDownloadUrl(
                                  selectedApplication.id,
                                  doc.id
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-xs shadow-sm"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download
                              </a>
                            )}

                            {/* Upload / Re-upload Input */}
                            <label className="relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-xs border border-indigo-200 cursor-pointer shadow-sm transition-colors">
                              {uploadingDocId === doc.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>{doc.status === 'MISSING' ? 'Upload Document' : 'Re-upload File'}</span>
                              <input
                                type="file"
                                className="hidden"
                                disabled={uploadingDocId === doc.id}
                                onChange={(e) => handleFileUpload(e, doc.id)}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-6 bg-slate-50 rounded-xl text-slate-400">
                      No documents required for this service.
                    </div>
                  )}
                </div>
              </div>

              {/* READ-ONLY WORK HISTORY & OPERATIONAL ACTIVITY */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-4 h-4 text-indigo-600" />
                      Operations Work History & Notes
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Read-only audit log of operational events, specialist assignments, and filing notes.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    Read-Only (HQ Managed)
                  </span>
                </div>

                {loadingNotes ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-indigo-500 mb-1" />
                    <p className="text-[11px]">Loading operations history...</p>
                  </div>
                ) : workNotes.length === 0 ? (
                  <div className="text-center p-6 bg-slate-50 rounded-xl border border-slate-100 text-slate-400">
                    No operational notes or assignment history recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2.5 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-200">
                    {workNotes.map((note) => (
                      <div key={note.id} className="relative flex items-start gap-2.5 pl-1">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10 text-[9px] font-bold ${
                            note.note_type === 'reassignment'
                              ? 'bg-amber-100 text-amber-800 ring-2 ring-white'
                              : note.note_type === 'assignment'
                              ? 'bg-indigo-100 text-indigo-800 ring-2 ring-white'
                              : 'bg-slate-200 text-slate-700 ring-2 ring-white'
                          }`}
                        >
                          {note.note_type === 'reassignment' ? (
                            <ArrowRightLeft className="w-2.5 h-2.5" />
                          ) : note.note_type === 'assignment' ? (
                            <UserCheck className="w-2.5 h-2.5" />
                          ) : (
                            <MessageSquare className="w-2.5 h-2.5" />
                          )}
                        </div>

                        <div className="flex-1 bg-slate-50/80 border border-slate-200/80 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{note.user_name || 'Staff Member'}</span>
                              {note.user_role && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-700">
                                  {note.user_role}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                                  note.note_type === 'reassignment'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : note.note_type === 'assignment'
                                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {note.note_type}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(note.created_at).toLocaleDateString()} •{' '}
                              {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Commission Ledger Card if Completed & Released */}
              {selectedApplication.commission_status === 'RELEASED' && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Commission Credited to Franchise Ledger</span>
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">
                    ₹{Number(selectedApplication.commission_value_snapshot).toFixed(2)} has been released and credited
                    to your franchise commission ledger.
                  </p>
                  {selectedApplication.ledger_reference_id && (
                    <div className="text-[11px] font-mono text-emerald-800 mt-1">
                      Immutable Ledger Reference: <strong>{selectedApplication.ledger_reference_id}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 font-medium hover:text-slate-800"
              >
                Close
              </button>

              {/* If Draft, provide Submit button */}
              {selectedApplication.status === 'DRAFT' && (
                <button
                  onClick={() => handleSubmitApplication(selectedApplication.id)}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {actionLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Submit Application for Review
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
