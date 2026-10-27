import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  RefreshCw,
  X,
  Download,
  FileText,
  User,
  Phone,
  Building,
  Coins,
  Check,
  Send,
  UserCheck,
  ChevronRight,
  ShieldCheck,
  SlidersHorizontal,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type {
  ServiceApplication,
  ServiceApplicationDocument,
  ServiceApplicationStatus,
  ServiceMaster,
  EfilinggIntegrationStatus,
  EfilinggSyncResult,
  UpdateFilingReferencesInput,
} from '../../types';

interface FranchiseOption {
  id: string;
  name: string;
  code?: string;
}

interface AssigneeOption {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface AdminServiceApplicationsViewProps {
  onNavigate?: (tab: any) => void;
}

export const AdminServiceApplicationsView: React.FC<AdminServiceApplicationsViewProps> = ({ onNavigate }) => {
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available metadata
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [franchiseFilter, setFranchiseFilter] = useState<string>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [commissionFilter, setCommissionFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Review Modal State
  const [selectedApp, setSelectedApp] = useState<ServiceApplication | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Action Inputs inside modal
  const [showReasonInput, setShowReasonInput] = useState<null | 'ACTION_REQUIRED' | 'REJECTED'>(null);
  const [reasonText, setReasonText] = useState('');

  // Document Reject Modal State
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [docRejectionReason, setDocRejectionReason] = useState('');

  // Work Assignment State
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Commission Release State
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [isReleasingComm, setIsReleasingComm] = useState(false);

  // Efilingg Gateway & Government Filing State (Phase 19B.2)
  const [gatewayStatus, setGatewayStatus] = useState<EfilinggIntegrationStatus | null>(null);
  const [isSyncingEfilingg, setIsSyncingEfilingg] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<EfilinggSyncResult | null>(null);

  // Filing Reference Inputs State
  const [filingArn, setFilingArn] = useState('');
  const [filingSrn, setFilingSrn] = useState('');
  const [filingChallan, setFilingChallan] = useState('');
  const [filingStatusInput, setFilingStatusInput] = useState<string>('NOT_SYNCED');
  const [filingNotes, setFilingNotes] = useState('');
  const [isUpdatingReferences, setIsUpdatingReferences] = useState(false);

  // Fetch applications list
  const fetchApplications = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, any> = { limit: 100 };

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      if (franchiseFilter !== 'ALL') {
        params.franchise_id = franchiseFilter;
      }
      if (serviceFilter !== 'ALL') {
        params.service_id = serviceFilter;
      }
      if (commissionFilter !== 'ALL') {
        params.commission_status = commissionFilter;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const res = await ApiClient.getServiceApplications(params);
      if (res?.data) {
        setApplications(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch service applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, franchiseFilter, serviceFilter, commissionFilter, searchTerm]);

  // Initial load: Fetch metadata & list
  useEffect(() => {
    fetchApplications();

    // Load franchises
    ApiClient.getFranchises()
      .then((res: any) => {
        if (res?.data) {
          const list = res.data.map((f: any) => ({
            id: f.organization_id || f.id,
            name: f.operating_name || f.business_name || f.legal_name || 'Franchise Partner',
            code: f.franchise_code || f.code,
          }));
          setFranchises(list);
        }
      })
      .catch(() => {});

    // Load services
    ApiClient.getServices()
      .then((res: any) => {
        if (res?.data) setServices(res.data);
      })
      .catch(() => {});

    // Load assignees
    ApiClient.getTicketAssignees()
      .then((res: any) => {
        if (res?.data) setAssignees(res.data);
      })
      .catch(() => {});

    // Load Efilingg Gateway status (Phase 19B.2)
    ApiClient.getEfilinggStatus()
      .then((res: any) => {
        if (res?.data) setGatewayStatus(res.data);
      })
      .catch(() => {});
  }, [fetchApplications]);

  // Open review modal and fetch full document checklist
  const openReviewModal = async (app: ServiceApplication) => {
    setSelectedApp(app);
    setShowReviewModal(true);
    setModalSuccess(null);
    setModalError(null);
    setShowReasonInput(null);
    setReasonText('');
    setRejectingDocId(null);
    setShowReleaseConfirm(false);
    setSelectedAssigneeId(app.assigned_to_user_id || '');
    setAssignmentNotes(app.assignment_notes || '');

    // Reset and initialize Efilingg Gateway states (Phase 19B.2)
    setFilingArn(app.arn_number || '');
    setFilingSrn(app.srn_number || '');
    setFilingChallan(app.challan_number || '');
    setFilingStatusInput(app.efilingg_status || 'NOT_SYNCED');
    setFilingNotes('');
    setSyncSuccessMessage(null);
    setSyncErrorMessage(null);
    setLastSyncResult(null);

    try {
      setModalLoading(true);
      const res = await ApiClient.getServiceApplicationById(app.id);
      if (res?.data) {
        setSelectedApp(res.data);
        setFilingArn(res.data.arn_number || '');
        setFilingSrn(res.data.srn_number || '');
        setFilingChallan(res.data.challan_number || '');
        setFilingStatusInput(res.data.efilingg_status || 'NOT_SYNCED');
      }
    } catch (err: any) {
      setModalError(err?.message || 'Failed to fetch application details');
    } finally {
      setModalLoading(false);
    }
  };

  // Status transition handler
  const handleStatusTransition = async (newStatus: ServiceApplicationStatus, reason?: string) => {
    if (!selectedApp) return;

    try {
      setModalLoading(true);
      setModalError(null);
      setModalSuccess(null);

      const res = await ApiClient.setServiceApplicationStatus(selectedApp.id, newStatus, reason);
      if (res?.data) {
        setSelectedApp(res.data);
        setModalSuccess(`Application moved to status "${newStatus}" successfully.`);
        setShowReasonInput(null);
        setReasonText('');
        fetchApplications();
      }
    } catch (err: any) {
      setModalError(err?.message || `Failed to transition status to ${newStatus}`);
    } finally {
      setModalLoading(false);
    }
  };

  // Verify document
  const handleVerifyDocument = async (docId: string) => {
    if (!selectedApp) return;
    try {
      setModalLoading(true);
      setModalError(null);
      await ApiClient.verifyServiceApplicationDocument(selectedApp.id, docId);

      // Refresh application
      const fresh = await ApiClient.getServiceApplicationById(selectedApp.id);
      if (fresh?.data) setSelectedApp(fresh.data);
      setModalSuccess('Document verified successfully.');
      fetchApplications();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to verify document');
    } finally {
      setModalLoading(false);
    }
  };

  // Reject document
  const handleRejectDocument = async () => {
    if (!selectedApp || !rejectingDocId) return;
    if (!docRejectionReason.trim()) {
      alert('Please provide a reason for rejecting this document.');
      return;
    }

    try {
      setModalLoading(true);
      setModalError(null);
      await ApiClient.rejectServiceApplicationDocument(
        selectedApp.id,
        rejectingDocId,
        docRejectionReason.trim()
      );

      // Refresh application
      const fresh = await ApiClient.getServiceApplicationById(selectedApp.id);
      if (fresh?.data) setSelectedApp(fresh.data);
      setRejectingDocId(null);
      setDocRejectionReason('');
      setModalSuccess('Document rejected. Franchise will be notified to re-upload.');
      fetchApplications();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to reject document');
    } finally {
      setModalLoading(false);
    }
  };

  // Assign specialist
  const handleAssignWork = async () => {
    if (!selectedApp || !selectedAssigneeId) {
      alert('Please select a specialist/assignee.');
      return;
    }

    try {
      setIsAssigning(true);
      setModalError(null);
      const res = await ApiClient.assignServiceApplication(selectedApp.id, {
        assigned_to_user_id: selectedAssigneeId,
        assignment_notes: assignmentNotes.trim() || null,
        move_to_assigned_status: true,
      });

      if (res?.data) {
        setSelectedApp(res.data);
        setModalSuccess('Specialist assigned successfully. Status moved to ASSIGNED.');
        fetchApplications();
      }
    } catch (err: any) {
      setModalError(err?.message || 'Failed to assign specialist');
    } finally {
      setIsAssigning(false);
    }
  };

  // Release commission
  const handleReleaseCommission = async () => {
    if (!selectedApp) return;

    try {
      setIsReleasingComm(true);
      setModalError(null);
      const res = await ApiClient.releaseServiceApplicationCommission(selectedApp.id);

      if (res?.data) {
        setSelectedApp(res.data.application);
        setShowReleaseConfirm(false);
        setModalSuccess(
          `Commission of ₹${Number(res.data.amount).toFixed(2)} released successfully! Immutable Ledger Reference: ${
            res.data.ledger_reference_id
          }`
        );
        fetchApplications();
      }
    } catch (err: any) {
      setModalError(err?.message || 'Failed to release commission');
    } finally {
      setIsReleasingComm(false);
    }
  };

  // Efilingg Sync Handler (Phase 19B.2)
  const handleSyncEfilingg = async () => {
    if (!selectedApp) return;

    try {
      setIsSyncingEfilingg(true);
      setSyncErrorMessage(null);
      setSyncSuccessMessage(null);

      const res = await ApiClient.syncApplicationWithEfilingg(selectedApp.id);
      if (res?.data) {
        const syncResult: EfilinggSyncResult = res.data.syncResult || res.data;
        setLastSyncResult(syncResult);

        if (syncResult.success) {
          const msg = syncResult.isSimulated
            ? `[SIMULATED SANDBOX] ${syncResult.message || 'Application synced successfully with Efilingg sandbox.'}`
            : (syncResult.message || 'Application synced successfully with Efilingg gateway.');
          setSyncSuccessMessage(msg);
        } else {
          setSyncErrorMessage(syncResult.error || syncResult.message || 'Sync failed.');
        }

        // Refresh application in modal
        const fresh = await ApiClient.getServiceApplicationById(selectedApp.id);
        if (fresh?.data) {
          setSelectedApp(fresh.data);
          setFilingArn(fresh.data.arn_number || '');
          setFilingSrn(fresh.data.srn_number || '');
          setFilingChallan(fresh.data.challan_number || '');
          setFilingStatusInput(fresh.data.efilingg_status || 'NOT_SYNCED');
        }
        fetchApplications();
      }
    } catch (err: any) {
      setSyncErrorMessage(err?.message || 'Failed to sync application with Efilingg');
    } finally {
      setIsSyncingEfilingg(false);
    }
  };

  // Update Filing References Handler (Phase 19B.2)
  const handleUpdateFilingReferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedApp) return;

    try {
      setIsUpdatingReferences(true);
      setSyncErrorMessage(null);
      setSyncSuccessMessage(null);

      const payload: UpdateFilingReferencesInput = {
        arn_number: filingArn.trim() || null,
        srn_number: filingSrn.trim() || null,
        challan_number: filingChallan.trim() || null,
        efilingg_status: filingStatusInput || null,
        notes: filingNotes.trim() || null,
      };

      const res = await ApiClient.updateFilingReferences(selectedApp.id, payload);
      if (res?.data) {
        setSyncSuccessMessage('Filing references updated successfully.');
        setFilingNotes('');

        // Refresh application in modal
        const fresh = await ApiClient.getServiceApplicationById(selectedApp.id);
        if (fresh?.data) {
          setSelectedApp(fresh.data);
          setFilingArn(fresh.data.arn_number || '');
          setFilingSrn(fresh.data.srn_number || '');
          setFilingChallan(fresh.data.challan_number || '');
          setFilingStatusInput(fresh.data.efilingg_status || 'NOT_SYNCED');
        }
        fetchApplications();
      }
    } catch (err: any) {
      setSyncErrorMessage(err?.message || 'Failed to update filing references');
    } finally {
      setIsUpdatingReferences(false);
    }
  };

  // Status Badge Component
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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
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

  // Efilingg Status Badge Component (Phase 19B.2)
  const getEfilinggStatusBadge = (status?: string | null) => {
    const s = status || 'NOT_SYNCED';
    switch (s) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
            Efilingg: Approved
          </span>
        );
      case 'SYNCED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Check className="w-2.5 h-2.5 text-blue-600" />
            Efilingg: Synced
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <RefreshCw className="w-2.5 h-2.5 text-sky-600 animate-spin" />
            Efilingg: In Progress
          </span>
        );
      case 'QUERY_RAISED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
            Govt Query Raised
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-2.5 h-2.5 text-rose-600" />
            Govt Rejected
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
            Sync Failed
          </span>
        );
      case 'NOT_SYNCED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Clock className="w-2.5 h-2.5 text-slate-400" />
            Govt: Not Synced
          </span>
        );
    }
  };

  // Document Status Badge
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
            Pending Verification
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

  // Metrics computation
  const totalApps = applications.length;
  const reviewQueueCount = applications.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length;
  const actionReqCount = applications.filter((a) => a.status === 'ACTION_REQUIRED').length;
  const inProgressCount = applications.filter((a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS').length;
  const completedCount = applications.filter((a) => a.status === 'COMPLETED').length;
  const pendingCommCount = applications.filter(
    (a) => a.status === 'COMPLETED' && a.commission_status === 'PENDING'
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
              <Briefcase className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Applied Services Governance</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Phase 15B
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                Master queue for review, verification, specialist assignment, and explicit commission release for
                all franchise-initiated client service applications across the network.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setRefreshing(true);
                fetchApplications();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Queue
            </button>
            {onNavigate && (
              <button
                onClick={() => onNavigate('admin-work-queue')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
                <span>Operations Work Queue</span>
              </button>
            )}
          </div>
        </div>

        {/* Top KPIs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Queue</span>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{totalApps}</div>
          </div>
          <div className="bg-purple-50/70 p-3 rounded-lg border border-purple-100">
            <span className="text-[11px] font-medium text-purple-700 uppercase tracking-wider">Review Queue</span>
            <div className="text-lg font-bold text-purple-900 mt-0.5">{reviewQueueCount}</div>
          </div>
          <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200">
            <span className="text-[11px] font-medium text-amber-800 uppercase tracking-wider">Action Req</span>
            <div className="text-lg font-bold text-amber-900 mt-0.5">{actionReqCount}</div>
          </div>
          <div className="bg-indigo-50/70 p-3 rounded-lg border border-indigo-100">
            <span className="text-[11px] font-medium text-indigo-700 uppercase tracking-wider">In Progress</span>
            <div className="text-lg font-bold text-indigo-900 mt-0.5">{inProgressCount}</div>
          </div>
          <div className="bg-emerald-50/70 p-3 rounded-lg border border-emerald-100">
            <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Completed</span>
            <div className="text-lg font-bold text-emerald-900 mt-0.5">{completedCount}</div>
          </div>
          <div
            className={`p-3 rounded-lg border transition-all ${
              pendingCommCount > 0
                ? 'bg-amber-100/60 border-amber-300 ring-1 ring-amber-200'
                : 'bg-slate-50 border-slate-100'
            }`}
          >
            <span
              className={`text-[11px] font-medium uppercase tracking-wider ${
                pendingCommCount > 0 ? 'text-amber-900 font-bold' : 'text-slate-500'
              }`}
            >
              Comm. Pending
            </span>
            <div
              className={`text-lg font-bold mt-0.5 ${
                pendingCommCount > 0 ? 'text-amber-950' : 'text-slate-900'
              }`}
            >
              {pendingCommCount}
            </div>
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

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
          {/* Search */}
          <div className="relative w-full sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by app #, client name, service, or franchise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          {/* Franchise Filter */}
          <div>
            <select
              value={franchiseFilter}
              onChange={(e) => setFranchiseFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
            >
              <option value="ALL">All Franchises</option>
              {franchises.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.code ? `(${f.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Service Filter */}
          <div>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
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
            { id: 'ALL', label: 'All Applications' },
            { id: 'SUBMITTED,UNDER_REVIEW', label: 'Review Queue', count: reviewQueueCount },
            { id: 'ACTION_REQUIRED', label: 'Action Required', count: actionReqCount },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'ASSIGNED,IN_PROGRESS', label: 'In Progress', count: inProgressCount },
            { id: 'COMPLETED', label: 'Completed', count: completedCount },
            { id: 'REJECTED', label: 'Rejected' },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      active ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}

          <div className="h-4 w-[1px] bg-slate-200 mx-1 shrink-0" />

          {/* Commission filter pills */}
          <button
            onClick={() => setCommissionFilter(commissionFilter === 'PENDING' ? 'ALL' : 'PENDING')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              commissionFilter === 'PENDING'
                ? 'bg-amber-600 text-white shadow-sm font-semibold'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/80'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Commission Pending ({pendingCommCount})</span>
          </button>

          <button
            onClick={() => setCommissionFilter(commissionFilter === 'RELEASED' ? 'ALL' : 'RELEASED')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              commissionFilter === 'RELEASED'
                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Commission Released</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-slate-700 mb-2" />
            <p className="text-xs font-medium">Loading applied service queue...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No applications match current filters</h3>
            <p className="text-xs text-slate-500 mt-1">Try clearing filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Application #</th>
                  <th className="py-3 px-4">Franchise</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Fee / Comm.</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Specialist</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW'
                        ? 'bg-purple-50/20'
                        : app.status === 'ACTION_REQUIRED'
                        ? 'bg-amber-50/30'
                        : ''
                    }`}
                  >
                    {/* App Number */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{app.application_number}</div>
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

                    {/* Franchise */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[140px]">{app.franchise_name || 'Franchise'}</span>
                      </div>
                      {app.franchise_code && (
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">{app.franchise_code}</div>
                      )}
                    </td>

                    {/* Client */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{app.client_name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{app.client_phone}</div>
                    </td>

                    {/* Service */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 line-clamp-1">{app.service_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{app.service_code}</div>
                    </td>

                    {/* Financial Snapshots */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800">Fee: ₹{Number(app.service_fee_snapshot).toLocaleString('en-IN')}</div>
                      <div className="text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                        <Coins className="w-3 h-3" />
                        <span>Comm: ₹{Number(app.commission_value_snapshot).toLocaleString('en-IN')}</span>
                      </div>
                      {app.status === 'COMPLETED' && (
                        <span
                          className={`inline-block text-[9px] font-bold uppercase px-1 rounded mt-1 ${
                            app.commission_status === 'RELEASED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {app.commission_status}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <div>{getStatusBadge(app.status)}</div>
                      <div className="mt-1">
                        {getEfilinggStatusBadge(app.efilingg_status)}
                      </div>
                      {app.status === 'ACTION_REQUIRED' && app.status_reason && (
                        <div className="text-[10px] text-amber-700 font-medium truncate max-w-[150px] mt-1">
                          Fix: {app.status_reason}
                        </div>
                      )}
                    </td>

                    {/* Specialist */}
                    <td className="py-3.5 px-4">
                      {app.assigned_to_name ? (
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{app.assigned_to_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => openReviewModal(app)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Review & Manage
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
      {/* SUPER ADMIN REVIEW & GOVERNANCE MODAL                                     */}
      {/* ========================================================================= */}
      {showReviewModal && selectedApp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      {selectedApp.application_number}
                    </h3>
                    {getStatusBadge(selectedApp.status)}
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {selectedApp.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {selectedApp.service_name} • Franchise: {selectedApp.franchise_name} • Client: {selectedApp.client_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Notifications / Alerts */}
              {modalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{modalSuccess}</span>
                  </div>
                  <button onClick={() => setModalSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                  <button onClick={() => setModalError(null)} className="text-rose-500 hover:text-rose-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* STATUS WORKFLOW CONTROL BAR */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Workflow Lifecycle Transitions
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Current State: <strong className="text-slate-900">{selectedApp.status}</strong>
                    </p>
                  </div>

                  {/* Actions buttons depending on state */}
                  <div className="flex items-center gap-2">
                    {/* SUBMITTED -> UNDER_REVIEW */}
                    {selectedApp.status === 'SUBMITTED' && (
                      <button
                        onClick={() => handleStatusTransition('UNDER_REVIEW')}
                        disabled={modalLoading}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-xs shadow-sm"
                      >
                        Start Review
                      </button>
                    )}

                    {/* UNDER_REVIEW -> APPROVED, ACTION_REQUIRED, REJECTED */}
                    {selectedApp.status === 'UNDER_REVIEW' && (
                      <>
                        <button
                          onClick={() => handleStatusTransition('APPROVED')}
                          disabled={modalLoading}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-sm"
                        >
                          Approve Application
                        </button>
                        <button
                          onClick={() => {
                            setShowReasonInput('ACTION_REQUIRED');
                            setReasonText('');
                          }}
                          disabled={modalLoading}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs shadow-sm"
                        >
                          Request Action
                        </button>
                        <button
                          onClick={() => {
                            setShowReasonInput('REJECTED');
                            setReasonText('');
                          }}
                          disabled={modalLoading}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs shadow-sm"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {/* APPROVED -> IN_PROGRESS */}
                    {selectedApp.status === 'APPROVED' && (
                      <button
                        onClick={() => handleStatusTransition('IN_PROGRESS')}
                        disabled={modalLoading}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-xs shadow-sm"
                      >
                        Start In Progress
                      </button>
                    )}

                    {/* ASSIGNED -> IN_PROGRESS, COMPLETED */}
                    {selectedApp.status === 'ASSIGNED' && (
                      <>
                        <button
                          onClick={() => handleStatusTransition('IN_PROGRESS')}
                          disabled={modalLoading}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-xs shadow-sm"
                        >
                          Move to In Progress
                        </button>
                        <button
                          onClick={() => handleStatusTransition('COMPLETED')}
                          disabled={modalLoading}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs shadow-sm"
                        >
                          Mark Completed
                        </button>
                      </>
                    )}

                    {/* IN_PROGRESS -> COMPLETED */}
                    {selectedApp.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleStatusTransition('COMPLETED')}
                        disabled={modalLoading}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-sm flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark as Completed
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-prompt for Action Required / Reject Reason */}
                {showReasonInput && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-2">
                    <label className="block text-[11px] font-bold text-slate-700">
                      {showReasonInput === 'ACTION_REQUIRED'
                        ? 'Specify Action Required from Franchise Partner:'
                        : 'Specify Rejection Reason:'}
                    </label>
                    <textarea
                      rows={2}
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder="Detail which document is missing/invalid or what needs to be fixed..."
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-slate-900"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setShowReasonInput(null)}
                        className="px-3 py-1 text-slate-600 hover:text-slate-800 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleStatusTransition(showReasonInput, reasonText.trim())}
                        disabled={!reasonText.trim() || modalLoading}
                        className={`px-3 py-1 rounded-lg text-white font-semibold shadow-sm ${
                          showReasonInput === 'ACTION_REQUIRED'
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        Confirm {showReasonInput === 'ACTION_REQUIRED' ? 'Action Request' : 'Rejection'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* COMMISSION RELEASE CARD (When status === 'COMPLETED') */}
              {selectedApp.status === 'COMPLETED' && (
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-emerald-600" />
                        Explicit Commission Release Governance
                      </h4>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        Locked snapshotted commission value: <strong>₹{Number(selectedApp.commission_value_snapshot).toFixed(2)}</strong>
                      </p>
                    </div>

                    {/* Release Button if PENDING */}
                    {selectedApp.commission_status === 'PENDING' ? (
                      <button
                        onClick={() => setShowReleaseConfirm(true)}
                        disabled={isReleasingComm}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow transition-colors flex items-center gap-1.5"
                      >
                        {isReleasingComm ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Coins className="w-3.5 h-3.5" />
                        )}
                        Release Commission (₹{Number(selectedApp.commission_value_snapshot).toFixed(2)})
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Commission Credited
                      </span>
                    )}
                  </div>

                  {/* If Already Released Details */}
                  {selectedApp.commission_status === 'RELEASED' && (
                    <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-emerald-900 font-mono">
                      <div>
                        Released At:{' '}
                        <strong>
                          {selectedApp.commission_released_at
                            ? new Date(selectedApp.commission_released_at).toLocaleString()
                            : 'Yes'}
                        </strong>
                      </div>
                      <div>
                        Amount: <strong>₹{Number(selectedApp.commission_value_snapshot).toFixed(2)}</strong>
                      </div>
                      <div className="truncate">
                        Ledger Ref: <strong>{selectedApp.ledger_reference_id}</strong>
                      </div>
                    </div>
                  )}

                  {/* Release Confirmation Dialog */}
                  {showReleaseConfirm && (
                    <div className="p-3 bg-white border border-emerald-300 rounded-lg space-y-2 mt-2">
                      <p className="text-slate-800 font-medium">
                        Confirm release of <strong>₹{Number(selectedApp.commission_value_snapshot).toFixed(2)}</strong> to{' '}
                        <strong>{selectedApp.franchise_name}</strong>?
                      </p>
                      <p className="text-[11px] text-slate-500">
                        This operation is concurrency-safe and writes an immutable credit transaction to the franchise
                        commission account ledger.
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setShowReleaseConfirm(false)}
                          className="px-3 py-1 text-slate-600 hover:text-slate-800 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleReleaseCommission}
                          disabled={isReleasingComm}
                          className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                        >
                          Confirm & Post to Ledger
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* THREE-COLUMN DETAILS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Franchise Box */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    Franchise Center
                  </div>
                  <div className="font-bold text-slate-900">{selectedApp.franchise_name}</div>
                  <div className="text-slate-500 text-[11px] font-mono mt-0.5">{selectedApp.franchise_code}</div>
                </div>

                {/* Client Box */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Client Profile
                  </div>
                  <div className="font-bold text-slate-900">{selectedApp.client_name}</div>
                  <div className="text-slate-600 mt-0.5">{selectedApp.client_phone}</div>
                  {selectedApp.client_email && (
                    <div className="text-slate-500 text-[11px] truncate">{selectedApp.client_email}</div>
                  )}
                </div>

                {/* Financial Snapshots */}
                <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Coins className="w-3.5 h-3.5 text-indigo-500" />
                    Snapshotted Values
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Service Fee:</span>
                    <span className="font-bold text-slate-900">
                      ₹{Number(selectedApp.service_fee_snapshot).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-slate-600">Commission Value:</span>
                    <span className="font-bold text-emerald-700">
                      ₹{Number(selectedApp.commission_value_snapshot).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* GOVERNMENT FILING & EFILINGG GATEWAY CARD (PHASE 19B.2) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                {/* Header: Title, Mode, Status, Sync Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        Government Filing & Efilingg Gateway
                      </h4>
                      {/* Gateway Mode Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                          (gatewayStatus?.mode || 'SANDBOX') === 'SANDBOX'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : (gatewayStatus?.mode || 'SANDBOX') === 'LIVE'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        Gateway Mode: {gatewayStatus?.mode || 'SANDBOX'}
                      </span>
                      {/* Filing Status Badge */}
                      {getEfilinggStatusBadge(selectedApp.efilingg_status)}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Synchronize application data directly with the government e-filing gateway and manage official regulatory acknowledgment numbers.
                    </p>
                  </div>

                  {/* Sync Action Button */}
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={handleSyncEfilingg}
                      disabled={isSyncingEfilingg}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs shadow-sm transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingEfilingg ? 'animate-spin' : ''}`} />
                      <span>{isSyncingEfilingg ? 'Syncing Gateway...' : 'Sync with Efilingg'}</span>
                    </button>
                  </div>
                </div>

                {/* Gateway Notifications / Feedback */}
                {syncSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{syncSuccessMessage}</span>
                    </div>
                    <button onClick={() => setSyncSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {syncErrorMessage && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{syncErrorMessage}</span>
                    </div>
                    <button onClick={() => setSyncErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Clearly Labeled Simulated SANDBOX Results Banner */}
                {(gatewayStatus?.mode || 'SANDBOX') === 'SANDBOX' && (
                  <div className="p-3 bg-blue-50/70 border border-blue-200/90 rounded-lg space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase bg-blue-200 text-blue-900 border border-blue-300">
                        SIMULATED SANDBOX
                      </span>
                      <span className="text-[11px] font-bold text-blue-900">
                        Zero Live Vendor Dispatch • QA Simulation Safe
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800">
                      Efilingg gateway is running in SANDBOX mode. Synchronization generates deterministic simulated
                      acknowledgment tokens (ARN/SRN/Challan) for testing workflows without incurring live filing fees or external dispatch.
                    </p>
                  </div>
                )}

                {/* Live Snapshot Grid of References */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-white border border-slate-200 rounded-lg">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">External Filing ID</span>
                    <div className="font-mono font-medium text-slate-800 text-[11px] truncate mt-0.5">
                      {selectedApp.external_filing_id || <span className="text-slate-400 italic font-normal">Not Synced</span>}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ARN Number</span>
                    <div className="font-mono font-bold text-slate-900 text-[11px] truncate mt-0.5">
                      {selectedApp.arn_number || <span className="text-slate-400 italic font-normal">Pending</span>}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SRN Number</span>
                    <div className="font-mono font-bold text-slate-900 text-[11px] truncate mt-0.5">
                      {selectedApp.srn_number || <span className="text-slate-400 italic font-normal">Pending</span>}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Challan / Receipt #</span>
                    <div className="font-mono font-medium text-slate-800 text-[11px] truncate mt-0.5">
                      {selectedApp.challan_number || <span className="text-slate-400 italic font-normal">None</span>}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div>
                      Last Synced:{' '}
                      <strong className="text-slate-700">
                        {selectedApp.efilingg_synced_at
                          ? new Date(selectedApp.efilingg_synced_at).toLocaleString()
                          : 'Never'}
                      </strong>
                    </div>
                    {selectedApp.efilingg_sync_error && (
                      <div className="text-rose-600 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Sync Error: {selectedApp.efilingg_sync_error}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Form to Update Filing References */}
                <form onSubmit={handleUpdateFilingReferences} className="space-y-3 pt-3 border-t border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Manual Filing References & Status Update
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Super Admin Override
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">ARN Number:</label>
                      <input
                        type="text"
                        placeholder="e.g. AA270124012345M"
                        value={filingArn}
                        onChange={(e) => setFilingArn(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">SRN Number:</label>
                      <input
                        type="text"
                        placeholder="e.g. R98765432"
                        value={filingSrn}
                        onChange={(e) => setFilingSrn(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Challan / Receipt #:</label>
                      <input
                        type="text"
                        placeholder="e.g. CHL-2024-8877"
                        value={filingChallan}
                        onChange={(e) => setFilingChallan(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Filing Status:</label>
                      <select
                        value={filingStatusInput}
                        onChange={(e) => setFilingStatusInput(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="NOT_SYNCED">NOT_SYNCED</option>
                        <option value="SYNCED">SYNCED</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="QUERY_RAISED">QUERY_RAISED</option>
                        <option value="APPROVED">APPROVED</option>
                        <option value="REJECTED">REJECTED</option>
                        <option value="FAILED">FAILED</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Optional filing audit notes (e.g. Verified on MCA portal / Challan paid)..."
                      value={filingNotes}
                      onChange={(e) => setFilingNotes(e.target.value)}
                      className="w-full sm:flex-1 p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-slate-900"
                    />
                    <button
                      type="submit"
                      disabled={isUpdatingReferences}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-sm transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isUpdatingReferences ? (
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Saving References...
                        </span>
                      ) : (
                        'Save Filing References'
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* WORK ASSIGNMENT SECTION */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    Specialist Assignment
                  </h4>
                  {selectedApp.assigned_to_name && (
                    <span className="text-[11px] text-slate-500">
                      Currently Assigned: <strong className="text-indigo-700">{selectedApp.assigned_to_name}</strong>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select Assignee:</label>
                    <select
                      value={selectedAssigneeId}
                      onChange={(e) => setSelectedAssigneeId(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">-- Choose Specialist --</option>
                      {assignees.map((asg) => (
                        <option key={asg.id} value={asg.id}>
                          {asg.name} ({asg.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Optional assignment instructions..."
                      value={assignmentNotes}
                      onChange={(e) => setAssignmentNotes(e.target.value)}
                      className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-slate-900"
                    />
                    <button
                      onClick={handleAssignWork}
                      disabled={isAssigning || !selectedAssigneeId}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-sm transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isAssigning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Assign'}
                    </button>
                  </div>
                </div>
              </div>

              {/* DOCUMENT VERIFY / REJECT CHECKLIST */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-700" />
                    Mandatory Document Verification Checklist
                  </h4>
                  <span className="text-xs text-slate-500">
                    Verified:{' '}
                    <strong className="text-emerald-700">
                      {selectedApp.documents?.filter((d) => d.status === 'VERIFIED').length || 0}
                    </strong>{' '}
                    / {selectedApp.documents?.length || 0}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {selectedApp.documents && selectedApp.documents.length > 0 ? (
                    selectedApp.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          doc.status === 'VERIFIED'
                            ? 'bg-emerald-50/30 border-emerald-200'
                            : doc.status === 'REJECTED'
                            ? 'bg-rose-50/40 border-rose-200'
                            : doc.status === 'UPLOADED'
                            ? 'bg-blue-50/30 border-blue-200'
                            : 'bg-slate-50/50 border-slate-200'
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

                            {/* File name & size */}
                            {doc.file_name ? (
                              <div className="text-[11px] text-slate-600 flex items-center gap-2 font-mono">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span className="font-semibold text-slate-800">{doc.file_name}</span>
                                {doc.file_size && (
                                  <span className="text-slate-400">
                                    ({(doc.file_size / 1024).toFixed(1)} KB)
                                  </span>
                                )}
                                {doc.uploaded_at && (
                                  <span className="text-slate-400">
                                    Uploaded: {new Date(doc.uploaded_at).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">No file uploaded by franchise yet.</p>
                            )}

                            {/* Rejection note */}
                            {doc.status === 'REJECTED' && doc.rejection_reason && (
                              <div className="text-[11px] text-rose-700 bg-rose-100/70 p-2 rounded border border-rose-200 font-medium">
                                <strong>Rejection Reason:</strong> {doc.rejection_reason}
                              </div>
                            )}
                          </div>

                          {/* Verification Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Download file button */}
                            {doc.status !== 'MISSING' && (
                              <a
                                href={ApiClient.getServiceApplicationDocumentDownloadUrl(
                                  selectedApp.id,
                                  doc.id
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-xs shadow-sm"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Inspect File
                              </a>
                            )}

                            {/* Verify Button (if uploaded or rejected) */}
                            {doc.status !== 'MISSING' && doc.status !== 'VERIFIED' && (
                              <button
                                onClick={() => handleVerifyDocument(doc.id)}
                                disabled={modalLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-sm transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Verify
                              </button>
                            )}

                            {/* Reject Button (if uploaded or verified) */}
                            {doc.status !== 'MISSING' && doc.status !== 'REJECTED' && (
                              <button
                                onClick={() => {
                                  setRejectingDocId(doc.id);
                                  setDocRejectionReason('');
                                }}
                                disabled={modalLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-semibold text-xs shadow-sm transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                                Reject
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline Document Reject Reason Input */}
                        {rejectingDocId === doc.id && (
                          <div className="mt-3 p-3 bg-white border border-rose-300 rounded-lg space-y-2">
                            <label className="block text-[11px] font-bold text-rose-800">
                              Reason for rejecting "{doc.document_name}":
                            </label>
                            <input
                              type="text"
                              value={docRejectionReason}
                              onChange={(e) => setDocRejectionReason(e.target.value)}
                              placeholder="e.g. Document image is blurry / Expired certificate / Missing page 2..."
                              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-rose-500 focus:bg-white"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setRejectingDocId(null)}
                                className="px-3 py-1 text-slate-600 hover:text-slate-800 font-medium"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleRejectDocument}
                                disabled={!docRejectionReason.trim() || modalLoading}
                                className="px-3.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shadow-sm"
                              >
                                Confirm Rejection
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                      No documents associated with this service.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 font-medium hover:text-slate-800"
              >
                Close Panel
              </button>
              <div className="text-[11px] text-slate-400">
                Created: {new Date(selectedApp.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
