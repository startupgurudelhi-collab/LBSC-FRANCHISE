import React, { useState, useEffect, useCallback } from 'react';
import {
  LifeBuoy,
  Plus,
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
  ArrowUpDown,
  Lock,
  Calendar,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { Ticket, TicketDetail, TicketStatus, TicketPriority, TicketCategory } from '../types';

interface TicketsViewProps {
  onRefreshParent?: () => void;
}

const CATEGORY_MAP: Record<TicketCategory, { label: string; color: string }> = {
  technical: { label: 'Technical & Portal', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  commission_billing: { label: 'Commission & Billing', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lead_dispute: { label: 'Lead Dispute', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  service_inquiry: { label: 'Service Catalog', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  general: { label: 'General Operational', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export const TicketsView: React.FC<TicketsViewProps> = ({ onRefreshParent }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

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
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Raise Ticket Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<TicketCategory>('technical');
  const [formPriority, setFormPriority] = useState<TicketPriority>('medium');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch ticket list and stats
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes] = await Promise.all([
        ApiClient.getTickets({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          search: search.trim() || undefined,
        }),
        ApiClient.getTicketStats(),
      ]);

      if (ticketsRes?.data) {
        setTickets(ticketsRes.data);
      }
      if (statsRes?.data) {
        setStats(statsRes.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, search]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Fetch ticket details when a ticket is selected
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
  };

  // Submit new ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDescription.trim()) {
      setFeedback({ type: 'error', message: 'Title and description are required' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await ApiClient.createTicket({
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        priority: formPriority,
      });

      if (res?.success) {
        setShowCreateModal(false);
        setFormTitle('');
        setFormDescription('');
        setFormCategory('technical');
        setFormPriority('medium');
        fetchTickets();
        if (onRefreshParent) onRefreshParent();
        if (res.data?.id) {
          handleSelectTicket(res.data);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to raise support ticket' });
    } finally {
      setSubmitting(false);
    }
  };

  // Send reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicketId) return;

    setSendingReply(true);
    try {
      await ApiClient.addTicketMessage(selectedTicketId, {
        message: replyText.trim(),
        is_internal: false,
      });
      setReplyText('');
      loadTicketDetail(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to post reply');
    } finally {
      setSendingReply(false);
    }
  };

  // Franchise user can mark ticket as closed or re-open
  const handleStatusToggle = async (newStatus: 'open' | 'closed') => {
    if (!selectedTicketId) return;
    try {
      await ApiClient.updateTicketStatus(selectedTicketId, newStatus);
      loadTicketDetail(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
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
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Support & Helpdesk</h1>
              <p className="text-xs text-slate-500">
                Raise grievances, track SLA inquiries, and resolve operational questions with central support
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchTickets()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : 'text-slate-400'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Raise Ticket</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Raised
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

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Closed
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-700">{stats.closed}</span>
            <X className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search ticket # or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

      {/* Tickets Table / List */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-xs font-medium">Loading your support tickets...</span>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <LifeBuoy className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-700">No Support Tickets Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {search || statusFilter !== 'all' || categoryFilter !== 'all'
                ? 'No tickets match the selected filters. Try clearing filters.'
                : 'You have not raised any support inquiries yet. Click "Raise Ticket" whenever you need assistance.'}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Raise First Ticket</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Subject & Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Messages</th>
                  <th className="py-3 px-4">Opened Date</th>
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
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {t.ticket_number}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">{t.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">{t.description}</div>
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
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-slate-600 font-medium text-[11px]">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          {t.message_count || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(t.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline">
                          <span>View Thread</span>
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

      {/* Ticket Detail Drawer / Modal */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-indigo-600 rounded text-white">
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
                  <h3 className="text-xs text-slate-300 font-medium truncate max-w-md">
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
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                <span className="text-xs font-medium">Fetching conversation thread...</span>
              </div>
            ) : !ticketDetail ? (
              <div className="flex-1 p-8 text-center text-slate-400 text-xs">Failed to load ticket details.</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
                {/* Meta summary card */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</span>
                      <p className="text-xs font-semibold text-slate-800">
                        {CATEGORY_MAP[ticketDetail.category]?.label || ticketDetail.category}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created On</span>
                      <p className="text-xs font-medium text-slate-700">
                        {new Date(ticketDetail.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Support Handler</span>
                      <p className="text-xs font-medium text-slate-700">
                        {ticketDetail.assignee_name || 'Central Helpdesk Queue'}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ticketDetail.status === 'closed' ? (
                          <button
                            onClick={() => handleStatusToggle('open')}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold border border-slate-200 transition-colors"
                          >
                            Re-open Ticket
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusToggle('closed')}
                            className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[11px] font-semibold border border-rose-200 transition-colors"
                          >
                            Close Ticket
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Initial description */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Initial Inquiry Description
                    </span>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed font-normal">
                      {ticketDetail.description}
                    </p>
                  </div>
                </div>

                {/* Conversation Thread */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Conversation Timeline ({ticketDetail.messages.length} Replies)
                    </span>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>

                  {ticketDetail.messages.length === 0 ? (
                    <div className="bg-white p-6 rounded-xl border border-slate-200/80 text-center text-slate-400 text-xs">
                      No replies yet. Central support will respond shortly.
                    </div>
                  ) : (
                    ticketDetail.messages.map((msg) => {
                      const isAdmin = msg.author_role === 'super_admin' || !msg.author_role;
                      return (
                        <div
                          key={msg.id}
                          className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                            isAdmin
                              ? 'bg-indigo-50/50 border-indigo-200 text-slate-900 ml-4'
                              : 'bg-white border-slate-200 text-slate-900 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">
                                {msg.author_name || 'Staff User'}
                              </span>
                              {isAdmin && (
                                <span className="px-1.5 py-0.2 rounded bg-indigo-600 text-white font-bold text-[9px] uppercase tracking-wider">
                                  Support Specialist
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

            {/* Reply Composer */}
            {ticketDetail && ticketDetail.status !== 'closed' && (
              <form
                onSubmit={handleSendReply}
                className="p-3.5 bg-white border-t border-slate-200 shrink-0 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply to central support..."
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white resize-none text-slate-800 placeholder-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="h-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 self-stretch"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            )}

            {ticketDetail && ticketDetail.status === 'closed' && (
              <div className="p-3 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-500 font-medium">
                This ticket is marked as closed. Click &ldquo;Re-open Ticket&rdquo; in the header if you need further help.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raise Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-600 rounded text-white">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Raise Support Ticket</h3>
                  <p className="text-[11px] text-slate-400">
                    Submit an issue or grievance directly to central headquarters
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicket} className="p-5 space-y-4">
              {feedback && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    feedback.type === 'error'
                      ? 'bg-rose-50 border border-rose-200 text-rose-800'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ticket Subject / Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discrepancy in Commission Payout for Lead #LD-2026-0042"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-900 placeholder-slate-400"
                />
              </div>

              {/* Category & Priority Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TicketCategory)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="technical">Technical & Portal Support</option>
                    <option value="commission_billing">Commission & Wallet Billing</option>
                    <option value="lead_dispute">Lead Allocation & Dispute</option>
                    <option value="service_inquiry">Service Catalog & Doc SLA</option>
                    <option value="general">General Operational Query</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TicketPriority)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="low">Low (General guidance)</option>
                    <option value="medium">Medium (Standard query)</option>
                    <option value="high">High (Impacting operations)</option>
                    <option value="urgent">Urgent (Immediate blocker)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Detailed Explanation <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide all relevant details, lead references, error messages, or client context..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white resize-none text-slate-900 placeholder-slate-400"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? 'Submitting...' : 'Submit Support Ticket'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
