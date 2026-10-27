import React, { useState } from 'react';
import {
  Briefcase,
  Search,
  CheckCircle,
  Clock,
  FileText,
  Tag,
  ShieldCheck,
  Send,
  X,
  User,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import type { ServiceMaster, ServiceCategory, Client } from '../types';

interface ServicesViewProps {
  services: ServiceMaster[];
  categories: ServiceCategory[];
  clients?: Client[];
  onRefresh?: () => void;
  onNavigateToClients?: () => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  categories,
  clients = [],
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Apply Service Modal state
  const [selectedServiceForApply, setSelectedServiceForApply] = useState<ServiceMaster | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientNameInput, setClientNameInput] = useState<string>('');
  const [clientPhoneInput, setClientPhoneInput] = useState<string>('');
  const [clientNotesInput, setClientNotesInput] = useState<string>('');
  const [isStaged, setIsStaged] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredServices = services.filter((svc) => {
    const matchesCategory = selectedCategory === 'all' || svc.category_id === selectedCategory;
    const matchesSearch =
      svc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      svc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (svc.description && svc.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleOpenApplyModal = (svc: ServiceMaster) => {
    setSelectedServiceForApply(svc);
    setSelectedClientId(clients[0]?.id || '');
    setClientNameInput('');
    setClientPhoneInput('');
    setClientNotesInput('');
    setIsStaged(false);
  };

  const handleStageApplication = (e: React.FormEvent) => {
    e.preventDefault();
    const clientDisplay = selectedClientId
      ? clients.find((c) => c.id === selectedClientId)?.full_name || 'Selected Client'
      : clientNameInput || 'Customer';

    setIsStaged(true);
    setToastMessage(`Service application for ${selectedServiceForApply?.name} staged for ${clientDisplay}.`);

    setTimeout(() => {
      setSelectedServiceForApply(null);
      setIsStaged(false);
      setTimeout(() => setToastMessage(null), 3000);
    }, 1800);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Services Catalog</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standardized legal, tax, and compliance services offered across the LBSC franchise network.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-900">{services.length}</span> services in{' '}
          <span className="font-semibold text-slate-900">{categories.length}</span> categories
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search service name, code, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredServices.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 p-12 text-center text-slate-400">
            No services found matching current filters.
          </div>
        ) : (
          filteredServices.map((svc) => (
            <div
              key={svc.id}
              className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-200 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {svc.code}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1.5">{svc.name}</h3>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                  {svc.description || 'Standard corporate filing and registration service.'}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Turnaround SLA:</span>
                    <span className="font-medium text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {svc.turnaround_days} Days ({svc.sla_hours} hrs)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Franchise Commission:</span>
                    <span className="font-bold text-emerald-600">
                      ₹{Number(svc.commission_value).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Service Fee</span>
                    <span className="text-sm font-bold text-slate-900">
                      ₹{Number(svc.service_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                    Catalog Verified
                  </span>
                </div>

                {/* Apply Service Entry Point Button */}
                <button
                  onClick={() => handleOpenApplyModal(svc)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-xs font-semibold transition-colors border border-indigo-200 hover:border-transparent shadow-2xs group"
                >
                  <span>Apply Service</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Apply Service Entry Point Modal (UI Placeholder for Phase 10) */}
      {selectedServiceForApply && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Apply Service Entry Point</h3>
              </div>
              <button
                onClick={() => setSelectedServiceForApply(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Service Summary Card */}
            <div className="my-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {selectedServiceForApply.code}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 mt-1">{selectedServiceForApply.name}</h4>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 block">
                    ₹{Number(selectedServiceForApply.service_fee).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold block">
                    Commission: ₹{Number(selectedServiceForApply.commission_value).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {selectedServiceForApply.description || 'Standard corporate compliance and filing service.'}
              </p>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-3">
                <span>SLA: {selectedServiceForApply.turnaround_days} business days</span>
                <span>Category: {categories.find((c) => c.id === selectedServiceForApply.category_id)?.name || 'General'}</span>
              </div>
            </div>

            {/* Scope Enforcement Notice */}
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Service Application Workflow Entry Point</p>
                  <p className="mt-0.5 text-[11px] text-amber-700 leading-relaxed">
                    Full document collection, payment escrow, and back-office submission will be activated in Phase 11. Staging this entry point registers client interest for this service in your franchise.
                  </p>
                </div>
              </div>
            </div>

            {/* Staging Form */}
            <form onSubmit={handleStageApplication} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Existing Client</label>
                {clients.length > 0 ? (
                  <select
                    value={selectedClientId}
                    onChange={(e) => {
                      setSelectedClientId(e.target.value);
                      if (e.target.value) {
                        setClientNameInput('');
                        setClientPhoneInput('');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="">-- Or enter new client details below --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.client_number} - {c.full_name} ({c.phone})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-slate-400 italic text-[11px]">No existing clients yet. Enter customer details below.</p>
                )}
              </div>

              {!selectedClientId && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required={!selectedClientId}
                      value={clientNameInput}
                      onChange={(e) => setClientNameInput(e.target.value)}
                      placeholder="e.g. Anand Kumar"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      required={!selectedClientId}
                      value={clientPhoneInput}
                      onChange={(e) => setClientPhoneInput(e.target.value)}
                      placeholder="10-digit mobile"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Application Notes / Documents Summary</label>
                <textarea
                  rows={2}
                  value={clientNotesInput}
                  onChange={(e) => setClientNotesInput(e.target.value)}
                  placeholder="e.g. Client requested express filing; documents verified."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedServiceForApply(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isStaged}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isStaged ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-300" />
                      <span>Application Staged</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Stage Application (Preview)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
