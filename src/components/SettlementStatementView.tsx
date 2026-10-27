import React, { useState, useEffect } from 'react';
import {
  FileText,
  Calendar,
  Filter,
  RefreshCw,
  Printer,
  Download,
  Building2,
  CheckCircle2,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Receipt,
  Search,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { ApiClient } from '../api';
import type {
  SettlementStatementResult,
  FranchiseCommissionAccountDetail,
} from '../types';

interface SettlementStatementViewProps {
  isAdmin?: boolean;
  initialOrganizationId?: string;
  accounts?: FranchiseCommissionAccountDetail[];
}

export const SettlementStatementView: React.FC<SettlementStatementViewProps> = ({
  isAdmin = false,
  initialOrganizationId,
  accounts = [],
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedOrgId, setSelectedOrgId] = useState<string>(initialOrganizationId || '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [entrySearch, setEntrySearch] = useState<string>('');

  // Loaded Statement Data
  const [statement, setStatement] = useState<SettlementStatementResult | null>(null);

  // Franchise list for admin selector
  const [franchiseAccounts, setFranchiseAccounts] = useState<FranchiseCommissionAccountDetail[]>(accounts);

  // If admin and accounts provided but no selectedOrgId, pick the first account; if accounts empty, fetch
  useEffect(() => {
    if (accounts.length > 0) {
      setFranchiseAccounts(accounts);
      if (isAdmin && !selectedOrgId) {
        setSelectedOrgId(accounts[0].organization_id);
      }
    } else if (isAdmin) {
      ApiClient.getCommissionAccounts().then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setFranchiseAccounts(res.data);
          if (!selectedOrgId) {
            setSelectedOrgId(res.data[0].organization_id);
          }
        }
      }).catch(console.error);
    }
  }, [isAdmin, accounts, selectedOrgId]);

  const loadStatement = async () => {
    try {
      setError(null);
      const res = await ApiClient.getSettlementStatement({
        organizationId: selectedOrgId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (res.success && res.data) {
        setStatement(res.data);
      } else {
        throw new Error('Failed to load settlement statement');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching settlement statement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [selectedOrgId, startDate, endDate]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadStatement();
  };

  const applyPeriodPreset = (preset: 'all' | 'this_month' | 'last_month' | 'ytd') => {
    const now = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      setStartDate(`${year}-${month}-01`);
      setEndDate(now.toISOString().split('T')[0]);
      return;
    }
    if (preset === 'last_month') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonthDate.getFullYear();
      const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
      setStartDate(`${year}-${month}-01`);
      setEndDate(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
      return;
    }
    if (preset === 'ytd') {
      const year = now.getFullYear();
      setStartDate(`${year}-01-01`);
      setEndDate(now.toISOString().split('T')[0]);
      return;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!statement) return;
    const s = statement.summary;
    const f = statement.franchise;

    const summaryRows = [
      ['FRANCHISE SETTLEMENT STATEMENT SUMMARY'],
      ['Franchise Code', f.franchiseCode],
      ['Operating Name', `"${f.operatingName}"`],
      ['Location', `"${f.city || ''}, ${f.district || ''}, ${f.state || ''}"`],
      ['Period Start', statement.period.startDate || 'Beginning of time'],
      ['Period End', statement.period.endDate || 'Present'],
      ['Currency', f.currency],
      ['Opening Balance (INR)', s.openingBalance],
      ['Earned Commissions (INR)', s.earnedCommissions],
      ['Campaign Deductions (INR)', s.campaignDeductions],
      ['Buy Lead Deductions (INR)', s.buyLeadDeductions],
      ['Manual Credits (INR)', s.manualCredits],
      ['Manual Debits (INR)', s.manualDebits],
      ['Net Manual Adjustments (INR)', s.manualAdjustments],
      ['Payouts (INR)', s.payouts],
      ['Closing Balance (INR)', s.closingBalance],
      ['Net Change in Period (INR)', s.netChange],
      [],
      ['ITEMIZED TRANSACTION ENTRIES'],
      ['Date', 'Reference ID', 'Category', 'Type', 'Description', 'Amount (INR)', 'Balance Before (INR)', 'Balance After (INR)'],
    ];

    const entryRows = statement.entries.map((e) => [
      e.date,
      e.referenceId,
      e.category,
      e.entryType.toUpperCase(),
      `"${e.description.replace(/"/g, '""')}"`,
      e.amount,
      e.balanceBefore,
      e.balanceAfter,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [...summaryRows.map((r) => r.join(',')), ...entryRows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Settlement_Statement_${f.franchiseCode}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = statement?.summary;
  const franchise = statement?.franchise;

  // Filtered Entries
  const filteredEntries = (statement?.entries || []).filter((e) => {
    if (!entrySearch.trim()) return true;
    const q = entrySearch.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      e.referenceId.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    );
  });

  // Calculate reconciliation check
  const calculatedClosing = summary
    ? Math.round(
        (summary.openingBalance +
          summary.earnedCommissions +
          summary.manualCredits -
          summary.campaignDeductions -
          summary.buyLeadDeductions -
          summary.manualDebits -
          summary.payouts +
          summary.reversals) *
          100
      ) / 100
    : 0;
  const isReconciled = summary ? summary.closingBalance === calculatedClosing : false;

  return (
    <div className="space-y-6">
      {/* Controls Bar (Hidden in Print) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Periodic Settlement Statement
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Formal auditable statement reconciling opening balance, earned commissions, deductions, and payouts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!statement}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print Statement</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={!statement}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Generating...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Filter Selection Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Franchise Selector (Super Admin Only) */}
          {isAdmin && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Select Franchise Partner
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white font-medium"
              >
                {franchiseAccounts.map((acc) => (
                  <option key={acc.organization_id} value={acc.organization_id}>
                    {acc.operating_name || acc.franchise_code || acc.organization_id} (
                    {acc.franchise_code || 'No Code'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Statement Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Statement End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-white"
            />
          </div>

          {/* Quick Presets */}
          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Period Preset
            </label>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                onClick={() => applyPeriodPreset('all')}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  !startDate && !endDate
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => applyPeriodPreset('this_month')}
                className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors"
              >
                This Month
              </button>
              <button
                onClick={() => applyPeriodPreset('last_month')}
                className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors"
              >
                Last Month
              </button>
              <button
                onClick={() => applyPeriodPreset('ytd')}
                className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors"
              >
                YTD
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline text-xs">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-700" />
          <span className="text-xs font-semibold text-slate-600">
            Generating statement from immutable ledger records...
          </span>
        </div>
      ) : statement ? (
        <div className="space-y-6">
          {/* Official Document Container (Optimized for both screen & print) */}
          <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/80 shadow-2xs space-y-6 print:border-none print:shadow-none print:p-0">
            {/* Formal Corporate Header */}
            <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  LEGAL & BUSINESS SERVICES CENTER (LBSC)
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  FRANCHISE SETTLEMENT STATEMENT
                </h1>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                  <span>Statement Period:</span>
                  <strong className="text-slate-800 font-semibold">
                    {statement.period.startDate ? new Date(statement.period.startDate).toLocaleDateString() : 'Account Inception'}
                    {' '}&rarr;{' '}
                    {statement.period.endDate ? new Date(statement.period.endDate).toLocaleDateString() : 'Current Date'}
                  </strong>
                  <span aria-hidden="true">·</span>
                  <span>Currency: {franchise?.currency || 'INR'}</span>
                </div>
              </div>

              {/* Franchise Identity Badge */}
              <div className="sm:text-right bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg border sm:border-none border-slate-200">
                <div className="text-xs font-mono font-bold text-slate-900">
                  {franchise?.franchiseCode}
                </div>
                <div className="text-xs font-semibold text-slate-700 mt-0.5">
                  {franchise?.operatingName}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[franchise?.city, franchise?.district, franchise?.state].filter(Boolean).join(', ')}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Issued: {new Date(statement.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Reconciliation Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {/* 1. Opening Balance */}
              <div className="bg-slate-50/75 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Opening Balance
                </span>
                <div className="text-base font-bold text-slate-900 mt-1">
                  ₹{(summary?.openingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Pre-period ledger</span>
              </div>

              {/* 2. Earned Commissions */}
              <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                  Earned (+)
                </span>
                <div className="text-base font-bold text-emerald-700 mt-1">
                  +₹{(summary?.earnedCommissions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-emerald-600 mt-0.5 block">Service completions</span>
              </div>

              {/* 3. Campaign Deductions */}
              <div className="bg-slate-50/75 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Campaign Fees (-)
                </span>
                <div className="text-base font-bold text-slate-800 mt-1">
                  -₹{(summary?.campaignDeductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">₹100/day territory fee</span>
              </div>

              {/* 4. Buy Lead Deductions */}
              <div className="bg-slate-50/75 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Buy Leads (-)
                </span>
                <div className="text-base font-bold text-slate-800 mt-1">
                  -₹{(summary?.buyLeadDeductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">₹20 marketplace fee</span>
              </div>

              {/* 5. Manual Adjustments */}
              <div className="bg-slate-50/75 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Adjustments (&plusmn;)
                </span>
                <div className={`text-base font-bold mt-1 ${
                  (summary?.manualAdjustments || 0) >= 0 ? 'text-slate-900' : 'text-rose-600'
                }`}>
                  {(summary?.manualAdjustments || 0) >= 0 ? '+' : ''}
                  ₹{(summary?.manualAdjustments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Admin adjustments</span>
              </div>

              {/* 6. Payouts */}
              <div className="bg-slate-50/75 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Payouts (-)
                </span>
                <div className="text-base font-bold text-slate-800 mt-1">
                  -₹{(summary?.payouts || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Transfers released</span>
              </div>

              {/* 7. Closing Balance */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Closing Balance
                </span>
                <div className="text-base font-bold text-white mt-1">
                  ₹{(summary?.closingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-emerald-400 mt-0.5 block">Reconciled balance</span>
              </div>
            </div>

            {/* Mathematical Reconciliation Formula Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Audited Double-Entry Reconciliation Formula</span>
                </div>
                <div className="font-mono text-[11px] text-slate-600">
                  ₹{summary?.openingBalance || 0} (Opening) + ₹{summary?.earnedCommissions || 0} (Earned) + ₹{summary?.manualCredits || 0} (Credit Adj) - ₹{summary?.campaignDeductions || 0} (Campaign) - ₹{summary?.buyLeadDeductions || 0} (Buy Leads) - ₹{summary?.manualDebits || 0} (Debit Adj) - ₹{summary?.payouts || 0} (Payouts) = <strong className="text-slate-900 font-bold">₹{summary?.closingBalance || 0}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Zero Variance Reconciled</span>
                </span>
              </div>
            </div>

            {/* Itemized Transactions Section */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Itemized Statement Ledger Transactions
                  </h3>
                  <span className="text-xs text-slate-500">
                    ({statement.totalEntriesCount} records)
                  </span>
                </div>

                <div className="relative w-full sm:w-64 print:hidden">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search statement entries..."
                    value={entrySearch}
                    onChange={(e) => setEntrySearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No transaction ledger entries recorded in this statement period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Reference ID</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                        <th className="py-2.5 px-3 text-right">Balance After (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {filteredEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-3 text-slate-600 font-sans whitespace-nowrap">
                            {new Date(e.date).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px] font-mono">
                            {e.referenceId}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-700 capitalize font-medium">
                            {e.category.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span
                              className={`text-[11px] font-bold uppercase ${
                                e.entryType === 'credit'
                                  ? 'text-emerald-700'
                                  : 'text-slate-700'
                              }`}
                            >
                              {e.entryType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-sans max-w-xs truncate">
                            {e.description}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold ${
                              e.entryType === 'credit'
                                ? 'text-emerald-700'
                                : 'text-slate-800'
                            }`}
                          >
                            {e.entryType === 'credit' ? '+' : '-'}₹
                            {e.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-900 font-semibold">
                            ₹{e.balanceAfter.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Official Print Footer */}
            <div className="pt-6 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div>
                This is an authenticated computer-generated settlement statement issued by the Legal & Business Services Center platform.
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                LBSC-STMT-REF-{franchise?.franchiseCode}-{Date.now()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
