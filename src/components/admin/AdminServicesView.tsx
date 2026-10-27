import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Layers,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { ServiceMaster, ServiceCategory } from '../../types';

export const AdminServicesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'services' | 'categories'>('services');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Add/Edit Service Modal
  const [serviceModalData, setServiceModalData] = useState<{
    id?: string;
    categoryId: string;
    code: string;
    name: string;
    description: string;
    serviceFee: number;
    commissionValue: number;
    turnaroundDays: number;
    slaHours: number;
  } | null>(null);
  const [savingService, setSavingService] = useState(false);

  // Add/Edit Category Modal
  const [categoryModalData, setCategoryModalData] = useState<{
    id?: string;
    code: string;
    name: string;
    description: string;
    displayOrder: number;
    isActive: boolean;
  } | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [catRes, srvRes] = await Promise.all([
        ApiClient.getCategories(),
        ApiClient.getServices(),
      ]);

      if (catRes.success) setCategories(catRes.data || []);
      if (srvRes.success) setServices(srvRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading services and categories');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Toggle service status
  const handleToggleServiceStatus = async (service: ServiceMaster) => {
    const nextStatus = !Boolean(service.is_active);
    try {
      const res = await ApiClient.setServiceStatus(service.id, nextStatus);
      if (res.success) {
        setSuccessMessage(`Service ${service.name} status updated to ${nextStatus ? 'Active' : 'Inactive'}.`);
        loadData();
      } else {
        setError(res.error?.message || 'Failed to update service status');
      }
    } catch (err: any) {
      setError(err.message || 'Error toggling service status');
    }
  };

  // Save Service
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceModalData) return;

    setSavingService(true);
    setError(null);
    try {
      if (serviceModalData.id) {
        // Update
        const res = await ApiClient.updateService(serviceModalData.id, {
          categoryId: serviceModalData.categoryId,
          name: serviceModalData.name,
          description: serviceModalData.description || null,
          serviceFee: Number(serviceModalData.serviceFee),
          commissionValue: Number(serviceModalData.commissionValue),
          turnaroundDays: Number(serviceModalData.turnaroundDays),
          slaHours: Number(serviceModalData.slaHours),
        });
        if (res.success) {
          setSuccessMessage(`Service ${serviceModalData.name} updated successfully.`);
          setServiceModalData(null);
          loadData();
        } else {
          setError(res.error?.message || 'Failed to update service');
        }
      } else {
        // Create
        const res = await ApiClient.createService({
          categoryId: serviceModalData.categoryId,
          code: serviceModalData.code.trim().toUpperCase(),
          name: serviceModalData.name.trim(),
          description: serviceModalData.description || null,
          serviceFee: Number(serviceModalData.serviceFee),
          commissionValue: Number(serviceModalData.commissionValue),
          turnaroundDays: Number(serviceModalData.turnaroundDays),
          slaHours: Number(serviceModalData.slaHours),
        });
        if (res.success) {
          setSuccessMessage(`Service ${serviceModalData.name} created successfully.`);
          setServiceModalData(null);
          loadData();
        } else {
          setError(res.error?.message || 'Failed to create service');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error saving service');
    } finally {
      setSavingService(false);
    }
  };

  // Save Category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryModalData) return;

    setSavingCategory(true);
    setError(null);
    try {
      if (categoryModalData.id) {
        // Update
        const res = await ApiClient.updateCategory(categoryModalData.id, {
          name: categoryModalData.name,
          description: categoryModalData.description || undefined,
          displayOrder: Number(categoryModalData.displayOrder),
          isActive: categoryModalData.isActive,
        });
        if (res.success) {
          setSuccessMessage(`Category ${categoryModalData.name} updated successfully.`);
          setCategoryModalData(null);
          loadData();
        } else {
          setError(res.error?.message || 'Failed to update category');
        }
      } else {
        // Create
        const res = await ApiClient.createCategory({
          code: categoryModalData.code.trim().toUpperCase(),
          name: categoryModalData.name.trim(),
          description: categoryModalData.description || undefined,
          displayOrder: Number(categoryModalData.displayOrder),
        });
        if (res.success) {
          setSuccessMessage(`Category ${categoryModalData.name} created successfully.`);
          setCategoryModalData(null);
          loadData();
        } else {
          setError(res.error?.message || 'Failed to create category');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error saving category');
    } finally {
      setSavingCategory(false);
    }
  };

  // Filter services
  const filteredServices = services.filter((srv) => {
    const matchesCat = categoryFilter ? srv.category_id === categoryFilter : true;
    const text = `${srv.code || ''} ${srv.name || ''} ${srv.category_name || ''}`.toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Services & Catalog Management
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {services.length} Services • {categories.length} Categories
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure legal and business services, pricing tiers, partner commission payouts, and SLA turnaround windows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'services' ? (
            <button
              onClick={() =>
                setServiceModalData({
                  categoryId: categories[0]?.id || '',
                  code: '',
                  name: '',
                  description: '',
                  serviceFee: 1500,
                  commissionValue: 300,
                  turnaroundDays: 3,
                  slaHours: 48,
                })
              }
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Service</span>
            </button>
          ) : (
            <button
              onClick={() =>
                setCategoryModalData({
                  code: '',
                  name: '',
                  description: '',
                  displayOrder: categories.length + 1,
                  isActive: true,
                })
              }
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'services'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Service Masters Catalog ({services.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'categories'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Service Categories ({categories.length})
        </button>
      </div>

      {/* View 1: Service Masters Catalog */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search services by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="w-full sm:w-auto shrink-0">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Services Table */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-xl"></div>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-slate-200/80 shadow-2xs text-slate-400 text-xs">
              <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-slate-700">No services match your criteria</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 border-b border-slate-200/70 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Service Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Customer Fee</th>
                      <th className="py-3 px-4 text-right">Partner Commission</th>
                      <th className="py-3 px-4 text-center">SLA / TAT</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredServices.map((srv) => (
                      <tr key={srv.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {srv.code}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div>{srv.name}</div>
                          {srv.description && (
                            <p className="text-[11px] text-slate-400 truncate max-w-xs">
                              {srv.description}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                            {srv.category_name || 'Category'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          ₹{Number(srv.service_fee).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">
                          ₹{Number(srv.commission_value).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 text-[11px]">
                          {srv.turnaround_days}d ({srv.sla_hours}h)
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleServiceStatus(srv)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                              Boolean(srv.is_active)
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {Boolean(srv.is_active) ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() =>
                              setServiceModalData({
                                id: srv.id,
                                categoryId: srv.category_id,
                                code: srv.code,
                                name: srv.name,
                                description: srv.description || '',
                                serviceFee: srv.service_fee,
                                commissionValue: srv.commission_value,
                                turnaroundDays: srv.turnaround_days,
                                slaHours: srv.sla_hours,
                              })
                            }
                            className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                            title="Edit Service"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View 2: Categories */}
      {activeTab === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200/70 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Category Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Display Order</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">{cat.code}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{cat.name}</td>
                    <td className="py-3 px-4 text-slate-500 max-w-sm truncate">
                      {cat.description || '—'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">
                      {cat.display_order}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          Boolean(cat.is_active)
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {Boolean(cat.is_active) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          setCategoryModalData({
                            id: cat.id,
                            code: cat.code,
                            name: cat.name,
                            description: cat.description || '',
                            displayOrder: cat.display_order,
                            isActive: Boolean(cat.is_active),
                          })
                        }
                        className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Service Modal */}
      {serviceModalData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {serviceModalData.id ? 'Edit Service' : 'Add New Service'}
              </h3>
              <button
                onClick={() => setServiceModalData(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Service Code
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(serviceModalData.id)}
                    placeholder="e.g. GST-REG-01"
                    value={serviceModalData.code}
                    onChange={(e) =>
                      setServiceModalData({ ...serviceModalData, code: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    required
                    value={serviceModalData.categoryId}
                    onChange={(e) =>
                      setServiceModalData({ ...serviceModalData, categoryId: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GST Registration & Filing Setup"
                  value={serviceModalData.name}
                  onChange={(e) =>
                    setServiceModalData({ ...serviceModalData, name: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Service description and scope..."
                  value={serviceModalData.description}
                  onChange={(e) =>
                    setServiceModalData({ ...serviceModalData, description: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Fee (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={serviceModalData.serviceFee}
                    onChange={(e) =>
                      setServiceModalData({
                        ...serviceModalData,
                        serviceFee: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Partner Commission (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={serviceModalData.commissionValue}
                    onChange={(e) =>
                      setServiceModalData({
                        ...serviceModalData,
                        commissionValue: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Turnaround (Days)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={serviceModalData.turnaroundDays}
                    onChange={(e) =>
                      setServiceModalData({
                        ...serviceModalData,
                        turnaroundDays: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SLA (Hours)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={serviceModalData.slaHours}
                    onChange={(e) =>
                      setServiceModalData({
                        ...serviceModalData,
                        slaHours: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setServiceModalData(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingService}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingService ? 'Saving...' : 'Save Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {categoryModalData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {categoryModalData.id ? 'Edit Category' : 'New Service Category'}
              </h3>
              <button
                onClick={() => setCategoryModalData(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category Code
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(categoryModalData.id)}
                    placeholder="e.g. TAX"
                    value={categoryModalData.code}
                    onChange={(e) =>
                      setCategoryModalData({ ...categoryModalData, code: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={categoryModalData.displayOrder}
                    onChange={(e) =>
                      setCategoryModalData({
                        ...categoryModalData,
                        displayOrder: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Taxation & GST Filings"
                  value={categoryModalData.name}
                  onChange={(e) =>
                    setCategoryModalData({ ...categoryModalData, name: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Category scope..."
                  value={categoryModalData.description}
                  onChange={(e) =>
                    setCategoryModalData({ ...categoryModalData, description: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryModalData(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingCategory ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
