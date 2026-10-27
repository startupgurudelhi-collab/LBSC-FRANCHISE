import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Edit2,
  AlertCircle,
  Layers,
  X,
  Briefcase,
  RefreshCw,
  Power,
  Download,
  ExternalLink,
  Archive,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  Video,
  Presentation,
  BookOpen,
  UploadCloud,
  FileCheck2,
  Folder,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type {
  MarketingMaterial,
  MarketingMaterialType,
  MarketingMaterialServiceMapping,
} from '../../types';

interface ServiceOption {
  id: string;
  name: string;
  code: string;
  category_name?: string;
}

export const MATERIAL_TYPE_CONFIG: Record<
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

export const AdminMarketingView: React.FC = () => {
  const [materials, setMaterials] = useState<MarketingMaterial[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'unpublished' | 'archived'>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Active item
  const [selectedMaterial, setSelectedMaterial] = useState<MarketingMaterial | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMaterialType, setFormMaterialType] = useState<MarketingMaterialType>('flyer');
  const [formUploadMode, setFormUploadMode] = useState<'file' | 'url'>('file');
  const [formFileUrl, setFormFileUrl] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formFileType, setFormFileType] = useState('');
  const [formFileSize, setFormFileSize] = useState<number | null>(null);
  const [formFileData, setFormFileData] = useState<string | null>(null);
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formSelectedServices, setFormSelectedServices] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load service masters catalog for mappings
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

  // Fetch Marketing Materials list
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
      if (statusFilter === 'published') {
        params.isPublished = true;
        params.isArchived = false;
      } else if (statusFilter === 'unpublished') {
        params.isPublished = false;
        params.isArchived = false;
      } else if (statusFilter === 'archived') {
        params.isArchived = true;
      } else {
        // default 'all' shows active items
        params.isArchived = false;
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
      setError(err.message || 'Failed to load marketing materials');
    } finally {
      setLoading(false);
    }
  }, [selectedServiceId, selectedType, search, statusFilter]);

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Handle local file selection and convert to Base64 Data URL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setFormError('File size exceeds the 8MB limit. Please compress or provide an external asset URL.');
      return;
    }

    setFormFileName(file.name);
    setFormFileType(file.type || 'application/octet-stream');
    setFormFileSize(file.size);
    setFormError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setFormFileData(base64);
    };
    reader.onerror = () => {
      setFormError('Failed to read file data. Please try another file.');
    };
    reader.readAsDataURL(file);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setFormTitle('');
    setFormDescription('');
    setFormMaterialType('flyer');
    setFormUploadMode('file');
    setFormFileUrl('');
    setFormFileName('');
    setFormFileType('');
    setFormFileSize(null);
    setFormFileData(null);
    setFormIsPublished(true);
    setFormSelectedServices([]);
    setFormError(null);
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const openEditModal = async (material: MarketingMaterial) => {
    setSelectedMaterial(material);
    setFormTitle(material.title);
    setFormDescription(material.description || '');
    setFormMaterialType(material.material_type);
    setFormUploadMode(material.file_data ? 'file' : material.file_url ? 'url' : 'file');
    setFormFileUrl(material.file_url || '');
    setFormFileName(material.file_name || '');
    setFormFileType(material.file_type || '');
    setFormFileSize(material.file_size || null);
    setFormFileData(material.file_data || null);
    setFormIsPublished(Boolean(material.is_published));
    setFormSelectedServices(material.services.map((s) => s.service_id));
    setFormError(null);
    setShowEditModal(true);
  };

  // Open Detail Modal
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
      console.error('Failed to fetch material details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Service toggle in form
  const toggleServiceSelection = (serviceId: string) => {
    setFormSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  // Select all services
  const selectAllServices = () => {
    setFormSelectedServices(services.map((s) => s.id));
  };

  // Clear services
  const clearAllServices = () => {
    setFormSelectedServices([]);
  };

  // Create submission
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formTitle.trim().length < 3) {
      setFormError('Title must be at least 3 characters long');
      return;
    }

    if (formSelectedServices.length === 0) {
      setFormError('Please select at least one applicable service');
      return;
    }

    if (formUploadMode === 'file' && !formFileData) {
      setFormError('Please choose a file to upload or switch to external URL mode');
      return;
    }

    if (formUploadMode === 'url' && !formFileUrl.trim()) {
      setFormError('Please enter a valid external asset link');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        material_type: formMaterialType,
        file_name: formUploadMode === 'file' ? formFileName : formFileName || 'External Asset',
        file_type: formUploadMode === 'file' ? formFileType : 'external/url',
        file_size: formUploadMode === 'file' ? formFileSize : null,
        file_url: formUploadMode === 'url' ? formFileUrl.trim() : null,
        file_data: formUploadMode === 'file' ? formFileData : null,
        is_published: formIsPublished,
        service_ids: formSelectedServices,
      };

      await ApiClient.createMarketingMaterial(payload);
      setShowCreateModal(false);
      fetchMaterials();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create marketing material');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update submission
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial) return;
    setFormError(null);

    if (formTitle.trim().length < 3) {
      setFormError('Title must be at least 3 characters long');
      return;
    }

    if (formSelectedServices.length === 0) {
      setFormError('Please select at least one applicable service');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        material_type: formMaterialType,
        is_published: formIsPublished,
        service_ids: formSelectedServices,
      };

      if (formUploadMode === 'file' && formFileData) {
        payload.file_name = formFileName;
        payload.file_type = formFileType;
        payload.file_size = formFileSize;
        payload.file_data = formFileData;
        payload.file_url = null;
      } else if (formUploadMode === 'url' && formFileUrl.trim()) {
        payload.file_url = formFileUrl.trim();
        payload.file_name = formFileName || 'External Asset';
        payload.file_type = 'external/url';
        payload.file_data = null;
      }

      await ApiClient.updateMarketingMaterial(selectedMaterial.id, payload);
      setShowEditModal(false);
      fetchMaterials();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update marketing material');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle publish status
  const handleTogglePublish = async (material: MarketingMaterial) => {
    try {
      const nextStatus = !material.is_published;
      await ApiClient.setMarketingMaterialPublishStatus(material.id, nextStatus);
      setMaterials((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, is_published: nextStatus } : m))
      );
    } catch (err: any) {
      alert(`Error toggling publish status: ${err.message}`);
    }
  };

  // Archive / Restore
  const handleToggleArchive = async (material: MarketingMaterial) => {
    const nextArchived = !material.is_archived;
    const confirmMsg = nextArchived
      ? `Archive "${material.title}"? Franchisees will no longer see this collateral.`
      : `Restore "${material.title}" to active marketing catalog?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await ApiClient.setMarketingMaterialArchiveStatus(material.id, nextArchived);
      fetchMaterials();
    } catch (err: any) {
      alert(`Error updating archive status: ${err.message}`);
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

  // Formatting helpers
  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Quick stats
  const totalCount = materials.length;
  const publishedCount = materials.filter((m) => m.is_published && !m.is_archived).length;
  const unpublishedCount = materials.filter((m) => !m.is_published && !m.is_archived).length;
  const archivedCount = materials.filter((m) => m.is_archived).length;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Marketing Materials</h1>
              <p className="text-xs text-slate-500">
                Central brand collateral, approved flyers, social media kits, and promotional assets
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchMaterials}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh materials"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Upload Collateral
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Catalog</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Approved corporate assets</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Published</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{publishedCount}</p>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Visible to all franchise hubs</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Draft / Hidden</span>
            <XCircle className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{unpublishedCount}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Unpublished internal drafts</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Archived</span>
            <Archive className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{archivedCount}</p>
          <span className="text-[11px] text-amber-600 mt-0.5 block">Retired historical collaterals</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, description..."
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
          {/* Material Type filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Folder className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Material Types</option>
              {Object.entries(MATERIAL_TYPE_CONFIG).map(([typeKey, cfg]) => (
                <option key={typeKey} value={typeKey}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Service filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1 max-w-[160px] truncate"
            >
              <option value="all">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Active (All)</option>
              <option value="published">Published Only</option>
              <option value="unpublished">Unpublished Only</option>
              <option value="archived">Archived Collateral</option>
            </select>
          </div>
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

      {/* Main Table Content */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <p className="text-xs text-slate-500 font-medium">Loading marketing materials...</p>
        </div>
      ) : materials.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 shadow-xs text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Share2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No marketing materials found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search || selectedServiceId !== 'all' || selectedType !== 'all' || statusFilter !== 'all'
              ? 'No materials matched your filter criteria. Try resetting filters.'
              : 'No marketing collaterals have been created yet. Click "Upload Collateral" to get started.'}
          </p>
          {(search || selectedServiceId !== 'all' || selectedType !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedServiceId('all');
                setSelectedType('all');
                setStatusFilter('all');
              }}
              className="mt-4 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Collateral</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Applicable Services</th>
                  <th className="py-3 px-4">Asset Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {materials.map((m) => {
                  const typeCfg =
                    MATERIAL_TYPE_CONFIG[m.material_type] || MATERIAL_TYPE_CONFIG.other;
                  const TypeIcon = typeCfg.icon;
                  const isPub = Boolean(m.is_published);
                  const isArch = Boolean(m.is_archived);

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isArch ? 'opacity-60 bg-slate-50/30' : ''
                      }`}
                    >
                      {/* Collateral Title & Desc */}
                      <td className="py-4 px-4 align-top max-w-xs">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeCfg.badgeClass}`}
                          >
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 hover:text-indigo-600 block line-clamp-1">
                              {m.title}
                            </span>
                            {m.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {m.description}
                              </p>
                            )}
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              Added {new Date(m.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${typeCfg.badgeClass}`}
                        >
                          <TypeIcon className="w-3 h-3" />
                          {typeCfg.label}
                        </span>
                      </td>

                      {/* Applicable Services */}
                      <td className="py-4 px-4 align-top max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {m.services && m.services.length > 0 ? (
                            m.services.slice(0, 2).map((srv) => (
                              <span
                                key={srv.service_id}
                                className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium"
                              >
                                {srv.service_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">No mapped services</span>
                          )}
                          {m.services && m.services.length > 2 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 text-[10px] font-medium">
                              +{m.services.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Asset Details */}
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <div className="space-y-0.5 text-[11px]">
                          {m.file_data || m.file_name ? (
                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                              <Download className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate max-w-[120px]">{m.file_name || 'File Attached'}</span>
                              {m.file_size ? (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({formatFileSize(m.file_size)})
                                </span>
                              ) : null}
                            </div>
                          ) : m.file_url ? (
                            <a
                              href={m.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 font-medium text-indigo-600 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              <span>Asset Link</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">No file attached</span>
                          )}
                          <span className="text-[10px] text-slate-400 block">
                            Format: {m.file_type || 'Generic'}
                          </span>
                        </div>
                      </td>

                      {/* Status & Quick Toggle */}
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isArch ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Archive className="w-3 h-3 text-amber-600" />
                              <span>Archived</span>
                            </span>
                          ) : isPub ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Published</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              <XCircle className="w-3 h-3 text-slate-400" />
                              <span>Draft</span>
                            </span>
                          )}

                          {!isArch && (
                            <button
                              onClick={() => handleTogglePublish(m)}
                              title={isPub ? 'Unpublish Collateral' : 'Publish to Franchisees'}
                              className={`p-1 rounded-md border text-xs transition-colors ${
                                isPub
                                  ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDetailModal(m)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                            title="View collateral details & preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Edit metadata"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleArchive(m)}
                            className={`p-1.5 rounded-md transition-colors ${
                              isArch
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isArch ? 'Restore collateral' : 'Archive collateral'}
                          >
                            {isArch ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
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

      {/* CREATE MATERIAL MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Upload Marketing Collateral</h3>
                  <p className="text-xs text-slate-500">
                    Add high-resolution marketing media, brochures, or campaign banners
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collateral Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., GST Registration Starter Kit - Leaflet (English)"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description & Usage Guidelines</label>
                <textarea
                  rows={2}
                  placeholder="How franchise owners should print or distribute this collateral..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Material Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collateral Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formMaterialType}
                  onChange={(e) => setFormMaterialType(e.target.value as MarketingMaterialType)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  {Object.entries(MATERIAL_TYPE_CONFIG).map(([t, cfg]) => (
                    <option key={t} value={t}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload Mode Choice: Direct File vs External URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Asset Source</label>
                <div className="grid grid-cols-2 gap-2 mb-2.5">
                  <button
                    type="button"
                    onClick={() => setFormUploadMode('file')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                      formUploadMode === 'file'
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Direct File Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormUploadMode('url')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                      formUploadMode === 'url'
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    External Asset Link (Drive / Canva)
                  </button>
                </div>

                {formUploadMode === 'file' ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors">
                    <input
                      type="file"
                      id="create-file-upload"
                      className="hidden"
                      onChange={handleFileChange}
                      accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.zip"
                    />
                    <label htmlFor="create-file-upload" className="cursor-pointer block">
                      <UploadCloud className="w-8 h-8 text-indigo-500 mx-auto mb-1.5" />
                      {formFileName ? (
                        <div className="text-xs">
                          <p className="font-semibold text-slate-900">{formFileName}</p>
                          <p className="text-slate-400">
                            {formatFileSize(formFileSize)} · {formFileType}
                          </p>
                          <span className="text-indigo-600 underline mt-1 inline-block">Change file</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">
                          <span className="font-semibold text-indigo-600 hover:underline">Click to browse</span> or
                          drag & drop
                          <p className="text-[11px] text-slate-400 mt-0.5">PNG, JPG, PDF, PPTX up to 8MB</p>
                        </div>
                      )}
                    </label>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/... or https://www.canva.com/..."
                      value={formFileUrl}
                      onChange={(e) => setFormFileUrl(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Direct cloud URL for vector design files, Canva templates, or Google Drive folders
                    </p>
                  </div>
                )}
              </div>

              {/* Applicable Services Multi-Select */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Applicable Service(s) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllServices}
                      className="text-indigo-600 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllServices}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 space-y-1.5">
                  {services.map((srv) => {
                    const isChecked = formSelectedServices.includes(srv.id);
                    return (
                      <label
                        key={srv.id}
                        className={`flex items-center gap-2 p-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleServiceSelection(srv.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500/20"
                        />
                        <span className="truncate flex-1">{srv.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{srv.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Publish Toggle */}
              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="create-publish"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500/20"
                />
                <label htmlFor="create-publish" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Publish immediately for all franchise branches
                </label>
              </div>

              {/* Submit Buttons */}
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Uploading...' : 'Save & Publish Collateral'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MATERIAL MODAL */}
      {showEditModal && selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Marketing Collateral</h3>
                  <p className="text-xs text-slate-500">Update collateral metadata or replace asset link</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collateral Title <span className="text-rose-500">*</span>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description & Usage Guidelines</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Material Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Collateral Category</label>
                <select
                  value={formMaterialType}
                  onChange={(e) => setFormMaterialType(e.target.value as MarketingMaterialType)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  {Object.entries(MATERIAL_TYPE_CONFIG).map(([t, cfg]) => (
                    <option key={t} value={t}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Applicable Services Multi-Select */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Applicable Service(s)</label>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllServices}
                      className="text-indigo-600 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllServices}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 space-y-1.5">
                  {services.map((srv) => {
                    const isChecked = formSelectedServices.includes(srv.id);
                    return (
                      <label
                        key={srv.id}
                        className={`flex items-center gap-2 p-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleServiceSelection(srv.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500/20"
                        />
                        <span className="truncate flex-1">{srv.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{srv.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Publish Toggle */}
              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="edit-publish"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500/20"
                />
                <label htmlFor="edit-publish" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Published for franchise branches
                </label>
              </div>

              {/* Submit Buttons */}
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Saving...' : 'Update Collateral'}</span>
                </button>
              </div>
            </form>
          </div>
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
                  <h3 className="text-base font-bold text-slate-900">Collateral Preview & Details</h3>
                  <p className="text-xs text-slate-500">Full specifications, asset payload, and service coverage</p>
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
                    <div className="max-h-64 rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 flex items-center justify-center p-2">
                      <img
                        src={selectedMaterial.file_data}
                        alt={selectedMaterial.title}
                        className="max-h-60 object-contain rounded"
                      />
                    </div>
                  ) : null}

                  {/* Header Title & Badges */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          MATERIAL_TYPE_CONFIG[selectedMaterial.material_type]?.badgeClass || ''
                        }`}
                      >
                        {MATERIAL_TYPE_CONFIG[selectedMaterial.material_type]?.label}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          selectedMaterial.is_published
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {selectedMaterial.is_published ? 'Published' : 'Draft'}
                      </span>
                      {selectedMaterial.is_archived ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{selectedMaterial.title}</h2>
                    {selectedMaterial.description && (
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                        {selectedMaterial.description}
                      </p>
                    )}
                  </div>

                  {/* Meta Specs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg text-xs border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">File Name</span>
                      <span className="font-medium text-slate-800 truncate block">
                        {selectedMaterial.file_name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">File Size</span>
                      <span className="font-medium text-slate-800">
                        {formatFileSize(selectedMaterial.file_size) || 'External / Unmeasured'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Created On</span>
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

                  {/* Download / Open Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Added by {selectedMaterial.created_by_name || 'Central Admin'}
                    </span>
                    <button
                      onClick={() => handleDownloadAsset(selectedMaterial)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download / Open Asset
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
