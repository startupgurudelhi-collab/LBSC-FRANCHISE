import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  UserCheck,
  UserPlus,
  RefreshCw,
  X,
  Send,
  Calendar,
  Layers,
  Phone,
  Building,
  AlertCircle,
  ArrowRight,
  Shield,
  ChevronRight,
  MessageSquare,
  History,
  Users,
  Check,
  Flame,
  ArrowRightLeft,
  Briefcase,
  FileText,
  BadgeAlert,
  CloudUpload,
  ExternalLink,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type {
  ServiceApplication,
  ServiceApplicationWorkNote,
  WorkQueueSummary,
  WorkQueueAssigneeOption,
  ServiceMaster,
  SlaStatus,
  User as AuthUser,
  EfilinggIntegrationStatus,
} from '../../types';

interface FranchiseOption {
  id: string;
  name: string;
  code?: string;
}

interface AdminWorkQueueViewProps {
  user: AuthUser;
}

export const AdminWorkQueueView: React.FC<AdminWorkQueueViewProps> = ({ user }) => {
  // Data States
  const [summary, setSummary] = useState<WorkQueueSummary | null>(null);
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [assignees, setAssignees] = useState<WorkQueueAssigneeOption[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [slaFilter, setSlaFilter] = useState<'all' | 'on_track' | 'approaching' | 'breached' | 'none'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // UI Drawer / Modal States
  const [showWorkloadDrawer, setShowWorkloadDrawer] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ServiceApplication | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [workNotes, setWorkNotes] = useState<ServiceApplicationWorkNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(true);
  const [submittingNote, setSubmittingNote] = useState(false);

  // Assignment Modal State
  const [assignModalApp, setAssignModalApp] = useState<ServiceApplication | null>(null);
  const [targetAssigneeId, setTargetAssigneeId] = useState<string>('');
  const [targetPriority, setTargetPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [assignNotes, setAssignNotes] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Reassignment Modal State
  const [reassignModalApp, setReassignModalApp] = useState<ServiceApplication | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');
  const [reassignNotes, setReassignNotes] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [confirmReassignStep, setConfirmReassignStep] = useState(false);

  // Status/Alert Feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Efilingg Gateway & Operations State (Phase 19B)
  const [efilinggGatewayStatus, setEfilinggGatewayStatus] = useState<EfilinggIntegrationStatus | null>(null);
  const [syncingAppId, setSyncingAppId] = useState<string | null>(null);
  const [efilinggModalApp, setEfilinggModalApp] = useState<ServiceApplication | null>(null);
  const [efilinggFormArn, setEfilinggFormArn] = useState<string>('');
  const [efilinggFormSrn, setEfilinggFormSrn] = useState<string>('');
  const [efilinggFormChallan, setEfilinggFormChallan] = useState<string>('');
  const [efilinggFormStatus, setEfilinggFormStatus] = useState<string>('');
  const [efilinggFormNotes, setEfilinggFormNotes] = useState<string>('');
  const [savingFilingRefs, setSavingFilingRefs] = useState<boolean>(false);

  // Fetch Efilingg Gateway Status
  const fetchEfilinggStatus = useCallback(async () => {
    try {
      const res = await ApiClient.getEfilinggStatus();
      if (res?.data) {
        setEfilinggGatewayStatus(res.data);
      }
    } catch (err: any) {
      console.warn('Efilingg gateway status not accessible:', err);
    }
  }, []);

  // Fetch KPI Summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await ApiClient.getWorkQueueSummary();
      if (res?.data) {
        setSummary(res.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch work queue summary:', err);
    }
  }, []);

  // Fetch Assignees with Workload
  const fetchAssignees = useCallback(async () => {
    try {
      const res = await ApiClient.getServiceApplicationAssignees();
      if (res?.data) {
        setAssignees(res.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch assignees:', err);
    }
  }, []);

  // Fetch Queue Applications
  const fetchApplications = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, any> = { limit: 100 };

      if (assignmentFilter !== 'all') {
        params.assignment_status = assignmentFilter;
      }
      if (assigneeFilter !== 'all') {
        params.assigned_to_user_id = assigneeFilter;
      }
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (serviceFilter !== 'all') {
        params.service_id = serviceFilter;
      }
      if (slaFilter !== 'all') {
        params.sla_status = slaFilter;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const res = await ApiClient.getWorkQueue(params);
      if (res?.data) {
        setApplications(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch work queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assignmentFilter, assigneeFilter, priorityFilter, statusFilter, serviceFilter, slaFilter, searchTerm]);

  // Initial Load
  useEffect(() => {
    fetchSummary();
    fetchAssignees();
    fetchApplications();
    fetchEfilinggStatus();

    // Load services metadata
    ApiClient.getServices()
      .then((res: any) => {
        if (res?.data) setServices(res.data);
      })
      .catch(() => {});

    // Load franchises metadata
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
  }, [fetchSummary, fetchAssignees, fetchApplications]);

  // Open Notes & History Panel
  const openHistoryModal = async (app: ServiceApplication) => {
    setSelectedApp(app);
    setShowHistoryModal(true);
    setLoadingNotes(true);
    setActionError(null);
    try {
      const res = await ApiClient.getServiceApplicationWorkNotes(app.id);
      if (res?.data) {
        setWorkNotes(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load work notes:', err);
    } finally {
      setLoadingNotes(false);
    }
  };

  // Add a Work Note
  const handleAddWorkNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !newNoteText.trim()) return;

    try {
      setSubmittingNote(true);
      setActionError(null);
      const res = await ApiClient.addServiceApplicationWorkNote(selectedApp.id, {
        note: newNoteText.trim(),
        is_internal: isInternalNote,
      });

      if (res?.data) {
        setWorkNotes((prev) => [res.data, ...prev]);
        setNewNoteText('');
        setActionSuccess('Work note recorded successfully.');
        fetchApplications();
        setTimeout(() => setActionSuccess(null), 3000);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to add work note');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Open Assign Modal
  const openAssignModal = (app: ServiceApplication) => {
    setAssignModalApp(app);
    setTargetAssigneeId(app.assigned_to_user_id || (assignees[0]?.id ?? ''));
    setTargetPriority(app.priority || 'normal');
    setAssignNotes(app.assignment_notes || '');
    setActionError(null);
    setActionSuccess(null);
  };

  // Submit Assignment
  const handleAssignSubmit = async () => {
    if (!assignModalApp || !targetAssigneeId) return;

    try {
      setIsAssigning(true);
      setActionError(null);

      const res = await ApiClient.assignServiceApplication(assignModalApp.id, {
        assigned_to_user_id: targetAssigneeId,
        assignment_notes: assignNotes.trim() || null,
        priority: targetPriority,
        move_to_assigned_status: true,
      });

      if (res?.data) {
        setActionSuccess(`Work assigned successfully to ${res.data.assigned_to_name || 'specialist'}.`);
        setAssignModalApp(null);
        fetchApplications();
        fetchSummary();
        fetchAssignees();
        setTimeout(() => setActionSuccess(null), 4000);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to assign application');
    } finally {
      setIsAssigning(false);
    }
  };

  // Open Reassign Modal
  const openReassignModal = (app: ServiceApplication) => {
    setReassignModalApp(app);
    // Default to first assignee who is not current assignee
    const otherAssignee = assignees.find((a) => a.id !== app.assigned_to_user_id) || assignees[0];
    setReassignTargetId(otherAssignee?.id ?? '');
    setReassignReason('');
    setReassignNotes('');
    setConfirmReassignStep(false);
    setActionError(null);
    setActionSuccess(null);
  };

  // Submit Reassignment
  const handleReassignSubmit = async () => {
    if (!reassignModalApp || !reassignTargetId) return;
    if (!reassignReason.trim() || reassignReason.trim().length < 3) {
      setActionError('Please provide a valid reassignment reason (at least 3 characters).');
      return;
    }

    try {
      setIsReassigning(true);
      setActionError(null);

      const res = await ApiClient.reassignServiceApplication(reassignModalApp.id, {
        assigned_to_user_id: reassignTargetId,
        reassignment_reason: reassignReason.trim(),
        notes: reassignNotes.trim() || undefined,
      });

      if (res?.data) {
        setActionSuccess(
          `Application ${res.data.application_number} successfully reassigned to ${
            res.data.assigned_to_name || 'new specialist'
          }.`
        );
        setReassignModalApp(null);
        setConfirmReassignStep(false);
        fetchApplications();
        fetchSummary();
        fetchAssignees();
        setTimeout(() => setActionSuccess(null), 4000);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reassign application');
    } finally {
      setIsReassigning(false);
    }
  };

  // Quick KPI Card Filter Handler
  const handleKpiClick = (type: 'active' | 'unassigned' | 'assigned' | 'in_progress' | 'sla_approaching' | 'sla_breached') => {
    switch (type) {
      case 'active':
        setAssignmentFilter('all');
        setSlaFilter('all');
        setStatusFilter('all');
        break;
      case 'unassigned':
        setAssignmentFilter('unassigned');
        setSlaFilter('all');
        break;
      case 'assigned':
        setAssignmentFilter('assigned');
        setSlaFilter('all');
        break;
      case 'in_progress':
        setStatusFilter('IN_PROGRESS');
        setAssignmentFilter('all');
        setSlaFilter('all');
        break;
      case 'sla_approaching':
        setSlaFilter('approaching');
        setAssignmentFilter('all');
        break;
      case 'sla_breached':
        setSlaFilter('breached');
        setAssignmentFilter('all');
        break;
    }
  };

  // SLA Badge Helper
  const getSlaBadge = (app: ServiceApplication) => {
    const status = app.sla_status;
    const remaining = app.sla_remaining_hours;

    if (app.status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <Check className="w-3 h-3 text-slate-500" />
          Completed
        </span>
      );
    }

    if (status === 'breached') {
      const overdueHours = remaining !== null && remaining !== undefined ? Math.abs(remaining) : null;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
          <Flame className="w-3 h-3 text-rose-600" />
          SLA Breached {overdueHours !== null ? `(${overdueHours.toFixed(1)}h overdue)` : ''}
        </span>
      );
    }

    if (status === 'approaching') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
          <Clock className="w-3 h-3 text-amber-600" />
          Due Soon {remaining !== null && remaining !== undefined ? `(${remaining.toFixed(1)}h left)` : ''}
        </span>
      );
    }

    if (status === 'on_track') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          On Track {remaining !== null && remaining !== undefined ? `(${remaining.toFixed(1)}h left)` : ''}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-400" />
        No SLA
      </span>
    );
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Approved (Ready)
          </span>
        );
      case 'ASSIGNED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Assigned
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            In Progress
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            Completed
          </span>
        );
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
            {status.replace('_', ' ')}
          </span>
        );
      case 'ACTION_REQUIRED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
            Action Req.
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  // Efilingg Upstream Status Badge Helper (Phase 19B)
  const getEfilinggStatusBadge = (status?: string | null) => {
    if (!status || status === 'NOT_SYNCED') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          NOT SYNCED
        </span>
      );
    }
    const s = status.toUpperCase();
    if (s === 'SYNCED') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          SYNCED
        </span>
      );
    }
    if (s === 'IN_PROGRESS') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          IN PROGRESS
        </span>
      );
    }
    if (s === 'APPROVED') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
          APPROVED
        </span>
      );
    }
    if (s === 'QUERY_RAISED') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          QUERY RAISED
        </span>
      );
    }
    if (s === 'FAILED' || s === 'REJECTED') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          {s}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        {status}
      </span>
    );
  };

  // Efilingg Sync Action (Phase 19B)
  const handleSyncEfilingg = async (app: ServiceApplication) => {
    try {
      setSyncingAppId(app.id);
      setActionError(null);
      const res = await ApiClient.syncApplicationWithEfilingg(app.id);
      if (res?.success && res?.data) {
        setActionSuccess(
          res.message || '[SANDBOX/SIMULATED] Application filing simulated successfully. No external API call made.'
        );
        // Refresh local applications state
        setApplications((prev) =>
          prev.map((a) => (a.id === app.id ? { ...a, ...res.data.updatedApplication } : a))
        );
        if (efilinggModalApp && efilinggModalApp.id === app.id) {
          setEfilinggModalApp((prev) => (prev ? { ...prev, ...res.data.updatedApplication } : null));
          setEfilinggFormArn(res.data.updatedApplication.arn_number || '');
          setEfilinggFormSrn(res.data.updatedApplication.srn_number || '');
          setEfilinggFormChallan(res.data.updatedApplication.challan_number || '');
          setEfilinggFormStatus(res.data.updatedApplication.efilingg_status || '');
        }
        fetchEfilinggStatus();
        setTimeout(() => setActionSuccess(null), 4000);
      } else {
        setActionError(res?.error?.message || 'Failed to sync with Efilingg');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error occurred while syncing with Efilingg');
    } finally {
      setSyncingAppId(null);
    }
  };

  // Open Efilingg Modal (Phase 19B)
  const openEfilinggModal = (app: ServiceApplication) => {
    setEfilinggModalApp(app);
    setEfilinggFormArn(app.arn_number || '');
    setEfilinggFormSrn(app.srn_number || '');
    setEfilinggFormChallan(app.challan_number || '');
    setEfilinggFormStatus(app.efilingg_status || '');
    setEfilinggFormNotes('');
    setActionError(null);
    setActionSuccess(null);
  };

  // Save Manual Filing References (Phase 19B)
  const handleSaveFilingReferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!efilinggModalApp) return;

    try {
      setSavingFilingRefs(true);
      setActionError(null);
      const res = await ApiClient.updateFilingReferences(efilinggModalApp.id, {
        arn_number: efilinggFormArn.trim() || null,
        srn_number: efilinggFormSrn.trim() || null,
        challan_number: efilinggFormChallan.trim() || null,
        efilingg_status: efilinggFormStatus.trim() || null,
        notes: efilinggFormNotes.trim() || null,
      });

      if (res?.success && res?.data) {
        setActionSuccess('Filing references updated successfully.');
        setApplications((prev) =>
          prev.map((a) => (a.id === efilinggModalApp.id ? { ...a, ...res.data } : a))
        );
        setEfilinggModalApp((prev) => (prev ? { ...prev, ...res.data } : null));
        fetchEfilinggStatus();
        setTimeout(() => setActionSuccess(null), 3000);
      } else {
        setActionError(res?.error?.message || 'Failed to update filing references');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error occurred while updating references');
    } finally {
      setSavingFilingRefs(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Hero */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center text-amber-700 shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Operations Work Queue</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  Super Admin Control
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Real-time operational triage, specialist work assignment, SLA monitoring, and cross-application activity
                logging across all partner franchise filings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowWorkloadDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-2xs"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Team Workload ({assignees.length})</span>
            </button>

            <button
              onClick={() => {
                setRefreshing(true);
                fetchSummary();
                fetchAssignees();
                fetchApplications();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {actionSuccess && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Efilingg Gateway Mode & Health Bar (Phase 19B) */}
        <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
              {efilinggGatewayStatus?.mode || 'SANDBOX'} / SIMULATED
            </span>
            <div className="text-slate-700">
              <span className="font-semibold text-slate-900">Efilingg Integration Gateway</span>:{' '}
              <span className="text-slate-600">
                {efilinggGatewayStatus?.statusMessage || 'Running in SANDBOX/SIMULATED mode. Safe for operations testing.'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
            <span className="font-medium">
              Synced: <strong className="text-slate-800">{efilinggGatewayStatus?.totalSyncedApplications ?? 0}</strong>
            </span>
            <span>•</span>
            <span className="font-medium">
              With ARN: <strong className="text-slate-800">{efilinggGatewayStatus?.totalWithArn ?? 0}</strong>
            </span>
            <span>•</span>
            <span className="font-medium">
              With SRN: <strong className="text-slate-800">{efilinggGatewayStatus?.totalWithSrn ?? 0}</strong>
            </span>
          </div>
        </div>

        {/* KPI Cards: Active, Unassigned, Assigned, In Progress, SLA Approaching, SLA Breached */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-100">
          {/* 1. Active */}
          <button
            type="button"
            onClick={() => handleKpiClick('active')}
            className="text-left p-3 rounded-lg border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100/80 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active</span>
              <Layers className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">{summary?.active_total ?? 0}</div>
            <p className="text-[10px] text-slate-400 mt-0.5">Non-completed queue</p>
          </button>

          {/* 2. Unassigned */}
          <button
            type="button"
            onClick={() => handleKpiClick('unassigned')}
            className={`text-left p-3 rounded-lg border transition-all cursor-pointer group ${
              assignmentFilter === 'unassigned'
                ? 'bg-amber-100/70 border-amber-300 ring-2 ring-amber-400/40'
                : 'bg-amber-50/50 border-amber-200 hover:bg-amber-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Unassigned</span>
              <UserPlus className="w-3.5 h-3.5 text-amber-600 group-hover:text-amber-800" />
            </div>
            <div className="text-xl font-bold text-amber-900 mt-1">{summary?.unassigned_total ?? 0}</div>
            <p className="text-[10px] text-amber-700 mt-0.5">Requires specialist</p>
          </button>

          {/* 3. Assigned */}
          <button
            type="button"
            onClick={() => handleKpiClick('assigned')}
            className={`text-left p-3 rounded-lg border transition-all cursor-pointer group ${
              assignmentFilter === 'assigned'
                ? 'bg-indigo-100/70 border-indigo-300 ring-2 ring-indigo-400/40'
                : 'bg-indigo-50/40 border-indigo-200 hover:bg-indigo-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Assigned</span>
              <UserCheck className="w-3.5 h-3.5 text-indigo-600 group-hover:text-indigo-800" />
            </div>
            <div className="text-xl font-bold text-indigo-900 mt-1">{summary?.assigned_total ?? 0}</div>
            <p className="text-[10px] text-indigo-600 mt-0.5">Specialist delegated</p>
          </button>

          {/* 4. In Progress */}
          <button
            type="button"
            onClick={() => handleKpiClick('in_progress')}
            className={`text-left p-3 rounded-lg border transition-all cursor-pointer group ${
              statusFilter === 'IN_PROGRESS'
                ? 'bg-blue-100/70 border-blue-300 ring-2 ring-blue-400/40'
                : 'bg-blue-50/40 border-blue-200 hover:bg-blue-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">In Progress</span>
              <Clock className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-800" />
            </div>
            <div className="text-xl font-bold text-blue-900 mt-1">{summary?.in_progress_total ?? 0}</div>
            <p className="text-[10px] text-blue-600 mt-0.5">Filing / documentation</p>
          </button>

          {/* 5. SLA Approaching */}
          <button
            type="button"
            onClick={() => handleKpiClick('sla_approaching')}
            className={`text-left p-3 rounded-lg border transition-all cursor-pointer group ${
              slaFilter === 'approaching'
                ? 'bg-orange-100/70 border-orange-300 ring-2 ring-orange-400/40'
                : 'bg-orange-50/40 border-orange-200 hover:bg-orange-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">SLA Approaching</span>
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600 group-hover:text-orange-800" />
            </div>
            <div className="text-xl font-bold text-orange-950 mt-1">{summary?.sla_approaching_total ?? 0}</div>
            <p className="text-[10px] text-orange-700 mt-0.5">&lt; 24 hours left</p>
          </button>

          {/* 6. SLA Breached */}
          <button
            type="button"
            onClick={() => handleKpiClick('sla_breached')}
            className={`text-left p-3 rounded-lg border transition-all cursor-pointer group ${
              slaFilter === 'breached'
                ? 'bg-rose-100/70 border-rose-300 ring-2 ring-rose-400/40'
                : 'bg-rose-50/40 border-rose-200 hover:bg-rose-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">SLA Breached</span>
              <Flame className="w-3.5 h-3.5 text-rose-600 group-hover:text-rose-800" />
            </div>
            <div className="text-xl font-bold text-rose-950 mt-1">{summary?.sla_breached_total ?? 0}</div>
            <p className="text-[10px] text-rose-700 mt-0.5">Turnaround exceeded</p>
          </button>
        </div>
      </div>

      {/* Filter Toolbar: assignment, assignee, priority, status, service, SLA, search */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by application #, client name, service, or franchise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Assignment Filter */}
          <div className="w-full sm:w-44">
            <select
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Assignment: All</option>
              <option value="unassigned">Unassigned Only</option>
              <option value="assigned">Assigned Only</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div className="w-full sm:w-48">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Assignee: All Specialists</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.active_assignments_count} active)
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="w-full sm:w-36">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Priority: All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Status: All</option>
              <option value="APPROVED">Approved (Ready)</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="ACTION_REQUIRED">Action Required</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {/* SLA Filter */}
          <div className="w-full sm:w-40">
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">SLA: All</option>
              <option value="on_track">On Track</option>
              <option value="approaching">Approaching (&lt;24h)</option>
              <option value="breached">Breached (Overdue)</option>
            </select>
          </div>
        </div>

        {/* Secondary Row: Service Selector & Active Filter Indicators */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Service:</span>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-indigo-500 text-slate-700"
            >
              <option value="all">All Services ({services.length})</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {(assignmentFilter !== 'all' ||
              assigneeFilter !== 'all' ||
              priorityFilter !== 'all' ||
              statusFilter !== 'all' ||
              serviceFilter !== 'all' ||
              slaFilter !== 'all' ||
              searchTerm) && (
              <button
                onClick={() => {
                  setAssignmentFilter('all');
                  setAssigneeFilter('all');
                  setPriorityFilter('all');
                  setStatusFilter('all');
                  setServiceFilter('all');
                  setSlaFilter('all');
                  setSearchTerm('');
                }}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 underline"
              >
                Reset All Filters
              </button>
            )}
            <span className="text-slate-400 font-medium">
              Showing <strong>{applications.length}</strong> applications
            </span>
          </div>
        </div>
      </div>

      {/* Main Work Queue Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-2" />
            <p className="text-xs font-semibold">Loading operations work queue...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No applications match your work queue filters</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Try adjusting your search criteria, clearing the assignee or SLA filter, or check back as new applications
              are submitted.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Application & Client</th>
                  <th className="py-3 px-4">Service & Turnaround</th>
                  <th className="py-3 px-4">Priority & Status</th>
                  <th className="py-3 px-4">SLA Deadline</th>
                  <th className="py-3 px-4">Specialist Assignee</th>
                  <th className="py-3 px-4">Efilingg & Filing</th>
                  <th className="py-3 px-4">Activity & Notes</th>
                  <th className="py-3 px-4 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      app.sla_status === 'breached'
                        ? 'bg-rose-50/20'
                        : app.sla_status === 'approaching'
                        ? 'bg-amber-50/20'
                        : ''
                    }`}
                  >
                    {/* Application & Client */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-bold text-slate-900 font-mono">{app.application_number}</div>
                      <div className="text-slate-800 font-medium mt-0.5">{app.client_name}</div>
                      {app.franchise_name && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{app.franchise_name}</span>
                        </div>
                      )}
                    </td>

                    {/* Service & Turnaround */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-semibold text-slate-900 line-clamp-1">{app.service_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{app.service_code}</div>
                      {(app.turnaround_days || app.sla_hours) && (
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            Target: {app.turnaround_days ? `${app.turnaround_days}d` : `${app.sla_hours}h`}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Priority & Status */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex flex-col gap-1.5 items-start">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            app.priority === 'urgent'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : app.priority === 'high'
                              ? 'bg-orange-100 text-orange-800 border border-orange-200'
                              : app.priority === 'low'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}
                        >
                          {app.priority}
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                    </td>

                    {/* SLA Deadline & Status */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="space-y-1">
                        {getSlaBadge(app)}
                        {app.sla_due_at ? (
                          <div className="text-[10px] text-slate-500 font-medium">
                            Due: {new Date(app.sla_due_at).toLocaleDateString()}{' '}
                            {new Date(app.sla_due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">No deadline set</div>
                        )}
                      </div>
                    </td>

                    {/* Specialist Assignee */}
                    <td className="py-3.5 px-4 align-top">
                      {app.assigned_to_name ? (
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{app.assigned_to_name}</span>
                          </div>
                          {app.assigned_at && (
                            <div className="text-[10px] text-slate-400">
                              Assigned {new Date(app.assigned_at).toLocaleDateString()}
                            </div>
                          )}
                          {Boolean(app.reassigned_count && app.reassigned_count > 0) && (
                            <div className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              <ArrowRightLeft className="w-2.5 h-2.5" />
                              <span>Reassigned {app.reassigned_count}x</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <UserPlus className="w-3 h-3 text-amber-600" />
                            Unassigned
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Efilingg & Filing Status (Phase 19B) */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getEfilinggStatusBadge(app.efilingg_status)}
                          {app.external_filing_id && (
                            <span className="text-[10px] text-amber-800 bg-amber-100/70 px-1 py-0.2 rounded border border-amber-200 font-bold uppercase tracking-wider">
                              Simulated
                            </span>
                          )}
                        </div>

                        {app.external_filing_id ? (
                          <div className="text-[11px] font-mono text-slate-700 font-medium truncate max-w-[170px]" title={app.external_filing_id}>
                            ID: {app.external_filing_id}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">Not synced yet</div>
                        )}

                        {(app.arn_number || app.srn_number || app.challan_number) && (
                          <div className="text-[10px] text-slate-600 font-mono space-y-0.5 pt-0.5">
                            {app.arn_number && <div>ARN: <span className="font-semibold text-slate-900">{app.arn_number}</span></div>}
                            {app.srn_number && <div>SRN: <span className="font-semibold text-slate-900">{app.srn_number}</span></div>}
                            {app.challan_number && <div>Challan: <span className="font-semibold text-slate-900">{app.challan_number}</span></div>}
                          </div>
                        )}

                        {app.efilingg_sync_error && (
                          <div className="text-[10px] text-rose-700 bg-rose-50 p-1 rounded border border-rose-200 line-clamp-1 max-w-[170px]" title={app.efilingg_sync_error}>
                            Error: {app.efilingg_sync_error}
                          </div>
                        )}

                        {app.efilingg_synced_at && (
                          <div className="text-[9px] text-slate-400">
                            Synced {new Date(app.efilingg_synced_at).toLocaleDateString()} {new Date(app.efilingg_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Activity & Notes */}
                    <td className="py-3.5 px-4 align-top">
                      <button
                        onClick={() => openHistoryModal(app)}
                        className="text-left group flex items-start gap-1.5 hover:text-indigo-600 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-slate-700 group-hover:text-indigo-600">
                            {app.work_notes_count || 0} notes
                          </span>
                          {app.latest_work_note ? (
                            <p className="text-[11px] text-slate-500 line-clamp-1 max-w-[170px] italic">
                              "{app.latest_work_note}"
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic">No notes yet</p>
                          )}
                        </div>
                      </button>
                    </td>

                    {/* Actions: Assign / Reassign / Sync Efilingg / Edit References / History */}
                    <td className="py-3.5 px-4 align-top text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Manual Sync with Efilingg Button (Phase 19B) */}
                        <button
                          onClick={() => handleSyncEfilingg(app)}
                          disabled={syncingAppId === app.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                          title="Sync with Efilingg Gateway (SANDBOX/SIMULATED)"
                        >
                          <CloudUpload className={`w-3 h-3 text-sky-600 ${syncingAppId === app.id ? 'animate-bounce' : ''}`} />
                          <span>{syncingAppId === app.id ? 'Syncing...' : 'Sync Efilingg'}</span>
                        </button>

                        {/* Open Efilingg Modal (Phase 19B) */}
                        <button
                          onClick={() => openEfilinggModal(app)}
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          title="Manage Efilingg & Government References"
                        >
                          <FileText className="w-4 h-4" />
                        </button>

                        {!app.assigned_to_user_id ? (
                          <button
                            onClick={() => openAssignModal(app)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                            title="Assign specialist"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Assign</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => openReassignModal(app)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors"
                            title="Reassign to another specialist"
                          >
                            <ArrowRightLeft className="w-3 h-3 text-slate-600" />
                            <span>Reassign</span>
                          </button>
                        )}

                        <button
                          onClick={() => openHistoryModal(app)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="View history and add work notes"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DRAWER: TEAM WORKLOAD & CAPACITY                                          */}
      {/* ========================================================================= */}
      {showWorkloadDrawer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Operations Team Workload</h3>
                  <p className="text-[11px] text-slate-500">Live capacity and active application count per specialist</p>
                </div>
              </div>
              <button
                onClick={() => setShowWorkloadDrawer(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Specialist List */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {assignees.length === 0 ? (
                <p className="text-slate-400 italic text-center py-8">No specialists registered in team directory.</p>
              ) : (
                assignees.map((spec) => {
                  const isOverburdened = spec.active_assignments_count >= 6;
                  const isModerate = spec.active_assignments_count >= 3 && spec.active_assignments_count < 6;

                  return (
                    <div
                      key={spec.id}
                      className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-all space-y-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{spec.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-700">
                              {spec.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">{spec.email}</div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isOverburdened
                              ? 'bg-rose-100 text-rose-800'
                              : isModerate
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isOverburdened ? 'Heavy Load' : isModerate ? 'Moderate' : 'Available'}
                        </span>
                      </div>

                      {/* Workload Metric Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">Active Applications:</span>
                          <span className="font-bold text-slate-900">{spec.active_assignments_count}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverburdened ? 'bg-rose-500' : isModerate ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(spec.active_assignments_count * 14, 100)}%` }}
                          />
                        </div>
                      </div>

                      {spec.pending_sla_breach_count > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200 font-medium">
                          <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>{spec.pending_sla_breach_count} applications overdue / approaching breach</span>
                        </div>
                      )}

                      {/* Filter by this specialist */}
                      <button
                        onClick={() => {
                          setAssigneeFilter(spec.id);
                          setAssignmentFilter('assigned');
                          setShowWorkloadDrawer(false);
                        }}
                        className="w-full py-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50/50 transition-colors text-center"
                      >
                        Filter Queue for {spec.name.split(' ')[0]}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button
                onClick={() => setShowWorkloadDrawer(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Close Workload View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ASSIGN SPECIALIST                                                  */}
      {/* ========================================================================= */}
      {assignModalApp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Assign Specialist: {assignModalApp.application_number}
                </h3>
              </div>
              <button onClick={() => setAssignModalApp(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Application Summary Box */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-900">{assignModalApp.service_name}</div>
                <div className="text-slate-600">
                  Client: <strong>{assignModalApp.client_name}</strong> • Franchise:{' '}
                  <strong>{assignModalApp.franchise_name || 'Partner'}</strong>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {getSlaBadge(assignModalApp)}
                  <span className="text-[10px] text-slate-500 font-mono">
                    Target: {assignModalApp.turnaround_days ? `${assignModalApp.turnaround_days} days` : '72 hours'}
                  </span>
                </div>
              </div>

              {/* Assignee Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select Specialist Assignee *
                </label>
                <select
                  value={targetAssigneeId}
                  onChange={(e) => setTargetAssigneeId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                >
                  <option value="" disabled>
                    -- Select Assignee --
                  </option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role}) — {a.active_assignments_count} active assignments
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Operational Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTargetPriority(p)}
                      className={`py-1.5 rounded-lg border font-semibold capitalize text-center transition-colors ${
                        targetPriority === p
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignment Instructions */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Assignment Instructions & Internal Notes
                </label>
                <textarea
                  rows={3}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Instructions for the assigned specialist, specific filing deadlines, or portal notes..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>

              {actionError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[11px]">
                  {actionError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAssignModalApp(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isAssigning || !targetAssigneeId}
                onClick={handleAssignSubmit}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isAssigning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REASSIGN SPECIALIST WITH CLEAR AUDIT CONFIRMATION                  */}
      {/* ========================================================================= */}
      {reassignModalApp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 bg-amber-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-700" />
                <h3 className="text-sm font-bold text-amber-950">
                  Reassign Work: {reassignModalApp.application_number}
                </h3>
              </div>
              <button onClick={() => setReassignModalApp(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Current Assignee Warning Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Current Assignee</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">
                    {reassignModalApp.assigned_to_name || 'Specialist'}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">New Assignee</span>
                  <div className="font-bold text-indigo-700 text-xs mt-0.5">
                    {assignees.find((a) => a.id === reassignTargetId)?.name || 'Selected Specialist'}
                  </div>
                </div>
              </div>

              {!confirmReassignStep ? (
                <>
                  {/* Select New Specialist */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Select New Specialist *
                    </label>
                    <select
                      value={reassignTargetId}
                      onChange={(e) => setReassignTargetId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                    >
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id} disabled={a.id === reassignModalApp.assigned_to_user_id}>
                          {a.name} ({a.role}) — {a.active_assignments_count} active
                          {a.id === reassignModalApp.assigned_to_user_id ? ' (Current Assignee)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reassignment Reason */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Reason for Reassignment * <span className="text-slate-400 font-normal">(Audited)</span>
                    </label>
                    <input
                      type="text"
                      value={reassignReason}
                      onChange={(e) => setReassignReason(e.target.value)}
                      placeholder="e.g., Specialist capacity rebalancing, jurisdiction expertise, leave of absence..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Handoff Notes / Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={reassignNotes}
                      onChange={(e) => setReassignNotes(e.target.value)}
                      placeholder="Any progress made so far, next steps, or specific client instructions..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 resize-none"
                    />
                  </div>
                </>
              ) : (
                /* Confirmation Screen Before Submitting */
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-950 text-xs">Confirm Specialist Reassignment</h4>
                      <p className="text-[11px] text-amber-800 mt-1">
                        You are about to transfer <strong>{reassignModalApp.application_number}</strong> from{' '}
                        <strong>{reassignModalApp.assigned_to_name}</strong> to{' '}
                        <strong>{assignees.find((a) => a.id === reassignTargetId)?.name}</strong>.
                      </p>
                      <p className="text-[11px] text-amber-900 font-medium mt-1">
                        Reason: <em>"{reassignReason}"</em>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {actionError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[11px]">
                  {actionError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (confirmReassignStep) {
                    setConfirmReassignStep(false);
                  } else {
                    setReassignModalApp(null);
                  }
                }}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                {confirmReassignStep ? 'Back to Edit' : 'Cancel'}
              </button>

              {!confirmReassignStep ? (
                <button
                  type="button"
                  disabled={!reassignTargetId || !reassignReason.trim() || reassignReason.trim().length < 3}
                  onClick={() => setConfirmReassignStep(true)}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                >
                  Review Reassignment
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isReassigning}
                  onClick={handleReassignSubmit}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isReassigning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirm & Transfer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APPLICATION WORK HISTORY & NOTES PANEL                             */}
      {/* ========================================================================= */}
      {showHistoryModal && selectedApp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{selectedApp.application_number}</h3>
                    {getStatusBadge(selectedApp.status)}
                    {getSlaBadge(selectedApp)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedApp.service_name} • Client: {selectedApp.client_name}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Timeline & Add Note */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Add Note Form */}
              <form onSubmit={handleAddWorkNote} className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Post Operational Note</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium">Internal Note (Staff only)</span>
                  </label>
                </div>

                <textarea
                  rows={2}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Record specialist update, filing reference number, authority query, or next steps..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 resize-none"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingNote || !newNoteText.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                  >
                    {submittingNote ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Post Note</span>
                  </button>
                </div>
              </form>

              {/* Work Notes / Activity Timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Activity & Work Notes History ({workNotes.length})</span>
                </h4>

                {loadingNotes ? (
                  <div className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-1" />
                    <p className="text-[11px]">Loading history...</p>
                  </div>
                ) : workNotes.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 text-slate-400">
                    No work notes or reassignments recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
                    {workNotes.map((item) => (
                      <div key={item.id} className="relative flex items-start gap-3 pl-1">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 text-[10px] font-bold ${
                            item.note_type === 'reassignment'
                              ? 'bg-amber-100 text-amber-800 ring-2 ring-white'
                              : item.note_type === 'assignment'
                              ? 'bg-indigo-100 text-indigo-800 ring-2 ring-white'
                              : 'bg-slate-200 text-slate-700 ring-2 ring-white'
                          }`}
                        >
                          {item.note_type === 'reassignment' ? (
                            <ArrowRightLeft className="w-3 h-3" />
                          ) : item.note_type === 'assignment' ? (
                            <UserCheck className="w-3 h-3" />
                          ) : (
                            <MessageSquare className="w-3 h-3" />
                          )}
                        </div>

                        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{item.user_name || 'Staff User'}</span>
                              {item.user_role && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                  {item.user_role}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                                  item.note_type === 'reassignment'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : item.note_type === 'assignment'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {item.note_type}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(item.created_at).toLocaleDateString()} •{' '}
                              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 whitespace-pre-wrap mt-1">{item.note}</p>

                          {item.is_internal && (
                            <div className="text-[10px] text-slate-400 italic pt-0.5">Internal operational note</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EFILINGG & GOVERNMENT FILING REFERENCES (PHASE 19B)                */}
      {/* ========================================================================= */}
      {efilinggModalApp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0">
                  <CloudUpload className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      {efilinggModalApp.application_number} — Efilingg Operations
                    </h3>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-400 text-slate-950">
                      SANDBOX / SIMULATED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {efilinggModalApp.service_name} • Client: {efilinggModalApp.client_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEfilinggModalApp(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Sandbox Notice Banner */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs">Notice: Simulated Efilingg Gateway Mode Active</div>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    This system currently operates in <strong>SANDBOX/SIMULATED</strong> mode. No outbound network requests are dispatched to third-party endpoints. External filing IDs and ARNs are simulated deterministically for QA and operational workflows.
                  </p>
                </div>
              </div>

              {/* Status & Sync Action Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Gateway Sync Status
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {getEfilinggStatusBadge(efilinggModalApp.efilingg_status)}
                      {efilinggModalApp.external_filing_id && (
                        <span className="font-mono text-slate-700 font-semibold text-xs">
                          {efilinggModalApp.external_filing_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSyncEfilingg(efilinggModalApp)}
                    disabled={syncingAppId === efilinggModalApp.id}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 shrink-0"
                  >
                    <CloudUpload className={`w-3.5 h-3.5 ${syncingAppId === efilinggModalApp.id ? 'animate-bounce' : ''}`} />
                    <span>{syncingAppId === efilinggModalApp.id ? 'Dispatching...' : 'Sync with Efilingg'}</span>
                  </button>
                </div>

                {efilinggModalApp.efilingg_synced_at && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-200/60">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Last Synced: {new Date(efilinggModalApp.efilingg_synced_at).toLocaleString()}
                    </span>
                  </div>
                )}

                {efilinggModalApp.efilingg_sync_error && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Sync Error:</strong> {efilinggModalApp.efilingg_sync_error}
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Filing References Form */}
              <form onSubmit={handleSaveFilingReferences} className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Government Filing References & Upstream Status
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Record or override official filing numbers received from MCA, GSTN, or department portals.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ARN (Acknowledgment Reference Number)
                    </label>
                    <input
                      type="text"
                      value={efilinggFormArn}
                      onChange={(e) => setEfilinggFormArn(e.target.value)}
                      placeholder="e.g. AA070123456789X"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      SRN (Service Request Number)
                    </label>
                    <input
                      type="text"
                      value={efilinggFormSrn}
                      onChange={(e) => setEfilinggFormSrn(e.target.value)}
                      placeholder="e.g. R12345678"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Challan Number
                    </label>
                    <input
                      type="text"
                      value={efilinggFormChallan}
                      onChange={(e) => setEfilinggFormChallan(e.target.value)}
                      placeholder="e.g. CHN-2026-987"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Upstream Filing Status
                    </label>
                    <select
                      value={efilinggFormStatus}
                      onChange={(e) => setEfilinggFormStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Status: Select...</option>
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

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Operational Note / Reason for Update
                  </label>
                  <textarea
                    rows={2}
                    value={efilinggFormNotes}
                    onChange={(e) => setEfilinggFormNotes(e.target.value)}
                    placeholder="Provide details on manual filing, department query, or challan payment..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEfilinggModalApp(null)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingFilingRefs}
                    className="inline-flex items-center gap-1 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                  >
                    {savingFilingRefs && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save References</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                LBSC Platform Operations • Government Filing Gateway
              </span>
              <button
                type="button"
                onClick={() => setEfilinggModalApp(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
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
