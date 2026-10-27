import React, { useState } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  MapPin,
  Tag,
  CheckCircle2,
  Calendar,
  X,
  AlertCircle,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { Campaign, ServiceMaster } from '../types';

interface CampaignsViewProps {
  campaigns: Campaign[];
  services: ServiceMaster[];
  onRefresh: () => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({ campaigns, services, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    serviceId: services[0]?.id || '',
    name: '',
    city: 'Salem',
    district: 'Salem',
    state: 'Tamil Nadu',
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await ApiClient.createCampaign({
        ...formData,
        name: formData.name.trim() || undefined,
      });

      if (res.success) {
        setStatusMessage('Campaign launched successfully! (₹100/day · Max 5 leads/day)');
        onRefresh();
        setTimeout(() => {
          setShowModal(false);
          setStatusMessage(null);
        }, 1200);
      } else {
        setStatusMessage(res.error?.message || 'Failed to create campaign');
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Error occurred while creating campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Campaigns</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standard franchise campaigns at fixed ₹100/day with guaranteed cap of maximum 5 leads/day.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Launch Campaign</span>
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 p-12 text-center">
            <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No campaigns launched yet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch a campaign for any service in your territory to start receiving customer opportunities.
            </p>
          </div>
        ) : (
          campaigns.map((camp) => (
            <div
              key={camp.id}
              className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-200 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-snug">{camp.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{camp.organization_name || 'Franchise Campaign'}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                      camp.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {camp.status}
                  </span>
                </div>

                <div className="space-y-2 py-2 border-y border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-medium text-slate-800 truncate">
                      {camp.service_name || camp.service_code || camp.service_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{camp.city}, {camp.district}, {camp.state}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Started: {camp.start_date}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">₹{camp.daily_fee}/day</span>
                  <span className="text-[10px] text-slate-400 block">Cap: {camp.max_leads_per_day} leads/day</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded">
                    Active & Routing
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Launch Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Launch New Service Campaign</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {statusMessage && (
              <div className="my-3 p-3 text-xs rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                {statusMessage}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Service *</label>
                <select
                  required
                  value={formData.serviceId}
                  onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) - Fee ₹{s.service_fee}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Campaign Display Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Salem City Trademark Push"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">District *</label>
                  <input
                    type="text"
                    required
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Daily Campaign Fee:</span>
                  <span className="font-bold text-slate-800">₹100.00 / day</span>
                </div>
                <div className="flex justify-between">
                  <span>Guaranteed Max Quota:</span>
                  <span className="font-bold text-slate-800">5 leads / day</span>
                </div>
                <div className="flex justify-between">
                  <span>Matching:</span>
                  <span className="font-medium text-indigo-700">Strict Service + Location</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {loading ? 'Activating...' : 'Activate Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
