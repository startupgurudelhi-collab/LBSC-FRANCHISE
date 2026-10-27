import React, { useState } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Calendar,
  CreditCard,
  ShieldCheck,
  Building2,
  Receipt,
} from 'lucide-react';
import type { CommissionBalance, LedgerEntry } from '../types';
import { SettlementStatementView } from './SettlementStatementView';

interface CommissionLedgerViewProps {
  balance: CommissionBalance | null;
  entries: LedgerEntry[];
  onRefresh: () => void;
}

export const CommissionLedgerView: React.FC<CommissionLedgerViewProps> = ({
  balance,
  entries,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'settlement'>('ledger');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');

  const filteredEntries = entries.filter((e) => {
    if (filterType === 'all') return true;
    return e.entry_type === filterType;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Commission & Settlement</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable double-entry balance, ledger transaction journal, and formal periodic settlement statements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle Buttons */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'ledger'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Ledger Journal</span>
            </button>

            <button
              onClick={() => setActiveTab('settlement')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'settlement'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Settlement Statement</span>
            </button>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg">
            <ShieldCheck className="w-4 h-4" />
            <span>Audited</span>
          </span>
        </div>
      </div>

      {/* Render Settlement Statement View (Phase 21B) */}
      {activeTab === 'settlement' && (
        <SettlementStatementView isAdmin={false} />
      )}

      {/* Render Standard Ledger View */}
      {activeTab === 'ledger' && (
        <>
          {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Balance</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            ₹{Number(balance?.current_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Available credit balance for payouts</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Credits (Earned)</span>
          <div className="text-2xl font-bold text-emerald-600 mt-2">
            +₹{Number(balance?.total_credits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">From service completions & adjustments</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Debits (Deductions)</span>
          <div className="text-2xl font-bold text-slate-700 mt-2">
            -₹{Number(balance?.total_debits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Daily campaign charges & payout transfers</p>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <CreditCard className="w-4 h-4 text-slate-400" />
            <span>Transaction Ledger Entries</span>
          </div>

          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            {(['all', 'credit', 'debit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-md capitalize transition-colors ${
                  filterType === t ? 'bg-white text-indigo-700 font-semibold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Reference ID</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    No transactions recorded in the ledger yet.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isCredit = entry.entry_type === 'credit';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-indigo-700">
                        {entry.reference_id}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            isCredit
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-800 font-medium">
                        {entry.category.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3 text-slate-600 max-w-xs truncate">
                        {entry.description}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono font-bold ${
                          isCredit ? 'text-emerald-600' : 'text-slate-800'
                        }`}
                      >
                        {isCredit ? '+' : '-'}₹
                        {Number(entry.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-900 font-semibold">
                        ₹{Number(entry.balance_after).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
