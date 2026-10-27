import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Wallet,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Tag,
  Search,
  RefreshCw,
  Clock,
  ShieldCheck,
  Phone,
  AlertTriangle,
  FileText,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { CommissionBalance, OwnLead, LeadPurchase, ServiceMaster } from '../types';

interface OwnLeadCenterViewProps {
  commission: CommissionBalance | null;
  services: ServiceMaster[];
  onRefresh: () => void;
}

export const OwnLeadCenterView: React.FC<OwnLeadCenterViewProps> = ({
  commission,
  services,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'available' | 'history'>('available');
  const [leads, setLeads] = useState<OwnLead[]>([]);
  const [purchases, setPurchases] = useState<LeadPurchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [selectedLeadForBuy, setSelectedLeadForBuy] = useState<OwnLead | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  // Notification banners
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    referenceId?: string;
  } | null>(null);

  const currentBalance = Number(commission?.current_balance || 0);
  const zeroBalanceBuyCount = Number(commission?.zero_balance_buy_count || 0);
  const isBalanceZeroOrNegative = currentBalance <= 0;
  const remainingZeroAllowance = isBalanceZeroOrNegative
    ? Math.max(0, 3 - zeroBalanceBuyCount)
    : 3;
  const isPurchaseBlocked = isBalanceZeroOrNegative && remainingZeroAllowance <= 0;

  // Load available leads and purchase history
  const fetchOwnLeadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, purchasesRes] = await Promise.all([
        ApiClient.getAvailableBuyLeads({
          serviceId: selectedServiceId || undefined,
          city: selectedCity || undefined,
          search: searchQuery || undefined,
          limit: 100,
        }).catch(() => ({ data: [] })),
        ApiClient.getLeadPurchases({ limit: 100 }).catch(() => ({ data: [] })),
      ]);

      if (leadsRes?.data) setLeads(leadsRes.data);
      if (purchasesRes?.data) setPurchases(purchasesRes.data);
    } catch (err) {
      console.error('Failed to load Own Lead Center data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedServiceId, selectedCity, searchQuery]);

  useEffect(() => {
    fetchOwnLeadData();
  }, [fetchOwnLeadData]);

  // Execute buy lead action
  const handleConfirmBuy = async (lead: OwnLead) => {
    setBuyingId(lead.id);
    setActionFeedback(null);

    try {
      const res = await ApiClient.buyLead(lead.id);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          title: 'Lead Purchased Successfully',
          message: `Lead ${lead.lead_number} is now permanently assigned to your franchise for ₹${lead.price || 20}. Your balance has been updated.`,
          referenceId: res.data?.commission?.ledgerReferenceId,
        });
        setSelectedLeadForBuy(null);
        // Refresh parent commission balance and all app data
        onRefresh();
        // Re-fetch own lead pool and purchases
        await fetchOwnLeadData();
      } else {
        setActionFeedback({
          type: 'error',
          title: 'Purchase Failed',
          message: res.error?.message || 'Could not complete lead purchase. Please try again.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        title: 'Purchase Blocked',
        message:
          err.message ||
          'Failed to purchase lead. Please verify your balance and zero-balance allowance.',
      });
    } finally {
      setBuyingId(null);
    }
  };

  // Distinct cities from currently loaded leads for the filter dropdown
  const distinctCities = Array.from(new Set(leads.map((l) => l.city).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Top Banner & Balance Overview */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Own Lead Center</h2>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Phase 8
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Acquire exclusive, unassigned leads on-demand. Leads purchased from the Own Lead Center
              are permanently assigned to your franchise at a fixed fee of ₹20 per lead.
            </p>
          </div>

          {/* Quick Refresh Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchOwnLeadData();
                onRefresh();
              }}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{loading ? 'Refreshing...' : 'Refresh Leads'}</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
          {/* 1. Commission Balance */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Commission Balance</span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  currentBalance < 0
                    ? 'text-rose-600'
                    : currentBalance === 0
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  currentBalance < 0
                    ? 'bg-rose-100 text-rose-700'
                    : currentBalance === 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {currentBalance < 0
                  ? 'Negative Balance'
                  : currentBalance === 0
                  ? 'Zero Balance'
                  : 'Active Positive'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {currentBalance <= 0
                ? 'Negative balance allowed up to -₹60.00'
                : 'Auto-deducts ₹20 per purchased lead'}
            </p>
          </div>

          {/* 2. Zero-Balance Allowance */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Zero-Balance Allowance
              </span>
              <ShieldCheck
                className={`w-4 h-4 ${
                  isPurchaseBlocked ? 'text-rose-500' : 'text-indigo-600'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  isPurchaseBlocked
                    ? 'text-rose-600'
                    : remainingZeroAllowance === 1
                    ? 'text-amber-600'
                    : 'text-slate-900'
                }`}
              >
                {isBalanceZeroOrNegative ? `${remainingZeroAllowance} of 3` : '3 of 3'}
              </span>
              <span className="text-xs text-slate-500 font-medium">leads remaining</span>
            </div>

            {/* Allowance Visual Stepper */}
            <div className="mt-2.5 flex items-center gap-1.5">
              {[1, 2, 3].map((step) => {
                const isUsed = isBalanceZeroOrNegative && zeroBalanceBuyCount >= step;
                return (
                  <div
                    key={step}
                    className={`h-1.5 flex-1 rounded-full ${
                      isUsed
                        ? 'bg-rose-500'
                        : isBalanceZeroOrNegative
                        ? 'bg-amber-300'
                        : 'bg-emerald-400'
                    }`}
                    title={
                      step === 1
                        ? '1st: ₹0 to -₹20'
                        : step === 2
                        ? '2nd: -₹20 to -₹40'
                        : '3rd: -₹40 to -₹60'
                    }
                  />
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {isPurchaseBlocked
                ? 'Allowance exhausted. Top-up balance to positive to unlock.'
                : isBalanceZeroOrNegative
                ? `${zeroBalanceBuyCount}/3 used while balance is non-positive.`
                : 'Full 3-lead negative allowance available as buffer.'}
            </p>
          </div>

          {/* 3. Fixed Pricing & Total Available */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Fixed Lead Price</span>
              <Tag className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">₹20.00</span>
              <span className="text-xs text-slate-500 font-medium">per lead</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Available in pool: <strong className="text-slate-800">{leads.length}</strong> lead
              {leads.length === 1 ? '' : 's'} · Total purchased:{' '}
              <strong className="text-slate-800">{purchases.length}</strong>
            </p>
          </div>
        </div>

        {/* Warning Banner if blocked */}
        {isPurchaseBlocked && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold">Purchase Quota Reached for Zero/Negative Balance</p>
              <p className="text-rose-700 mt-0.5">
                Your franchise has utilized all 3 permitted Buy Leads while holding a non-positive
                balance (current balance: ₹{currentBalance.toFixed(2)}). Further purchases are
                temporarily blocked until your commission balance is restored to a positive amount.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-xs ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-xs font-bold">{actionFeedback.title}</p>
              <p className="text-xs mt-0.5 opacity-90">{actionFeedback.message}</p>
              {actionFeedback.referenceId && (
                <p className="text-[11px] font-mono mt-1 text-emerald-800">
                  Ledger Txn ID: {actionFeedback.referenceId}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs font-semibold hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveSubTab('available')}
            className={`pb-3 text-xs font-bold transition-colors relative ${
              activeSubTab === 'available'
                ? 'text-indigo-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Available Own Leads</span>
            <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-700">
              {leads.length}
            </span>
            {activeSubTab === 'available' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t" />
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`pb-3 text-xs font-bold transition-colors relative ${
              activeSubTab === 'history'
                ? 'text-indigo-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Purchase History</span>
            <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-700">
              {purchases.length}
            </span>
            {activeSubTab === 'history' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t" />
            )}
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SUB-TAB 1: AVAILABLE OWN LEADS */}
      {/* ============================================================== */}
      {activeSubTab === 'available' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by customer name, lead #, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500 text-slate-700"
              >
                <option value="">All Services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>

              {distinctCities.length > 0 && (
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500 text-slate-700"
                >
                  <option value="">All Locations</option>
                  {distinctCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              )}

              {(searchQuery || selectedServiceId || selectedCity) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedServiceId('');
                    setSelectedCity('');
                  }}
                  className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Leads Grid */}
          {leads.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
              <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Buyable Leads Available</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                All unassigned leads in this criteria have already been claimed or distributed. Check
                back soon or start a campaign for continuous lead flow.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leads.map((lead) => {
                const isBuyingThis = buyingId === lead.id;
                return (
                  <div
                    key={lead.id}
                    className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:border-indigo-200 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {lead.lead_number}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 mt-1">
                            {lead.customer_name}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            ₹{lead.price || 20}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5">Fixed Price</p>
                        </div>
                      </div>

                      {/* Service & Location Specs */}
                      <div className="space-y-2 py-3 border-y border-slate-100 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800">
                            {lead.service_name || 'Standard Service'}
                          </span>
                          {lead.service_code && (
                            <span className="text-[10px] text-slate-400">({lead.service_code})</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {lead.city}, {lead.district || lead.state}
                          </span>
                        </div>

                        {lead.service_fee !== undefined && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                            <span>Service Fee Value:</span>
                            <span className="font-semibold text-slate-700">
                              ₹{Number(lead.service_fee).toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Lead Metadata */}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(lead.created_at).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span className="text-emerald-600 font-medium">Ready for immediate pickup</span>
                      </div>
                    </div>

                    {/* Buy Lead Action Button */}
                    <div className="mt-5 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => setSelectedLeadForBuy(lead)}
                        disabled={isPurchaseBlocked || isBuyingThis}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs ${
                          isPurchaseBlocked
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {isBuyingThis ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Processing Purchase...</span>
                          </>
                        ) : isPurchaseBlocked ? (
                          <span>Allowance Exhausted</span>
                        ) : (
                          <>
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Buy Lead for ₹{lead.price || 20}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 2: PURCHASE HISTORY */}
      {/* ============================================================== */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Lead Purchases Log</h3>
              <p className="text-xs text-slate-500">
                Immutable audit ledger of all leads purchased from the Own Lead Center.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              Total: {purchases.length}
            </span>
          </div>

          {purchases.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-800">No Purchase Records Found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                You have not purchased any leads from the Own Lead Center yet. Browse the Available
                Leads tab to claim exclusive leads for ₹20 each.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Purchased At</th>
                    <th className="py-3 px-4">Lead Number</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Service & Location</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Commission Impact</th>
                    <th className="py-3 px-4">Ledger Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {new Date(p.purchased_at).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                          {p.lead_number || 'Lead'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900">{p.customer_name || 'Customer'}</p>
                        {p.customer_phone && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {p.customer_phone}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-800">{p.service_name || 'Service'}</p>
                        <p className="text-[11px] text-slate-500">
                          {p.city ? `${p.city}, ${p.district || p.state}` : 'Location'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        ₹{Number(p.price).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-slate-500">
                            ₹{Number(p.balance_before).toFixed(2)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span
                            className={`font-semibold ${
                              p.balance_after < 0 ? 'text-rose-600' : 'text-slate-800'
                            }`}
                          >
                            ₹{Number(p.balance_after).toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[10px] text-slate-500 select-all">
                          {p.ledger_reference_id}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* BUY CONFIRMATION MODAL */}
      {/* ============================================================== */}
      {selectedLeadForBuy && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Confirm Lead Purchase</h3>
              </div>
              <button
                onClick={() => setSelectedLeadForBuy(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Lead Number:</span>
                  <span className="font-mono">{selectedLeadForBuy.lead_number}</span>
                </div>
                <div className="flex justify-between mt-1 text-slate-600">
                  <span>Customer Name:</span>
                  <span>{selectedLeadForBuy.customer_name}</span>
                </div>
                <div className="flex justify-between mt-1 text-slate-600">
                  <span>Service:</span>
                  <span>{selectedLeadForBuy.service_name}</span>
                </div>
                <div className="flex justify-between mt-1 text-slate-600">
                  <span>Location:</span>
                  <span>
                    {selectedLeadForBuy.city}, {selectedLeadForBuy.state}
                  </span>
                </div>
              </div>

              {/* Cost & Balance Impact Breakdown */}
              <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-700">
                  <span>Buy Lead Price:</span>
                  <span className="font-bold text-indigo-700">₹{selectedLeadForBuy.price || 20}.00</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Current Balance:</span>
                  <span>₹{currentBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-800 font-semibold pt-1 border-t border-indigo-100">
                  <span>Estimated Balance After:</span>
                  <span
                    className={
                      currentBalance - (selectedLeadForBuy.price || 20) < 0 ? 'text-rose-600' : ''
                    }
                  >
                    ₹{(currentBalance - (selectedLeadForBuy.price || 20)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Zero-balance notice if applicable */}
              {isBalanceZeroOrNegative && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                  <p className="font-semibold">Zero-Balance Quota Notice</p>
                  <p className="mt-0.5">
                    Your balance is currently non-positive. This purchase will use 1 of your{' '}
                    {remainingZeroAllowance} remaining allowance slots.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedLeadForBuy(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmBuy(selectedLeadForBuy)}
                disabled={buyingId !== null}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                {buyingId !== null ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm & Deduct ₹{selectedLeadForBuy.price || 20}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
