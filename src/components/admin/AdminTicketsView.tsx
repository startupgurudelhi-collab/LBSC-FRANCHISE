import React, { useState, useEffect, useCallback } from 'react';
import {
  LifeBuoy,
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  X,
  Send,
  Building2,
  Tag,
  AlertTriangle,
  UserCheck,
  ShieldAlert,
  Lock,
  Calendar,
  ExternalLink,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { Ticket, TicketDetail, TicketStatus, TicketPriority, TicketCategory } from '../../types';

const CATEGORY_MAP: Record<TicketCategory, { label: string; color: string }> = {
  technical: { label: 'Technical & Portal', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  commission_billing: { label: 'Commission & Billing', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lead_dispute: { label: 'Lead Dispute', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  service_inquiry: { label: 'Service Catalog', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  general: { label: 'General Operational', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export const AdminTicketsView: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [franchiseFilter, setFranchiseFilter] = useState<string>('all');

  // Franchises list for filter dropdown
  const [franchises, setFranchises] = useState<{ id: string; name: string; code?: string }[]>([]);

  // Assignees list
  const [assignees, setAssignees] = useState<{ id: string; name: string; email: string; role: string }[]>([]);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    urgent: 0,
  });

  // Selected Ticket for Details Drawer
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Message Composer State
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Status & Priority & Assignment update loading states
  const [updatingAction, setUpdatingAction] = useState(false);

  // Load franchises & assignees once
  useEffect(() => {
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

    ApiClient.getTicketAssignees()
      .then((res: any) => {
        if (res?.data) {
          setAssignees(res.data);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch ticket list and stats
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes] = await Promise.all([
        ApiClient.getTickets({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          franchiseId: franchiseFilter !== 'all' ? franchiseFilter : undefined,
          search: search.trim() || undefined,
        }),
        ApiClient.getTicketStats(franchiseFilter !== 'all' ? franchiseFilter : undefined),
      ]);

      if (ticketsRes?.data) {
        setTickets(ticketsRes.data);
      }
      if (statsRes?.data) {
        setStats(statsRes.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch admin tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, categoryFilter, franchiseFilter, search]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Fetch ticket details
  const loadTicketDetail = useCallback(async (ticketId: string) => {
    setLoadingDetail(true);
    try {
      const res = await ApiClient.getTicketById(ticketId);
      if (res?.data) {
        setTicketDetail(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load ticket details:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
    loadTicketDetail(ticket.id);
  };

  const handleCloseDetail = () => {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setReplyText('');
    setIsInternalNote(false);
  };

  // Add Message (Public Reply or Internal Note)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicketId) return;

    setSendingReply(true);
    try {
      await ApiClient.addTicketMessage(selectedTicketId, {
        message: replyText.trim(),
        is_internal: isInternalNote,
      });
      setReplyText('');
      loadTicketDetail(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to post message');
    } finally {
      setSendingReply(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!selectedTicketId) return;
    setUpdatingAction(true);
    try {
      await ApiClient.updateTicketStatus(selectedTicketId, newStatus);
      await loadTicketDetail(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setUpdatingAction(false);
    }
  };

  // Update Priority
  const handleUpdatePriority = async (newPriority: TicketPriority) => {
    if (!selectedTicketId) return;
    setUpdatingAction(true);
    try {
      await ApiClient.updateTicketPriority(selectedTicketId, newPriority);
      await loadTicketDetail(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to update priority');
    } finally {
      setUpdatingAction(false);
    }
  };

  // Assign Ticket
  const handleAssignTicket = async (assignedUserId: string) => {
    if (!selectedTicketId) return;
    setUpdatingAction(true);
    try {
      await ApiClient.assignTicket(selectedTicketId, assignedUserId === 'unassigned' ? null : assignedUserId);
      await loadTicketDetail(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to assign ticket');
    } finally {
      setUpdatingAction(false);
    }
  };

  const renderStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-500" />
            Open
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RefreshCw className="w-3 h-3 text-amber-500" />
            In Progress
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Resolved
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <X className="w-3 h-3 text-slate-500" />
            Closed
          </span>
        );
      default:
        return <span className="text-xs text-slate-600">{status}</span>;
    }
  };

  const renderPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Urgent
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            High
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Medium
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Low
          </span>
        );
      default:
        return <span className="text-xs text-slate-600">{priority}</span>;
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 rounded-lg text-amber-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                Central Ticket & Grievance Helpdesk
              </h1>
              <p className="text-xs text-slate-500">
                Super Admin control panel for partner ticket triage, SLA dispute handling, and internal notes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchTickets()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : 'text-slate-400'}`} />
            <span>Refresh Tickets</span>
          </button>
        </div>
      </div>

      {/* Ticket Dashboard KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            All Tickets
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900">{stats.total}</span>
            <LifeBuoy className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
            Open
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-blue-700">{stats.open}</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block">
            In Progress
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-amber-700">{stats.in_progress}</span>
            <RefreshCw className="w-4 h-4 text-amber-500" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
            Resolved
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-700">{stats.resolved}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Closed
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-700">{stats.closed}</span>
            <X className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider block">
            Urgent SLA
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-rose-700">{stats.urgent}</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
        </div>
      </div>

      {/* Multi-Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by ticket #, subject, or franchise..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {/* Franchise Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Franchise:</span>
              <select
                value={franchiseFilter}
                onChange={(e) => setFranchiseFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900 max-w-xs"
              >
                <option value="all">All Franchises</option>
                {franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code ? `[${f.code}] ` : ''}{f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">All Categories</option>
                <option value="technical">Technical & Portal</option>
                <option value="commission_billing">Commission & Billing</option>
                <option value="lead_dispute">Lead Dispute</option>
                <option value="service_inquiry">Service Catalog</option>
                <option value="general">General Operational</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tickets Master Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-600" />
            <span className="text-xs font-medium">Querying all support tickets...</span>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <LifeBuoy className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-700">No Support Tickets Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no partner tickets matching the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Franchise Partner</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned To</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {tickets.map((t) => {
                  const cat = CATEGORY_MAP[t.category] || { label: t.category, color: 'bg-slate-50 text-slate-700 border-slate-200' };
                  const isSelected = selectedTicketId === t.id;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => handleSelectTicket(t)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {t.ticket_number}
                      </td>
                      <td className="py-3 px-4 max-w-[180px]">
                        <div className="font-semibold text-slate-900 truncate">
                          {t.organization_name || 'Franchise Partner'}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                          {t.franchise_code && <span className="font-mono font-semibold">{t.franchise_code}</span>}
                          {t.city && <span>• {t.city}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-slate-900 truncate">{t.title}</div>
                        <div className="text-[11px] text-slate-400 truncate">{t.description}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cat.color}`}>
                          {cat.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderPriorityBadge(t.priority)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderStatusBadge(t.status)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                        {t.assignee_name ? (
                          <span className="inline-flex items-center gap-1 text-slate-800 font-semibold">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                            {t.assignee_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(t.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-slate-900 font-semibold hover:underline">
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Super Admin Ticket Detail & Management Drawer */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-amber-500 text-slate-950 rounded font-bold">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-400">
                      {ticketDetail?.ticket_number || 'Loading...'}
                    </span>
                    {ticketDetail && renderStatusBadge(ticketDetail.status)}
                    {ticketDetail && renderPriorityBadge(ticketDetail.priority)}
                  </div>
                  <h3 className="text-xs text-slate-300 font-medium truncate max-w-lg">
                    {ticketDetail?.title}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCloseDetail}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            {loadingDetail ? (
              <div className="flex-1 p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-slate-600" />
                <span className="text-xs font-medium">Loading ticket conversation and audit history...</span>
              </div>
            ) : !ticketDetail ? (
              <div className="flex-1 p-8 text-center text-slate-400 text-xs">Failed to load ticket details.</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
                {/* Super Admin Control Bar (Assignee, Status, Priority) */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                      HQ Control & Triage
                    </span>
                    {updatingAction && (
                      <span className="text-[11px] text-amber-600 flex items-center gap-1 font-semibold">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Updating...
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Status Changer */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Ticket Status
                      </label>
                      <select
                        disabled={updatingAction}
                        value={ticketDetail.status}
                        onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    {/* Priority Changer */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Priority Level
                      </label>
                      <select
                        disabled={updatingAction}
                        value={ticketDetail.priority}
                        onChange={(e) => handleUpdatePriority(e.target.value as TicketPriority)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>

                    {/* Assigned User */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Assigned Specialist
                      </label>
                      <select
                        disabled={updatingAction}
                        value={ticketDetail.assigned_to_user_id || 'unassigned'}
                        onChange={(e) => handleAssignTicket(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="unassigned">Unassigned (Pool)</option>
                        {assignees.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Franchise Submitter Details */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Franchise
                      </span>
                      <p className="font-semibold text-slate-900 truncate">
                        {ticketDetail.organization_name || 'N/A'}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {ticketDetail.franchise_code || ''}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Opened By
                      </span>
                      <p className="font-semibold text-slate-900 truncate">
                        {ticketDetail.creator_name || 'Staff'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {ticketDetail.creator_email || ''}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Category
                      </span>
                      <p className="font-semibold text-slate-900">
                        {CATEGORY_MAP[ticketDetail.category]?.label || ticketDetail.category}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Created At
                      </span>
                      <p className="text-slate-700">
                        {new Date(ticketDetail.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Initial description */}
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Inquiry Description
                    </span>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed font-normal">
                      {ticketDetail.description}
                    </p>
                  </div>
                </div>

                {/* Conversation & Internal Notes Timeline */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Timeline & Messages ({ticketDetail.messages.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>

                  {ticketDetail.messages.length === 0 ? (
                    <div className="bg-white p-6 rounded-xl border border-slate-200/80 text-center text-slate-400 text-xs">
                      No replies recorded yet. Post a public response or internal admin note below.
                    </div>
                  ) : (
                    ticketDetail.messages.map((msg) => {
                      const isInternal = Boolean(msg.is_internal);
                      const isAdmin = msg.author_role === 'super_admin' || !msg.author_role;

                      return (
                        <div
                          key={msg.id}
                          className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                            isInternal
                              ? 'bg-amber-50/80 border-amber-300 text-amber-950 ml-6 shadow-2xs'
                              : isAdmin
                              ? 'bg-indigo-50/50 border-indigo-200 text-slate-900 ml-4'
                              : 'bg-white border-slate-200 text-slate-900 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">
                                {msg.author_name || 'Staff User'}
                              </span>

                              {isInternal && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold text-[10px] uppercase tracking-wider border border-amber-300">
                                  <Lock className="w-3 h-3 text-amber-800" />
                                  Internal Admin Note (Hidden from Franchise)
                                </span>
                              )}

                              {!isInternal && isAdmin && (
                                <span className="px-1.5 py-0.2 rounded bg-indigo-600 text-white font-bold text-[9px] uppercase tracking-wider">
                                  HQ Support
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400 font-mono">
                              {new Date(msg.created_at).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-normal">
                            {msg.message}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Composer (Reply or Internal Note) */}
            {ticketDetail && (
              <form
                onSubmit={handleSendMessage}
                className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-2.5"
              >
                {/* Mode Selector Tab */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        !isInternalNote
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Public Reply to Franchise
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                        isInternalNote
                          ? 'bg-amber-100 text-amber-900 shadow-2xs border border-amber-300'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Lock className="w-3 h-3 text-amber-700" />
                      <span>Internal Admin Note</span>
                    </button>
                  </div>

                  {isInternalNote && (
                    <span className="text-[11px] text-amber-700 font-medium">
                      Note will ONLY be visible to administrators.
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      isInternalNote
                        ? 'Add internal diagnostic notes, escalation instructions, or staff observations...'
                        : 'Write official response to franchise partner...'
                    }
                    className={`flex-1 p-2.5 border rounded-lg text-xs focus:outline-none focus:ring-1 resize-none text-slate-800 placeholder-slate-400 ${
                      isInternalNote
                        ? 'bg-amber-50/40 border-amber-300 focus:ring-amber-500'
                        : 'bg-slate-50 border-slate-200 focus:ring-slate-900 focus:bg-white'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className={`h-full px-4 py-2.5 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 self-stretch ${
                      isInternalNote
                        ? 'bg-amber-700 hover:bg-amber-800'
                        : 'bg-slate-900 hover:bg-slate-800'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isInternalNote ? 'Save Note' : 'Send Reply'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
