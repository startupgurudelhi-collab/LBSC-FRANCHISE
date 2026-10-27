import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Phone,
  Mail,
  MapPin,
  Tag,
  CheckCircle2,
  Clock,
  Building2,
  X,
  FileText,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { Lead, ServiceMaster } from '../types';

interface LeadsViewProps {
  leads: Lead[];
  services: ServiceMaster[];
  onRefresh: () => void;
  onNavigateToClients?: () => void;
}

export const LeadsView: React.FC<LeadsViewProps> = ({
  leads,
  services,
  onRefresh,
  onNavigateToClients,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [ingestForm, setIngestForm] = useState({
    source: 'franchise_walkin',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    serviceId: services[0]?.id || '',
    city: 'Salem',
    district: 'Salem',
    state: 'Tamil Nadu',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      lead.lead_number.toLowerCase().includes(search.toLowerCase()) ||
      lead.city.toLowerCase().includes(search.toLowerCase()) ||
      (lead.service_name && lead.service_name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await ApiClient.ingestLead(ingestForm);
      if (res.success) {
        setSubmitResult({
          type: 'success',
          message: 'Lead recorded and routed to your franchise territory successfully!',
        });
        onRefresh();
        setTimeout(() => {
          setShowIngestModal(false);
          setSubmitResult(null);
          setIngestForm({
            source: 'franchise_walkin',
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            serviceId: services[0]?.id || '',
            city: 'Salem',
            district: 'Salem',
            state: 'Tamil Nadu',
            notes: '',
          });
        }, 1200);
      } else {
        setSubmitResult({
          type: 'error',
          message: res.error?.message || 'Failed to ingest lead',
        });
      }
    } catch (err: any) {
      setSubmitResult({
        type: 'error',
        message: err.message || 'Error occurred while ingesting lead',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Leads</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Territory customer leads assigned directly to your franchise via marketing campaigns, opportunity inbox, or direct intake.
          </p>
        </div>

        <button
          onClick={() => setShowIngestModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Lead Intake</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by customer name, lead #, city, or service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          >
            <option value="all">All Statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="offered">Offered (Inbox Active)</option>
            <option value="new">New</option>
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Lead #</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Territory</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Commission</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No leads found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Check your lead inbox or launch campaigns to receive new leads in your territory.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-mono font-medium text-indigo-700">
                      {lead.lead_number}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{lead.customer_name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{lead.customer_phone}</span>
                        {lead.customer_email && <span>· {lead.customer_email}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-slate-800">
                        {lead.service_name || lead.service_code || lead.service_id}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {lead.city}, {lead.district}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          lead.status === 'assigned'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : lead.status === 'offered'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-emerald-600">
                      ₹{Number(lead.commission_value || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="View Details"
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

      {/* Lead Details Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedLead.customer_name}</h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {selectedLead.lead_number}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Assigned Franchise Lead Details</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 my-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Requested Service:</span>
                  <span className="font-bold text-slate-800">{selectedLead.service_name || 'Service'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer Phone:</span>
                  <span className="font-medium text-slate-800">{selectedLead.customer_phone}</span>
                </div>
                {selectedLead.customer_email && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer Email:</span>
                    <span className="text-slate-800">{selectedLead.customer_email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Territory:</span>
                  <span className="text-slate-800">
                    {selectedLead.city}, {selectedLead.district}, {selectedLead.state}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lead Status:</span>
                  <span className="capitalize font-semibold text-indigo-700">{selectedLead.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Franchise Commission:</span>
                  <span className="font-bold text-emerald-600">
                    ₹{Number(selectedLead.commission_value || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {selectedLead.notes && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Lead Notes:</span>
                  <p className="p-3 bg-slate-50 rounded-lg text-slate-600 italic">
                    {selectedLead.notes}
                  </p>
                </div>
              )}

              {/* Client Directory Bridge */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-indigo-900">Client Directory Integration</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Link this lead to an existing or new client profile in your Client Directory.
                  </p>
                </div>
                {onNavigateToClients && (
                  <button
                    onClick={() => {
                      setSelectedLead(null);
                      onNavigateToClients();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shrink-0"
                  >
                    <span>Open Clients</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ingestion Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Ingest New Customer Lead</h3>
              <button
                onClick={() => setShowIngestModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitResult && (
              <div
                className={`my-3 p-3 text-xs rounded-lg border ${
                  submitResult.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {submitResult.message}
              </div>
            )}

            <form onSubmit={handleIngest} className="space-y-3 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={ingestForm.customerName}
                    onChange={(e) => setIngestForm({ ...ingestForm, customerName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="e.g. Ramesh Babu"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={ingestForm.customerPhone}
                    onChange={(e) => setIngestForm({ ...ingestForm, customerPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="10-digit mobile"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={ingestForm.customerEmail}
                    onChange={(e) => setIngestForm({ ...ingestForm, customerEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    placeholder="ramesh@example.com"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Service *</label>
                  <select
                    value={ingestForm.serviceId}
                    onChange={(e) => setIngestForm({ ...ingestForm, serviceId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={ingestForm.city}
                    onChange={(e) => setIngestForm({ ...ingestForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">District *</label>
                  <input
                    type="text"
                    required
                    value={ingestForm.district}
                    onChange={(e) => setIngestForm({ ...ingestForm, district: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={ingestForm.state}
                    onChange={(e) => setIngestForm({ ...ingestForm, state: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Intake Notes</label>
                <textarea
                  rows={2}
                  value={ingestForm.notes}
                  onChange={(e) => setIngestForm({ ...ingestForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  placeholder="Additional customer requirements or notes..."
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Ingesting...' : 'Ingest Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
