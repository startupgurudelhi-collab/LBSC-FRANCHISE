import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Filter,
  Phone,
  Mail,
  MapPin,
  Building,
  CreditCard,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  X,
  Edit2,
  Link as LinkIcon,
  Tag,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { Client, Lead, ServiceMaster } from '../types';

interface ClientDirectoryViewProps {
  onRefreshParent?: () => void;
  onNavigateToLeads?: () => void;
  leads?: Lead[];
}

export const ClientDirectoryView: React.FC<ClientDirectoryViewProps> = ({
  onRefreshParent,
  leads = [],
}) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<{
    totalClients: number;
    activeClients: number;
    clientsWithLeads: number;
    newClientsThisMonth: number;
  }>({
    totalClients: 0,
    activeClients: 0,
    clientsWithLeads: 0,
    newClientsThisMonth: 0,
  });

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Selected client for detail drawer
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientDetail, setClientDetail] = useState<{
    client: Client;
    linkedLeads: any[];
    auditLogs: any[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLinkLeadModal, setShowLinkLeadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    alternatePhone: '',
    email: '',
    businessName: '',
    pan: '',
    gstin: '',
    address: '',
    city: 'Salem',
    district: 'Salem',
    state: 'Tamil Nadu',
    pin: '636001',
    source: 'direct',
    notes: '',
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    alternatePhone: '',
    email: '',
    businessName: '',
    pan: '',
    gstin: '',
    address: '',
    city: '',
    district: '',
    state: '',
    pin: '',
    status: 'active',
    notes: '',
  });

  // Link lead state
  const [leadToLink, setLeadToLink] = useState<string>('');

  // Fetch Clients and Stats
  const loadClientsData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsRes, statsRes] = await Promise.all([
        ApiClient.getClients({
          search: search.trim() || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
          source: sourceFilter === 'all' ? undefined : sourceFilter,
          limit: 100,
        }),
        ApiClient.getClientStats(),
      ]);

      if (clientsRes.success && Array.isArray(clientsRes.data)) {
        setClients(clientsRes.data);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (err: any) {
      console.error('Error loading client directory:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter]);

  useEffect(() => {
    loadClientsData();
  }, [loadClientsData]);

  // Load Single Client Details when selected
  const loadClientDetails = async (clientId: string) => {
    setLoadingDetail(true);
    setSelectedClientId(clientId);
    try {
      const res = await ApiClient.getClientById(clientId);
      if (res.success && res.data) {
        setClientDetail(res.data);
        const c = res.data.client;
        setEditForm({
          firstName: c.first_name || '',
          lastName: c.last_name || '',
          alternatePhone: c.alternate_phone || '',
          email: c.email || '',
          businessName: c.business_name || '',
          pan: c.pan || '',
          gstin: c.gstin || '',
          address: c.address || '',
          city: c.city || '',
          district: c.district || '',
          state: c.state || '',
          pin: c.pin || '',
          status: c.status || 'active',
          notes: c.notes || '',
        });
      }
    } catch (err: any) {
      console.error('Error loading client detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await ApiClient.createClient({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim() || undefined,
        phone: createForm.phone.trim(),
        alternatePhone: createForm.alternatePhone.trim() || undefined,
        email: createForm.email.trim() || undefined,
        businessName: createForm.businessName.trim() || undefined,
        pan: createForm.pan.trim() || undefined,
        gstin: createForm.gstin.trim() || undefined,
        address: createForm.address.trim() || undefined,
        city: createForm.city.trim(),
        district: createForm.district.trim(),
        state: createForm.state.trim(),
        pin: createForm.pin.trim() || undefined,
        source: createForm.source,
        notes: createForm.notes.trim() || undefined,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: `Client created: ${res.data.client_number} - ${res.data.full_name}` });
        setShowCreateModal(false);
        setCreateForm({
          firstName: '',
          lastName: '',
          phone: '',
          alternatePhone: '',
          email: '',
          businessName: '',
          pan: '',
          gstin: '',
          address: '',
          city: 'Salem',
          district: 'Salem',
          state: 'Tamil Nadu',
          pin: '636001',
          source: 'direct',
          notes: '',
        });
        loadClientsData();
        if (onRefreshParent) onRefreshParent();
      } else {
        setFeedback({ type: 'error', message: res.error?.message || 'Failed to create client' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An unexpected error occurred' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await ApiClient.updateClient(selectedClientId, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim() || undefined,
        alternatePhone: editForm.alternatePhone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        businessName: editForm.businessName.trim() || undefined,
        pan: editForm.pan.trim() || undefined,
        gstin: editForm.gstin.trim() || undefined,
        address: editForm.address.trim() || undefined,
        city: editForm.city.trim(),
        district: editForm.district.trim(),
        state: editForm.state.trim(),
        pin: editForm.pin.trim() || undefined,
        status: editForm.status,
        notes: editForm.notes.trim() || undefined,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: 'Client profile updated successfully.' });
        setShowEditModal(false);
        loadClientDetails(selectedClientId);
        loadClientsData();
      } else {
        setFeedback({ type: 'error', message: res.error?.message || 'Failed to update client' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error updating client' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !leadToLink) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await ApiClient.linkLeadToClient(selectedClientId, leadToLink);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Lead successfully linked to client!' });
        setShowLinkLeadModal(false);
        setLeadToLink('');
        loadClientDetails(selectedClientId);
        loadClientsData();
      } else {
        setFeedback({ type: 'error', message: res.error?.message || 'Failed to link lead' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error linking lead' });
    } finally {
      setSubmitting(false);
    }
  };

  // Unlinked franchise leads for linkage dropdown
  const unlinkedLeads = leads.filter(
    (l) => !clientDetail?.linkedLeads.some((ll) => ll.id === l.id)
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Client Directory</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage your franchise client profiles, corporate tax credentials, and historical service leads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadClientsData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setFeedback(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Client Profile</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Clients
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{stats.totalClients}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Franchise records</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Active Clients
          </span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.activeClients}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Currently active</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            With Linked Leads
          </span>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{stats.clientsWithLeads}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Have lead history</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            New This Month
          </span>
          <div className="text-2xl font-bold text-blue-600 mt-1">{stats.newClientsThisMonth}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Recent registrations</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, phone, client #, business name, PAN, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-700 text-xs focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-transparent text-slate-700 text-xs focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="direct">Direct</option>
              <option value="lead">Lead Ingest</option>
              <option value="referral">Referral</option>
              <option value="walk_in">Walk In</option>
            </select>
          </div>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Client #</th>
                <th className="px-5 py-3">Customer / Business</th>
                <th className="px-5 py-3">Phone & Email</th>
                <th className="px-5 py-3">Territory</th>
                <th className="px-5 py-3">Leads</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    <span>Loading franchise clients...</span>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No client profiles found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Create your first client profile or adjust your search filters.
                    </p>
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => loadClientDetails(client.id)}
                  >
                    <td className="px-5 py-3.5 font-mono font-medium text-indigo-700">
                      {client.client_number}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{client.full_name}</div>
                      {client.business_name && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>{client.business_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-800">{client.phone}</div>
                      {client.email && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{client.email}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-700">
                        {client.city}, {client.district}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {client.leads_count ?? 0} {client.leads_count === 1 ? 'Lead' : 'Leads'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          client.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : client.status === 'inactive'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 capitalize text-[11px] text-slate-500">
                      {client.source.replace('_', ' ')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          loadClientDetails(client.id);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="View Client Details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client Detail Drawer / Modal */}
      {selectedClientId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {clientDetail?.client.first_name?.[0]}
                  {clientDetail?.client.last_name?.[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {clientDetail?.client.full_name}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {clientDetail?.client.client_number}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {clientDetail?.client.business_name || 'Individual Client'} · Registered on{' '}
                    {clientDetail?.client.created_at
                      ? new Date(clientDetail.client.created_at).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedClientId(null);
                    setClientDetail(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {loadingDetail || !clientDetail ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                  <span>Loading client details...</span>
                </div>
              ) : (
                <>
                  {/* Contact & Business Info */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 font-medium block">Phone Number</span>
                      <span className="font-medium text-slate-800 mt-0.5 block">
                        {clientDetail.client.phone}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">Alternate Phone</span>
                      <span className="text-slate-700 mt-0.5 block">
                        {clientDetail.client.alternate_phone || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">Email Address</span>
                      <span className="text-slate-700 mt-0.5 block">
                        {clientDetail.client.email || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">PAN Number</span>
                      <span className="font-mono text-slate-800 font-semibold mt-0.5 block">
                        {clientDetail.client.pan || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">GSTIN</span>
                      <span className="font-mono text-slate-800 font-semibold mt-0.5 block">
                        {clientDetail.client.gstin || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-medium block">Source</span>
                      <span className="capitalize text-slate-700 font-medium mt-0.5 block">
                        {clientDetail.client.source.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="col-span-full">
                      <span className="text-slate-400 font-medium block">Address & Territory</span>
                      <span className="text-slate-800 mt-0.5 block">
                        {clientDetail.client.address ? `${clientDetail.client.address}, ` : ''}
                        {clientDetail.client.city}, {clientDetail.client.district},{' '}
                        {clientDetail.client.state} {clientDetail.client.pin ? `- ${clientDetail.client.pin}` : ''}
                      </span>
                    </div>

                    {clientDetail.client.notes && (
                      <div className="col-span-full pt-2 border-t border-slate-200/60">
                        <span className="text-slate-400 font-medium block">Client Notes</span>
                        <p className="text-slate-700 mt-0.5 italic">{clientDetail.client.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Linked Leads & Services Section */}
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 text-sm">Linked Leads & Services</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {clientDetail.linkedLeads.length}
                        </span>
                      </div>

                      <button
                        onClick={() => setShowLinkLeadModal(true)}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>Link Existing Lead</span>
                      </button>
                    </div>

                    {clientDetail.linkedLeads.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100 text-slate-400">
                        No service leads linked to this client yet. Click "Link Existing Lead" to connect a lead.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {clientDetail.linkedLeads.map((lead: any) => (
                          <div key={lead.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{lead.service_name || 'Service Lead'}</span>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {lead.lead_number}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Fee: ₹{Number(lead.service_fee || 0).toLocaleString('en-IN')} · Commission: ₹{Number(lead.commission_value || 0).toLocaleString('en-IN')}
                              </p>
                            </div>
                            <div className="text-right">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                  lead.status === 'assigned'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {lead.status}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Client Profile */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Create Client Profile</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="e.g. Anand"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="e.g. Narayanan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Primary Phone *</label>
                  <input
                    type="tel"
                    required
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="10-digit mobile number"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alternate Phone</label>
                  <input
                    type="tel"
                    value={createForm.alternatePhone}
                    onChange={(e) => setCreateForm({ ...createForm, alternatePhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="Optional phone"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="client@example.com"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Business / Firm Name</label>
                  <input
                    type="text"
                    value={createForm.businessName}
                    onChange={(e) => setCreateForm({ ...createForm, businessName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="e.g. Narayanan Enterprises"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={createForm.pan}
                    onChange={(e) => setCreateForm({ ...createForm, pan: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase font-mono"
                    placeholder="ABCDE1234F"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={createForm.gstin}
                    onChange={(e) => setCreateForm({ ...createForm, gstin: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase font-mono"
                    placeholder="33ABCDE1234F1Z5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={createForm.city}
                    onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">District *</label>
                  <input
                    type="text"
                    required
                    value={createForm.district}
                    onChange={(e) => setCreateForm({ ...createForm, district: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={createForm.state}
                    onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  placeholder="Street, locality, landmark"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Acquisition Source</label>
                  <select
                    value={createForm.source}
                    onChange={(e) => setCreateForm({ ...createForm, source: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="direct">Direct</option>
                    <option value="lead">Lead Ingest</option>
                    <option value="referral">Referral</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PIN Code</label>
                  <input
                    type="text"
                    value={createForm.pin}
                    onChange={(e) => setCreateForm({ ...createForm, pin: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="636001"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Preferences</label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  placeholder="Special client requirements or requested services..."
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Save Client Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Client Profile */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit Client Profile</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateClient} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={editForm.businessName}
                    onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alternate Phone</label>
                  <input
                    type="tel"
                    value={editForm.alternatePhone}
                    onChange={(e) => setEditForm({ ...editForm, alternatePhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={editForm.pan}
                    onChange={(e) => setEditForm({ ...editForm, pan: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={editForm.gstin}
                    onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Update Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link Lead */}
      {showLinkLeadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Link Existing Lead</h3>
              <button onClick={() => setShowLinkLeadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLinkLead} className="space-y-4 mt-4 text-xs">
              <p className="text-slate-500">
                Select an unlinked lead assigned to your franchise to link it to{' '}
                <span className="font-semibold text-slate-800">{clientDetail?.client.full_name}</span>.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Lead *</label>
                {unlinkedLeads.length === 0 ? (
                  <p className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 italic">
                    No unlinked leads available in your franchise territory.
                  </p>
                ) : (
                  <select
                    required
                    value={leadToLink}
                    onChange={(e) => setLeadToLink(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="">-- Choose Lead --</option>
                    {unlinkedLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lead_number} - {l.customer_name} ({l.service_name || 'Service'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLinkLeadModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !leadToLink}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Linking...' : 'Confirm Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
