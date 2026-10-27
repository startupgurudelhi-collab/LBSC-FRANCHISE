import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Search,
  Filter,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Building2,
  Receipt,
} from 'lucide-react';
import { ApiClient } from '../../api';
import { SettlementStatementView } from '../SettlementStatementView';
import type { FranchiseCommissionAccountDetail, LedgerEntry } from '../../types';

export const AdminCommissionsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<FranchiseCommissionAccountDetail[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [activeView, setActiveView] = useState<'ledger' | 'settlement'>('ledger');

  // Filters
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Adjustment Modal
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    organizationId: '',
    adjustmentType: 'credit' as 'credit' | 'debit',
    amount: 1000,
    reason: '',
    notes: '',
  });
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [accRes, ledRes] = await Promise.all([
        ApiClient.getCommissionAccounts(),
        ApiClient.getCommissionLedger({
          organizationId: selectedOrgId || undefined,
          entryType: entryTypeFilter || undefined,
          limit: 100,
        }),
      ]);

      if (accRes.success) setAccounts(accRes.data || []);
      if (ledRes.success) setLedgerEntries(ledRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading commission accounts and ledger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId, entryTypeFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentForm.organizationId || !adjustmentForm.reason.trim()) return;

    setSubmittingAdjustment(true);
    setError(null);
    try {
      const res = await ApiClient.applyCommissionAdjustment({
        organizationId: adjustmentForm.organizationId,
        adjustmentType: adjustmentForm.adjustmentType,
        amount: Number(adjustmentForm.amount),
        reason: adjustmentForm.reason.trim(),
        notes: adjustmentForm.notes.trim() || undefined,
      });

      if (res.success) {
        setSuccessMessage(
          `Successfully posted ₹${adjustmentForm.amount} ${adjustmentForm.adjustmentType} adjustment.`
        );
        setShowAdjustmentModal(false);
        setAdjustmentForm({
          organizationId: '',
          adjustmentType: 'credit',
          amount: 1000,
          reason: '',
          notes: '',
        });
        loadData();
      } else {
        setError(res.error?.message || 'Failed to post commission adjustment');
      }
    } catch (err: any) {
      setError(err.message || 'Error applying commission adjustment');
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  const totalNetworkBalance = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  const filteredLedger = ledgerEntries.filter((entry) => {
    const text = `${entry.reference_id || ''} ${entry.description || ''} ${
      entry.category || ''
    }`.toLowerCase();
    return text.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Commission & Escrow Management
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Total Escrow: ₹{totalNetworkBalance.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitor partner wallet balances, inspect the immutable audit ledger, and execute adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeView === 'ledger' && (
            <button
              onClick={() => {
                setAdjustmentForm({
                  organizationId: accounts[0]?.organization_id || '',
                  adjustmentType: 'credit',
                  amount: 1000,
                  reason: '',
                  notes: '',
                });
                setShowAdjustmentModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Post Adjustment</span>
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

      {/* View Switcher: Ledger vs Settlement Statement */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveView('ledger')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeView === 'ledger'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Commission Accounts & Ledger</span>
        </button>

        <button
          onClick={() => setActiveView('settlement')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeView === 'settlement'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4 text-indigo-600" />
          <span>Periodic Settlement Statement</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
            Phase 21B
          </span>
        </button>
      </div>

      {/* Settlement Statement View (Phase 21B) */}
      {activeView === 'settlement' && (
        <SettlementStatementView
          isAdmin={true}
          accounts={accounts}
          initialOrganizationId={selectedOrgId || accounts[0]?.organization_id}
        />
      )}

      {/* Ledger View */}
      {activeView === 'ledger' && (
        <>
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

      {/* Accounts Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            onClick={() => setSelectedOrgId(selectedOrgId === acc.organization_id ? '' : acc.organization_id)}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedOrgId === acc.organization_id
                ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  selectedOrgId === acc.organization_id
                    ? 'bg-slate-800 text-amber-400 border-slate-700'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {acc.franchise_code || 'CENTER'}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  selectedOrgId === acc.organization_id ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {selectedOrgId === acc.organization_id ? 'Filter Active' : 'Click to Filter'}
              </span>
            </div>

            <p
              className={`text-xs font-bold mt-2 truncate ${
                selectedOrgId === acc.organization_id ? 'text-white' : 'text-slate-900'
              }`}
            >
              {acc.operating_name || 'Legal & Business Services'}
            </p>

            <div className="mt-3 flex items-baseline justify-between">
              <span
                className={`text-lg font-extrabold ${
                  selectedOrgId === acc.organization_id ? 'text-amber-400' : 'text-slate-900'
                }`}
              >
                ₹{acc.current_balance.toLocaleString('en-IN')}
              </span>
              <span
                className={`text-[10px] font-mono ${
                  selectedOrgId === acc.organization_id ? 'text-slate-400' : 'text-slate-400'
                }`}
              >
                v{acc.version}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Master Ledger Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Immutable Audit Ledger</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Verified append-only financial records with balance-after continuity
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Franchise Centers</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.organization_id}>
                  {a.franchise_code} - {a.operating_name}
                </option>
              ))}
            </select>

            <select
              value={entryTypeFilter}
              onChange={(e) => setEntryTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
            >
              <option value="">Credit & Debit</option>
              <option value="credit">Credits Only</option>
              <option value="debit">Debits Only</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search ledger by reference ID, description, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
          />
        </div>

        {/* Ledger Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-lg"></div>
            ))}
          </div>
        ) : filteredLedger.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No transactions found on ledger.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Reference ID</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Type</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLedger.map((entry) => {
                  const isCredit = entry.entry_type === 'credit';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {entry.reference_id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 capitalize">
                          {entry.category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                        {entry.description}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                            isCredit ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          <span className="capitalize">{entry.entry_type}</span>
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          isCredit ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isCredit ? '+' : '-'}₹{entry.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{entry.balance_after.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Manual Commission Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Post Commission Adjustment</h3>
                <p className="text-xs text-slate-500 mt-0.5">Executes an immutable manual adjustment</p>
              </div>
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyAdjustment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Franchise Center
                </label>
                <select
                  required
                  value={adjustmentForm.organizationId}
                  onChange={(e) =>
                    setAdjustmentForm({ ...adjustmentForm, organizationId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">Select target franchise...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.organization_id}>
                      {a.franchise_code} - {a.operating_name} (Bal: ₹{a.current_balance})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Adjustment Type
                  </label>
                  <select
                    value={adjustmentForm.adjustmentType}
                    onChange={(e) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        adjustmentType: e.target.value as 'credit' | 'debit',
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="credit">Credit (+) Top-up</option>
                    <option value="debit">Debit (-) Deduction</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={adjustmentForm.amount}
                    onChange={(e) =>
                      setAdjustmentForm({ ...adjustmentForm, amount: Number(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Promotional deposit bonus, offline bank transfer..."
                  value={adjustmentForm.reason}
                  onChange={(e) =>
                    setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Internal audit remarks..."
                  value={adjustmentForm.notes}
                  onChange={(e) =>
                    setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjustment || !adjustmentForm.reason.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {submittingAdjustment ? 'Posting...' : 'Post Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
