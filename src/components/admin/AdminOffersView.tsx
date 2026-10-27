import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Plus,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  XCircle,
  Eye,
  Edit2,
  AlertCircle,
  Clock,
  Layers,
  X,
  Briefcase,
  RefreshCw,
  Power,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { Offer, OfferServiceMapping } from '../../types';

interface ServiceOption {
  id: string;
  name: string;
  code: string;
  category_name?: string;
}

export const AdminOffersView: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Active items for modals
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSelectedServices, setFormSelectedServices] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Services for selection
  const fetchServices = async () => {
    try {
      const res = await ApiClient.getServices();
      const items = res?.data || res || [];
      setServices(
        items.map((s: any) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          category_name: s.category_name,
        }))
      );
    } catch (err: any) {
      console.error('Failed to load services:', err);
    }
  };

  // Fetch Offers
  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (selectedServiceId !== 'all') {
        params.serviceId = selectedServiceId;
      }
      if (search.trim()) {
        params.search = search.trim();
      }
      if (statusFilter !== 'all') {
        params.isActive = statusFilter === 'active';
      }

      const res = await ApiClient.getOffers(params);
      if (res?.success) {
        setOffers(res.data);
      } else if (Array.isArray(res)) {
        setOffers(res);
      } else {
        setOffers(res?.data || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch offers');
    } finally {
      setLoading(false);
    }
  }, [search, selectedServiceId, statusFilter]);

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Statistics
  const totalOffers = offers.length;
  const activeOffersCount = offers.filter((o) => Number(o.is_active) === 1).length;
  const inactiveOffersCount = offers.filter((o) => Number(o.is_active) === 0).length;

  // Handlers for modal forms
  const openCreateModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFormTitle('');
    setFormDescription('');
    setFormStartDate(today);
    setFormEndDate(nextMonth);
    setFormIsActive(true);
    setFormSelectedServices([]);
    setFormError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (offer: Offer) => {
    setSelectedOffer(offer);
    setFormTitle(offer.title);
    setFormDescription(offer.description || '');
    setFormStartDate(offer.start_date);
    setFormEndDate(offer.end_date);
    setFormIsActive(Number(offer.is_active) === 1);
    setFormSelectedServices(offer.services.map((s) => s.service_id));
    setFormError(null);
    setShowEditModal(true);
  };

  const openDetailModal = (offer: Offer) => {
    setSelectedOffer(offer);
    setShowDetailModal(true);
  };

  // Submit Create
  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim() || formTitle.trim().length < 3) {
      setFormError('Offer title must be at least 3 characters');
      return;
    }
    if (!formStartDate || !formEndDate) {
      setFormError('Start date and end date are required');
      return;
    }
    if (formEndDate < formStartDate) {
      setFormError('End date must not be earlier than start date');
      return;
    }
    if (formSelectedServices.length === 0) {
      setFormError('Please select at least one applicable service');
      return;
    }

    setIsSubmitting(true);
    try {
      await ApiClient.createOffer({
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        start_date: formStartDate,
        end_date: formEndDate,
        is_active: formIsActive,
        service_ids: formSelectedServices,
      });
      setShowCreateModal(false);
      fetchOffers();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit
  const handleEditOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOffer) return;
    setFormError(null);

    if (!formTitle.trim() || formTitle.trim().length < 3) {
      setFormError('Offer title must be at least 3 characters');
      return;
    }
    if (!formStartDate || !formEndDate) {
      setFormError('Start date and end date are required');
      return;
    }
    if (formEndDate < formStartDate) {
      setFormError('End date must not be earlier than start date');
      return;
    }
    if (formSelectedServices.length === 0) {
      setFormError('Please select at least one applicable service');
      return;
    }

    setIsSubmitting(true);
    try {
      await ApiClient.updateOffer(selectedOffer.id, {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        start_date: formStartDate,
        end_date: formEndDate,
        is_active: formIsActive,
        service_ids: formSelectedServices,
      });
      setShowEditModal(false);
      fetchOffers();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Active / Inactive Status
  const handleToggleStatus = async (offer: Offer) => {
    const currentActive = Number(offer.is_active) === 1;
    const newActive = !currentActive;
    try {
      await ApiClient.setOfferStatus(offer.id, newActive);
      fetchOffers();
    } catch (err: any) {
      alert(err?.message || 'Failed to update offer status');
    }
  };

  // Toggle service selection in form
  const toggleServiceSelection = (serviceId: string) => {
    setFormSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const selectAllServices = () => {
    setFormSelectedServices(services.map((s) => s.id));
  };

  const clearAllServices = () => {
    setFormSelectedServices([]);
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs uppercase tracking-wider">
            <Tag className="w-4 h-4" />
            <span>HQ Promotional Management</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Offers Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create, schedule, and maintain centrally governed service offers for franchise partners.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOffers()}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Offer</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Offers</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalOffers}</p>
            <p className="text-xs text-slate-400 mt-0.5">Across all services</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Offers</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeOffersCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Currently visible in Franchise Portal</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Inactive Offers</p>
            <p className="text-2xl font-bold text-slate-500 mt-1">{inactiveOffersCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Hidden from franchise view</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
            <XCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search offers by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Service Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">All Applicable Services</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name} ({svc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'active'
                  ? 'bg-emerald-50 text-emerald-700 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'inactive'
                  ? 'bg-slate-200 text-slate-700 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Offers Table / View */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading promotional offers...</p>
        </div>
      ) : offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">No Offers Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {search || selectedServiceId !== 'all' || statusFilter !== 'all'
              ? 'No offers match your current filter parameters.'
              : 'There are no promotional offers in the system yet. Click below to create your first offer.'}
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Offer</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Offer Title & Description</th>
                  <th className="py-3.5 px-4">Applicable Services</th>
                  <th className="py-3.5 px-4">Validity Period</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.map((offer) => {
                  const isActive = Number(offer.is_active) === 1;
                  return (
                    <tr key={offer.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Title & Desc */}
                      <td className="py-4 px-4 align-top max-w-xs">
                        <p className="font-semibold text-slate-900 text-sm leading-snug">{offer.title}</p>
                        {offer.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                            {offer.description}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Created {formatDate(offer.created_at)}</span>
                        </p>
                      </td>

                      {/* Applicable Services */}
                      <td className="py-4 px-4 align-top max-w-sm">
                        <div className="flex flex-wrap gap-1.5">
                          {offer.services && offer.services.length > 0 ? (
                            offer.services.map((svc) => (
                              <span
                                key={svc.service_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60"
                              >
                                <Briefcase className="w-3 h-3 text-slate-400" />
                                <span>{svc.service_name}</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">No mapped services</span>
                          )}
                        </div>
                      </td>

                      {/* Validity Period */}
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="font-medium">{formatDate(offer.start_date)}</span>
                          <span className="text-slate-400">→</span>
                          <span className="font-medium">{formatDate(offer.end_date)}</span>
                        </div>
                      </td>

                      {/* Status & Quick Toggle */}
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Active</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 text-slate-400" />
                                <span>Inactive</span>
                              </>
                            )}
                          </span>

                          <button
                            onClick={() => handleToggleStatus(offer)}
                            title={isActive ? 'Deactivate Offer' : 'Activate Offer'}
                            className={`p-1 rounded-md border text-xs transition-colors ${
                              isActive
                                ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDetailModal(offer)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                            title="View offer details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(offer)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Edit offer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE OFFER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create Promotional Offer</h3>
                  <p className="text-xs text-slate-500">Configure central scheme validity and applicable services</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Offer Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., GST Annual Filing Season Special"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Detail the scope or background of this promotional offer..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Applicable Services Multi-Select */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Applicable Service(s) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllServices}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllServices}
                      className="text-slate-500 hover:text-slate-700 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  {services.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2 text-center">Loading services catalog...</p>
                  ) : (
                    services.map((svc) => {
                      const isSelected = formSelectedServices.includes(svc.id);
                      return (
                        <label
                          key={svc.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-indigo-50 text-indigo-900 border border-indigo-200 font-medium'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleServiceSelection(svc.id)}
                              className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                            />
                            <span>{svc.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">{svc.code}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected: {formSelectedServices.length} of {services.length} services
                </p>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Activate Immediately</span>
                  <p className="text-[11px] text-slate-500">
                    If active, franchise partners will see this offer in their portal immediately
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT OFFER MODAL */}
      {showEditModal && selectedOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Offer</h3>
                  <p className="text-xs text-slate-500">Update offer details, date range, or mapped services</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditOffer} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Offer Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Applicable Services Multi-Select */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Applicable Service(s) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllServices}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllServices}
                      className="text-slate-500 hover:text-slate-700 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  {services.map((svc) => {
                    const isSelected = formSelectedServices.includes(svc.id);
                    return (
                      <label
                        key={svc.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-900 border border-indigo-200 font-medium'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleServiceSelection(svc.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                          />
                          <span>{svc.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{svc.code}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected: {formSelectedServices.length} of {services.length} services
                </p>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Active Status</span>
                  <p className="text-[11px] text-slate-500">
                    Control visibility of this offer in the Franchise Portal
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {showDetailModal && selectedOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Offer Details</h3>
                  <p className="text-xs text-slate-500">ID: {selectedOffer.id}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Title</span>
                <h4 className="text-lg font-bold text-slate-900 mt-0.5">{selectedOffer.title}</h4>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Description</span>
                <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap leading-relaxed">
                  {selectedOffer.description || 'No description provided.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-lg border border-slate-100">
                <div>
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Validity</span>
                  <p className="text-xs font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{formatDate(selectedOffer.start_date)} — {formatDate(selectedOffer.end_date)}</span>
                  </p>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Current Status</span>
                  <p className="text-xs font-semibold mt-1">
                    {Number(selectedOffer.is_active) === 1 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Inactive</span>
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Applicable Services ({selectedOffer.services.length})
                </span>
                <div className="mt-2 space-y-1.5">
                  {selectedOffer.services.map((svc) => (
                    <div
                      key={svc.service_id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-medium text-slate-800">{svc.service_name}</span>
                      </div>
                      <span className="text-[11px] font-mono font-medium text-slate-500">{svc.service_code}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Created {formatDate(selectedOffer.created_at)}</span>
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
