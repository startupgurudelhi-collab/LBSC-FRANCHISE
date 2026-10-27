import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  ArrowRight,
  ShieldCheck,
  Building2,
  UserCheck,
  Clock,
  XCircle,
  MapPin,
  Mail,
  Phone,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { FranchiseApplication } from '../../types';

export const AdminFranchiseRequestsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [applications, setApplications] = useState<FranchiseApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Workflow Modals
  const [screeningModalApp, setScreeningModalApp] = useState<FranchiseApplication | null>(null);
  const [screeningNotes, setScreeningNotes] = useState('');
  const [rejectingModalApp, setRejectingModalApp] = useState<FranchiseApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  // New Application Modal
  const [showNewAppModal, setShowNewAppModal] = useState(false);
  const [newAppForm, setNewAppForm] = useState({
    businessName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    city: '',
    district: '',
    state: '',
    pin: '',
  });
  const [submittingApp, setSubmittingApp] = useState(false);

  const loadApplications = async () => {
    try {
      setError(null);
      const res = await ApiClient.getApplications();
      if (res.success) {
        setApplications(res.data || []);
      } else {
        setError(res.error?.message || 'Failed to load franchise applications');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadApplications();
  };

  // Workflow handlers
  const handleScreen = async () => {
    if (!screeningModalApp) return;
    setActionProcessing(true);
    setError(null);
    try {
      const res = await ApiClient.screenApplication(screeningModalApp.id, screeningNotes);
      if (res.success) {
        setSuccessMessage(`Application ${screeningModalApp.business_name} moved to Screening phase.`);
        setScreeningModalApp(null);
        setScreeningNotes('');
        loadApplications();
      } else {
        setError(res.error?.message || 'Failed to screen application');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing screening action');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleApprove = async (app: FranchiseApplication) => {
    setActionProcessing(true);
    setError(null);
    try {
      const res = await ApiClient.approveApplication(app.id);
      if (res.success) {
        setSuccessMessage(`Application ${app.business_name} approved successfully.`);
        loadApplications();
      } else {
        setError(res.error?.message || 'Failed to approve application');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing approval');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleActivate = async (app: FranchiseApplication) => {
    setActionProcessing(true);
    setError(null);
    try {
      const res = await ApiClient.activateApplication(app.id);
      if (res.success) {
        setSuccessMessage(
          `Franchise ${app.business_name} activated! Organization and commission account provisioned.`
        );
        loadApplications();
      } else {
        setError(res.error?.message || 'Failed to activate franchise');
      }
    } catch (err: any) {
      setError(err.message || 'Error activating franchise');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingModalApp || !rejectionReason.trim()) return;
    setActionProcessing(true);
    setError(null);
    try {
      const res = await ApiClient.rejectApplication(rejectingModalApp.id, rejectionReason.trim());
      if (res.success) {
        setSuccessMessage(`Application ${rejectingModalApp.business_name} has been rejected.`);
        setRejectingModalApp(null);
        setRejectionReason('');
        loadApplications();
      } else {
        setError(res.error?.message || 'Failed to reject application');
      }
    } catch (err: any) {
      setError(err.message || 'Error rejecting application');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingApp(true);
    setError(null);
    try {
      const res = await ApiClient.createApplication(newAppForm);
      if (res.success) {
        setSuccessMessage(`Franchise application for ${newAppForm.businessName} submitted successfully.`);
        setShowNewAppModal(false);
        setNewAppForm({
          businessName: '',
          contactName: '',
          contactEmail: '',
          contactPhone: '',
          city: '',
          district: '',
          state: '',
          pin: '',
        });
        loadApplications();
      } else {
        setError(res.error?.message || 'Failed to create application');
      }
    } catch (err: any) {
      setError(err.message || 'Error submitting application');
    } finally {
      setSubmittingApp(false);
    }
  };

  // Filter logic
  const filteredApplications = applications.filter((app) => {
    const matchesStatus = statusFilter === 'all' ? true : app.status === statusFilter;
    const text = `${app.business_name || ''} ${app.contact_name || ''} ${app.city || ''} ${
      app.state || ''
    } ${app.contact_email || ''}`.toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'application':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Clock className="w-3 h-3" />
            <span>New Application</span>
          </span>
        );
      case 'screening':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <UserCheck className="w-3 h-3" />
            <span>Under Screening</span>
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <ShieldCheck className="w-3 h-3" />
            <span>Approved (Ready for Activation)</span>
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>Activated Center</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>Rejected</span>
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

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Franchise Requests & Applications
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              {applications.length} Total Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review incoming partnership applications, conduct screening, approve licenses, and activate franchise organizations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewAppModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Application</span>
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

      {/* Error & Success Banners */}
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

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Requests' },
            { id: 'application', label: 'New Inquiries' },
            { id: 'screening', label: 'Screening' },
            { id: 'approved', label: 'Approved' },
            { id: 'active', label: 'Active' },
            { id: 'rejected', label: 'Rejected' },
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

        {/* Search */}
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by business name, applicant contact, city, state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-xl"></div>
          ))}
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/80 shadow-2xs text-slate-400 text-xs">
          <FileCheck2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-slate-700">No requests found</p>
          <p className="mt-1">There are no franchise requests matching your current filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApplications.map((app) => (
            <div
              key={app.id}
              className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-sm font-bold text-slate-900">{app.business_name}</h3>
                  {getStatusBadge(app.status)}
                  <span className="font-mono text-[10px] text-slate-400">ID: {app.id}</span>
                </div>

                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-800">{app.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono text-[11px]">{app.contact_email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono text-[11px]">{app.contact_phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {app.city}, {app.district}, {app.state} • {app.pin}
                    </span>
                  </div>
                </div>

                {app.screening_notes && (
                  <div className="p-2 bg-amber-50/70 border border-amber-200/60 rounded text-[11px] text-amber-800">
                    <span className="font-semibold">Screening Notes: </span>
                    {app.screening_notes}
                  </div>
                )}

                {app.rejection_reason && (
                  <div className="p-2 bg-rose-50/70 border border-rose-200/60 rounded text-[11px] text-rose-800">
                    <span className="font-semibold">Rejection Reason: </span>
                    {app.rejection_reason}
                  </div>
                )}
              </div>

              {/* Action Buttons based on workflow stage */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {app.status === 'application' && (
                  <>
                    <button
                      onClick={() => setScreeningModalApp(app)}
                      disabled={actionProcessing}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Start Screening
                    </button>
                    <button
                      onClick={() => setRejectingModalApp(app)}
                      disabled={actionProcessing}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}

                {app.status === 'screening' && (
                  <>
                    <button
                      onClick={() => handleApprove(app)}
                      disabled={actionProcessing}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Approve Request
                    </button>
                    <button
                      onClick={() => setRejectingModalApp(app)}
                      disabled={actionProcessing}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}

                {app.status === 'approved' && (
                  <button
                    onClick={() => handleActivate(app)}
                    disabled={actionProcessing}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Activate Franchise Center</span>
                  </button>
                )}

                {app.status === 'active' && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                    Active Center
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screening Modal */}
      {screeningModalApp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Screen Franchise Application</h3>
                <p className="text-xs text-slate-500 mt-0.5">{screeningModalApp.business_name}</p>
              </div>
              <button
                onClick={() => setScreeningModalApp(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Moving this application to Screening marks it as being under formal document and compliance check.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Screening / Interview Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Add background verification, interview notes, or document check remarks..."
                value={screeningNotes}
                onChange={(e) => setScreeningNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setScreeningModalApp(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleScreen}
                disabled={actionProcessing}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionProcessing ? 'Processing...' : 'Confirm Screening'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingModalApp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-600">
                <XCircle className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Reject Application</h3>
              </div>
              <button
                onClick={() => setRejectingModalApp(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Please state the reason for rejection. This will be recorded on the application audit trail.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rejection Reason (Required)
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Territory already saturated, incomplete compliance verification..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectingModalApp(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionProcessing || !rejectionReason.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionProcessing ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Application Modal */}
      {showNewAppModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">New Franchise Application</h3>
                <p className="text-xs text-slate-500 mt-0.5">Manually enter an offline partner inquiry</p>
              </div>
              <button
                onClick={() => setShowNewAppModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateApplication} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Madurai Legal & Business Services"
                  value={newAppForm.businessName}
                  onChange={(e) => setNewAppForm({ ...newAppForm, businessName: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Partner / Director Name"
                    value={newAppForm.contactName}
                    onChange={(e) => setNewAppForm({ ...newAppForm, contactName: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={newAppForm.contactPhone}
                    onChange={(e) => setNewAppForm({ ...newAppForm, contactPhone: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  required
                  placeholder="applicant@domain.com"
                  value={newAppForm.contactEmail}
                  onChange={(e) => setNewAppForm({ ...newAppForm, contactEmail: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Madurai"
                    value={newAppForm.city}
                    onChange={(e) => setNewAppForm({ ...newAppForm, city: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Madurai"
                    value={newAppForm.district}
                    onChange={(e) => setNewAppForm({ ...newAppForm, district: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PIN</label>
                  <input
                    type="text"
                    required
                    placeholder="6-digit PIN"
                    value={newAppForm.pin}
                    onChange={(e) => setNewAppForm({ ...newAppForm, pin: e.target.value })}
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
                  value={newAppForm.state}
                  onChange={(e) => setNewAppForm({ ...newAppForm, state: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAppModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingApp}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {submittingApp ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
