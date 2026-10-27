import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Search,
  Filter,
  Briefcase,
  Eye,
  RefreshCw,
  AlertCircle,
  X,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Video,
  Presentation,
  BookOpen,
  FileCheck2,
  Folder,
  Sparkles,
  Layers,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { MarketingMaterial, MarketingMaterialType } from '../types';

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const MATERIAL_TYPE_CONFIG: Record<
  MarketingMaterialType,
  { label: string; icon: any; badgeClass: string }
> = {
  flyer: {
    label: 'Flyer / Handout',
    icon: FileText,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  brochure: {
    label: 'Brochure / Catalog',
    icon: BookOpen,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  social_media: {
    label: 'Social Media Post',
    icon: Share2,
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  banner: {
    label: 'Digital Banner / Ad',
    icon: ImageIcon,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  poster: {
    label: 'Office Standee / Poster',
    icon: FileCheck2,
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  presentation: {
    label: 'Pitch Deck / PPT',
    icon: Presentation,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  video: {
    label: 'Video Explainer',
    icon: Video,
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  document: {
    label: 'Document / Template',
    icon: FileText,
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  other: {
    label: 'Other Collateral',
    icon: Folder,
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

export const MarketingView: React.FC = () => {
  const [materials, setMaterials] = useState<MarketingMaterial[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');

  // Detail Modal
  const [selectedMaterial, setSelectedMaterial] = useState<MarketingMaterial | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch Services for filter dropdown
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

  // Fetch Published Marketing Materials
  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (selectedServiceId !== 'all') {
        params.serviceId = selectedServiceId;
      }
      if (selectedType !== 'all') {
        params.materialType = selectedType;
      }
      if (search.trim()) {
        params.search = search.trim();
      }

      const res = await ApiClient.getMarketingMaterials(params);
      if (res?.success) {
        setMaterials(res.data);
      } else if (Array.isArray(res)) {
        setMaterials(res);
      } else {
        setMaterials(res?.data || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch marketing materials');
    } finally {
      setLoading(false);
    }
  }, [search, selectedServiceId, selectedType]);

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Open detail modal with full asset payload
  const openDetailModal = async (material: MarketingMaterial) => {
    setSelectedMaterial(material);
    setShowDetailModal(true);
    setDetailLoading(true);
    try {
      const res = await ApiClient.getMarketingMaterialById(material.id);
      if (res?.success && res.data) {
        setSelectedMaterial(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load material detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Trigger download of base64 or open external URL
  const handleDownloadAsset = (material: MarketingMaterial) => {
    if (material.file_data) {
      const link = document.createElement('a');
      link.href = material.file_data;
      link.download = material.file_name || `marketing-material-${material.id}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (material.file_url) {
      window.open(material.file_url, '_blank', 'noopener,noreferrer');
    } else {
      window.open(ApiClient.getMarketingMaterialDownloadUrl(material.id), '_blank');
    }
  };

  // Format file size
  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-indigo-200 font-semibold text-xs uppercase tracking-wider mb-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Official Corporate Collateral</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Marketing Material Hub</h1>
          <p className="mt-2 text-xs sm:text-sm text-indigo-100/90 leading-relaxed">
            Access authorized brochures, print-ready flyers, social media creatives, and presentation decks. 
            All materials are pre-approved by LBSC compliance for local promotion in your territory.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search marketing materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Folder className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Categories</option>
              {Object.entries(MATERIAL_TYPE_CONFIG).map(([t, cfg]) => (
                <option key={t} value={t}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Service Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1 max-w-[180px] truncate"
            >
              <option value="all">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchMaterials}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={fetchMaterials} className="font-semibold underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Materials Grid */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <p className="text-xs text-slate-500 font-medium">Loading collateral assets...</p>
        </div>
      ) : materials.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 shadow-xs text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Share2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No marketing materials found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search || selectedServiceId !== 'all' || selectedType !== 'all'
              ? 'No collateral matched your search or filters. Try adjusting your selections.'
              : 'There are currently no published marketing collaterals available.'}
          </p>
          {(search || selectedServiceId !== 'all' || selectedType !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedServiceId('all');
                setSelectedType('all');
              }}
              className="mt-4 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {materials.map((m) => {
            const typeCfg =
              MATERIAL_TYPE_CONFIG[m.material_type] || MATERIAL_TYPE_CONFIG.other;
            const TypeIcon = typeCfg.icon;

            return (
              <div
                key={m.id}
                className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden group"
              >
                {/* Card Header & Badge */}
                <div className="p-5 pb-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${typeCfg.badgeClass}`}
                    >
                      <TypeIcon className="w-3.5 h-3.5" />
                      {typeCfg.label}
                    </span>

                    <span className="text-[10px] font-medium text-slate-400">
                      {m.file_size ? formatFileSize(m.file_size) : m.file_url ? 'Cloud Link' : 'Asset'}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 text-sm">
                    {m.title}
                  </h3>

                  {m.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">
                      {m.description}
                    </p>
                  )}
                </div>

                {/* Applicable Services Chips */}
                <div className="px-5 py-2.5 bg-slate-50/50 border-t border-slate-100 flex-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-slate-400" />
                    Applicable Services
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.services && m.services.length > 0 ? (
                      m.services.slice(0, 3).map((srv) => (
                        <span
                          key={srv.service_id}
                          className="inline-flex items-center px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 text-[10px] font-medium truncate max-w-[150px]"
                        >
                          {srv.service_name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">Universal Collateral</span>
                    )}
                    {m.services && m.services.length > 3 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200 text-[10px] font-medium">
                        +{m.services.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 pt-3 border-t border-slate-100 bg-white flex items-center justify-between gap-2">
                  <button
                    onClick={() => openDetailModal(m)}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Details</span>
                  </button>

                  <button
                    onClick={() => handleDownloadAsset(m)}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL & PREVIEW MODAL */}
      {showDetailModal && selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Marketing Collateral Details</h3>
                  <p className="text-xs text-slate-500">Approved brand material for branch advertising</p>
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
              {detailLoading ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading asset data...</p>
                </div>
              ) : (
                <>
                  {/* Asset Preview (if image data URL) */}
                  {selectedMaterial.file_data && selectedMaterial.file_data.startsWith('data:image/') ? (
                    <div className="max-h-72 rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 flex items-center justify-center p-2">
                      <img
                        src={selectedMaterial.file_data}
                        alt={selectedMaterial.title}
                        className="max-h-64 object-contain rounded"
                      />
                    </div>
                  ) : null}

                  {/* Header Title & Badges */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          MATERIAL_TYPE_CONFIG[selectedMaterial.material_type]?.badgeClass || ''
                        }`}
                      >
                        {MATERIAL_TYPE_CONFIG[selectedMaterial.material_type]?.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Pre-Approved Corporate Asset
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">{selectedMaterial.title}</h2>
                    {selectedMaterial.description && (
                      <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Usage & Distribution Guidelines
                        </span>
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                          {selectedMaterial.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Meta Specs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg text-xs border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">File Name</span>
                      <span className="font-medium text-slate-800 truncate block">
                        {selectedMaterial.file_name || 'Asset File'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">File Size</span>
                      <span className="font-medium text-slate-800">
                        {formatFileSize(selectedMaterial.file_size) || 'External / Cloud'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Release Date</span>
                      <span className="font-medium text-slate-800">
                        {new Date(selectedMaterial.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Applicable Services */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Applicable Statutory Services ({selectedMaterial.services.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {selectedMaterial.services.map((srv) => (
                        <span
                          key={srv.service_id}
                          className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium"
                        >
                          {srv.service_name} ({srv.service_code})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Primary Download / Open Action */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDetailModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => handleDownloadAsset(selectedMaterial)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download / Open Collateral
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
