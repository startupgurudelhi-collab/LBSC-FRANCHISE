import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Play,
  BookmarkPlus,
  Bookmark,
  Trash2,
  Download,
  Filter,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  Clock,
  ArrowUpDown,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type {
  CustomReportDataset,
  CustomReportDatasetSchema,
  CustomReportRequest,
  CustomReportResult,
  SavedCustomReportModel,
  ReportFilterCriteria,
} from '../../types';

interface CustomReportBuilderProps {
  franchisesList?: Array<{ id: string; name: string }>;
  servicesList?: Array<{ id: string; name: string }>;
}

export const CustomReportBuilder: React.FC<CustomReportBuilderProps> = ({
  franchisesList = [],
  servicesList = [],
}) => {
  // Schema & Available Datasets
  const [schemas, setSchemas] = useState<CustomReportDatasetSchema[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Configuration State
  const [selectedDataset, setSelectedDataset] = useState<CustomReportDataset>('leads');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string>('');
  const [filters, setFilters] = useState<ReportFilterCriteria>({
    status: 'all',
    franchise: 'all',
    service: 'all',
    city: '',
    district: '',
    state: '',
    search: '',
  });

  // Query Execution State
  const [executing, setExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<CustomReportResult | null>(null);

  // Saved Reports State
  const [savedReports, setSavedReports] = useState<SavedCustomReportModel[]>([]);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>('');
  const [saveDescription, setSaveDescription] = useState<string>('');
  const [savingReport, setSavingReport] = useState<boolean>(false);

  // Load schemas and saved reports
  useEffect(() => {
    const init = async () => {
      try {
        setLoadingSchemas(true);
        const [schemaRes, savedRes] = await Promise.all([
          ApiClient.getCustomReportSchema(),
          ApiClient.getSavedCustomReports(),
        ]);

        if (schemaRes.success && Array.isArray(schemaRes.data)) {
          setSchemas(schemaRes.data);
          // Initialize selected fields with first 5 fields of default dataset
          const defaultSchema = schemaRes.data.find((s: any) => s.dataset === 'leads');
          if (defaultSchema) {
            setSelectedFields(defaultSchema.fields.slice(0, 5).map((f: any) => f.id));
          }
        }

        if (savedRes.success && Array.isArray(savedRes.data)) {
          setSavedReports(savedRes.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize custom report builder');
      } finally {
        setLoadingSchemas(false);
      }
    };

    init();
  }, []);

  // When dataset changes, reset selected fields and group by
  const handleDatasetChange = (dataset: CustomReportDataset) => {
    setSelectedDataset(dataset);
    setGroupBy('');
    const schema = schemas.find((s) => s.dataset === dataset);
    if (schema) {
      // Default select first 5-6 fields
      setSelectedFields(schema.fields.slice(0, 5).map((f) => f.id));
    } else {
      setSelectedFields([]);
    }
  };

  const currentSchema = schemas.find((s) => s.dataset === selectedDataset);

  const toggleField = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleSelectAllFields = () => {
    if (currentSchema) {
      setSelectedFields(currentSchema.fields.map((f) => f.id));
    }
  };

  const handleClearAllFields = () => {
    setSelectedFields([]);
  };

  // Run Custom Report
  const handleExecuteReport = async () => {
    try {
      setExecuting(true);
      setError(null);

      const payload: CustomReportRequest = {
        dataset: selectedDataset,
        fields: selectedFields,
        filters: {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          franchise: filters.franchise !== 'all' ? filters.franchise : undefined,
          service: filters.service !== 'all' ? filters.service : undefined,
          city: filters.city || undefined,
          district: filters.district || undefined,
          state: filters.state || undefined,
          search: filters.search || undefined,
        },
        groupBy: groupBy || undefined,
        limit: 250,
      };

      const res = await ApiClient.executeCustomReport(payload);
      if (res.success) {
        setResult(res.data);
      } else {
        setError(res.error?.message || 'Failed to execute custom report');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing custom report query');
    } finally {
      setExecuting(false);
    }
  };

  // Save report template
  const handleSaveReport = async () => {
    if (!saveName.trim()) return;
    try {
      setSavingReport(true);
      const res = await ApiClient.saveCustomReport({
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        dataset: selectedDataset,
        selectedFields,
        filterCriteria: filters,
        groupBy: groupBy || undefined,
      });

      if (res.success) {
        setSavedReports((prev) => [res.data, ...prev]);
        setShowSaveModal(false);
        setSaveName('');
        setSaveDescription('');
      }
    } catch (err: any) {
      setError(err.message || 'Error saving report template');
    } finally {
      setSavingReport(false);
    }
  };

  // Load saved report template
  const handleLoadSavedReport = (saved: SavedCustomReportModel) => {
    setSelectedDataset(saved.dataset);
    try {
      const fields = JSON.parse(saved.selected_fields);
      setSelectedFields(Array.isArray(fields) ? fields : []);
    } catch {
      setSelectedFields([]);
    }

    try {
      const f = JSON.parse(saved.filter_criteria);
      setFilters(f || {});
    } catch {
      setFilters({});
    }

    setGroupBy(saved.group_by || '');
    setError(null);
  };

  // Delete saved report
  const handleDeleteSavedReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await ApiClient.deleteSavedCustomReport(id);
      if (res.success) {
        setSavedReports((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err: any) {
      setError(err.message || 'Error deleting saved report');
    }
  };

  // Export Results as CSV
  const exportToCsv = () => {
    if (!result || !result.rows || result.rows.length === 0) return;

    const headers = result.fields.map((f) => `"${f.label.replace(/"/g, '""')}"`).join(',');
    const rows = result.rows.map((row) =>
      result.fields
        .map((f) => {
          const val = row[f.id];
          if (val === null || val === undefined) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `lbsc_custom_report_${selectedDataset}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Results as JSON
  const exportToJson = () => {
    if (!result) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(result, null, 2)
    )}`;
    const link = document.createElement('a');
    link.setAttribute('href', jsonString);
    link.setAttribute('download', `lbsc_custom_report_${selectedDataset}_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Builder Header Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-900">
                <Sliders className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Super Admin Custom Report Studio
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                DB-Level Aggregations
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Build and execute database queries with server-side <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">COUNT</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">SUM</code>, and <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">GROUP BY</code> across live LBSC datasets.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-slate-600" />
              <span>Save Template</span>
            </button>

            <button
              onClick={handleExecuteReport}
              disabled={executing || loadingSchemas}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-2xs transition-colors"
            >
              {executing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{executing ? 'Executing SQL...' : 'Run Query'}</span>
            </button>
          </div>
        </div>

        {/* Saved Templates Quick Bar */}
        {savedReports.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
              <Bookmark className="w-3 h-3 text-amber-500" /> Saved Templates:
            </span>
            {savedReports.map((saved) => (
              <div
                key={saved.id}
                onClick={() => handleLoadSavedReport(saved)}
                className="group flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-md cursor-pointer transition-colors shrink-0"
              >
                <span className="font-semibold text-slate-700 group-hover:text-amber-900">
                  {saved.name}
                </span>
                <span className="text-[10px] text-slate-400 uppercase">({saved.dataset})</span>
                <button
                  onClick={(e) => handleDeleteSavedReport(saved.id, e)}
                  className="text-slate-300 hover:text-rose-600 ml-1 p-0.5 rounded"
                  title="Delete saved template"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Dataset & Query Builder Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Dataset & Field Whitelist */}
        <div className="lg:col-span-4 space-y-4">
          {/* Dataset Selector Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span>1. Target Dataset</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'leads', label: 'Client Leads', desc: 'Leads & Conversions' },
                { id: 'franchises', label: 'Franchise Accounts', desc: 'Centers & Balances' },
                { id: 'commission_ledger', label: 'Commission Ledger', desc: 'Credits & Debits' },
                { id: 'services', label: 'Services Master', desc: 'Statutory Catalog' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleDatasetChange(item.id as CustomReportDataset)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    selectedDataset === item.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs">{item.label}</div>
                  <div
                    className={`text-[10px] ${
                      selectedDataset === item.id ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>

            {currentSchema && (
              <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-100">
                {currentSchema.description}
              </p>
            )}
          </div>

          {/* Field Whitelist Selection Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
                <span>2. Select Fields ({selectedFields.length})</span>
              </label>

              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={handleSelectAllFields}
                  className="text-amber-700 hover:underline font-medium"
                >
                  All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleClearAllFields}
                  className="text-slate-500 hover:underline font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {currentSchema?.fields.map((field) => {
                const isSelected = selectedFields.includes(field.id);
                return (
                  <div
                    key={field.id}
                    onClick={() => toggleField(field.id)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-amber-200 bg-amber-50/50 text-slate-900'
                        : 'border-slate-100 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      )}
                      <span className="font-medium truncate">{field.label}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {field.aggregatable && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                          SUM
                        </span>
                      )}
                      {field.groupable && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                          GROUP
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono">{field.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Filters, Grouping, & SQL Calculation */}
        <div className="lg:col-span-8 space-y-4">
          {/* Query Filters & DB Aggregation Setup */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-amber-500" />
                <span>3. Server-Side Filters & Aggregations</span>
              </label>

              <button
                onClick={() =>
                  setFilters({
                    status: 'all',
                    franchise: 'all',
                    service: 'all',
                    city: '',
                    district: '',
                    state: '',
                    search: '',
                  })
                }
                className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline"
              >
                Reset Filters
              </button>
            </div>

            {/* Filter Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {/* Date Range */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
                <select
                  value={filters.status || 'all'}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active / Credit</option>
                  <option value="inactive">Inactive / Debit</option>
                  <option value="offered">Offered (Leads)</option>
                  <option value="assigned">Assigned (Leads)</option>
                  <option value="own_lead_center">Own Lead Center</option>
                  <option value="converted">Converted</option>
                </select>
              </div>

              {/* Franchise */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Franchise
                </label>
                <select
                  value={filters.franchise || 'all'}
                  onChange={(e) => setFilters({ ...filters, franchise: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Franchises</option>
                  {franchisesList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Service</label>
                <select
                  value={filters.service || 'all'}
                  onChange={(e) => setFilters({ ...filters, service: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Services</option>
                  {servicesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* City */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">City</label>
                <input
                  type="text"
                  placeholder="e.g. Salem, Chennai"
                  value={filters.city || ''}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* District */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  District
                </label>
                <input
                  type="text"
                  placeholder="e.g. Salem, Coimbatore"
                  value={filters.district || ''}
                  onChange={(e) => setFilters({ ...filters, district: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* State */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. Tamil Nadu"
                  value={filters.state || ''}
                  onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Search */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Keyword</label>
                <input
                  type="text"
                  placeholder="Reference, name, phone..."
                  value={filters.search || ''}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Database GROUP BY Aggregation Setting */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Group By Field (SQL Aggregation):
                </span>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">None (Detailed Records)</option>
                  {currentSchema?.fields
                    .filter((f) => f.groupable)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label} ({f.id})
                      </option>
                    ))}
                </select>
              </div>

              <div className="text-[11px] text-slate-500">
                {groupBy ? (
                  <span className="text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    ⚡ Mode: Database-level GROUP BY + SUM/COUNT
                  </span>
                ) : (
                  <span className="text-slate-500">Mode: Filtered Record Rows</span>
                )}
              </div>
            </div>
          </div>

          {/* Query Results Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-4 min-h-[300px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Query Results
                </h3>
                {result && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-mono text-slate-700 font-semibold">
                      {result.totalRecords} records
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{result.executionTimeMs} ms</span>
                    </span>
                  </div>
                )}
              </div>

              {result && result.rows.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={exportToCsv}
                    className="flex items-center gap-1 px-2.5 py-1 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={exportToJson}
                    className="flex items-center gap-1 px-2.5 py-1 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    <FileCode className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              )}
            </div>

            {/* Table / Empty State */}
            {!result && !executing && (
              <div className="py-16 text-center space-y-2">
                <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-xs font-bold text-slate-700">No Query Executed Yet</div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Configure your dataset, fields, and filter parameters above, then click{' '}
                  <span className="font-semibold text-slate-700">"Run Query"</span> to compute
                  aggregations on the database.
                </p>
              </div>
            )}

            {executing && (
              <div className="py-16 text-center space-y-2">
                <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
                <div className="text-xs font-bold text-slate-700">
                  Executing Database Query...
                </div>
                <p className="text-[11px] text-slate-400">
                  Running SQL aggregation and filtering directly on the database engine.
                </p>
              </div>
            )}

            {result && result.rows.length === 0 && !executing && (
              <div className="py-12 text-center text-xs text-slate-400">
                No matching records found for the selected criteria and dataset.
              </div>
            )}

            {result && result.rows.length > 0 && !executing && (
              <div className="overflow-x-auto border border-slate-100 rounded-lg max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider sticky top-0">
                    <tr>
                      {result.fields.map((field) => (
                        <th key={field.id} className="py-2.5 px-3 font-semibold">
                          <div className="flex items-center gap-1">
                            <span>{field.label}</span>
                            <ArrowUpDown className="w-2.5 h-2.5 text-slate-300" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {result.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        {result.fields.map((field) => {
                          const val = row[field.id];
                          const isNumeric = field.type === 'number' || typeof val === 'number';
                          return (
                            <td
                              key={field.id}
                              className={`py-2 px-3 text-slate-800 ${
                                isNumeric ? 'text-right font-semibold text-slate-900' : ''
                              }`}
                            >
                              {val === null || val === undefined
                                ? '-'
                                : typeof val === 'number'
                                ? field.id.includes('fee') || field.id.includes('balance') || field.id.includes('amount') || field.id.includes('total_')
                                  ? `₹${val.toLocaleString('en-IN')}`
                                  : val.toLocaleString('en-IN')
                                : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <BookmarkPlus className="w-4 h-4 text-amber-500" />
                <span>Save Report Definition</span>
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Report Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Salem Monthly Converted Leads"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief note about the purpose of this custom report..."
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] space-y-1">
                <div>
                  <span className="font-semibold text-slate-700">Dataset:</span>{' '}
                  <span className="uppercase font-mono">{selectedDataset}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Selected Fields:</span>{' '}
                  {selectedFields.length} fields
                </div>
                {groupBy && (
                  <div>
                    <span className="font-semibold text-slate-700">Group By:</span>{' '}
                    <span className="font-mono">{groupBy}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveReport}
                disabled={!saveName.trim() || savingReport}
                className="px-4 py-1.5 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-2xs"
              >
                {savingReport ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
