import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Search,
  Filter,
  Calendar,
  Briefcase,
  Eye,
  RefreshCw,
  AlertCircle,
  X,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { Offer } from '../types';

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

export const OffersView: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');

  // Detail Modal
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch Services for filtering dropdown
  const fetchServices = async () => {
    try {
      const res = await ApiClient.getServices();
      const items = res?.data || res || [];
      setServices(
        items.map((s: any) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        }))
      );
    } catch (err: any) {
      console.error('Failed to load services:', err);
    }
  };

  // Fetch Active Offers for Franchise Portal
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
  }, [search, selectedServiceId]);

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Open detail modal
  const openDetailModal = (offer: Offer) => {
    setSelectedOffer(offer);
    setShowDetailModal(true);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Promotions & Schemes</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Active Offers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Browse current headquarter promotional schemes applicable to legal, corporate, and tax services.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOffers()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white rounded-lg border border-slate-200 shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
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

        {/* Filter by Applicable Service */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="w-full md:w-64 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="all">All Applicable Services</option>
            {services.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name} ({svc.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading active offers...</p>
        </div>
      ) : offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">No Active Offers Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {search || selectedServiceId !== 'all'
              ? 'No active offers match your current filter selection.'
              : 'There are currently no active promotional schemes scheduled by headquarters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Badge Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Active Scheme</span>
                  </span>

                  <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                    <Calendar className="w-3 h-3 text-indigo-500" />
                    <span>{formatDate(offer.end_date)}</span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
                  {offer.title}
                </h3>

                {/* Description */}
                {offer.description && (
                  <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                    {offer.description}
                  </p>
                )}

                {/* Applicable Services */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Applicable Services ({offer.services.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {offer.services.slice(0, 3).map((svc) => (
                      <span
                        key={svc.service_id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200/70"
                      >
                        <Briefcase className="w-3 h-3 text-indigo-500" />
                        <span className="truncate max-w-[140px]">{svc.service_name}</span>
                      </span>
                    ))}
                    {offer.services.length > 3 && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        +{offer.services.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Valid from {formatDate(offer.start_date)}
                </span>
                <button
                  onClick={() => openDetailModal(offer)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Details</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL (Franchise Read-Only) */}
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
                  <p className="text-xs text-slate-500">Central promotional scheme specification</p>
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

              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Validity Period</span>
                <p className="text-xs font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Valid from {formatDate(selectedOffer.start_date)} to {formatDate(selectedOffer.end_date)}</span>
                </p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Applicable Services ({selectedOffer.services.length})
                </span>
                <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
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

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
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
