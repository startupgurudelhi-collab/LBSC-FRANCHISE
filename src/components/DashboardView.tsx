import React from 'react';
import {
  Wallet,
  Megaphone,
  Users,
  Inbox,
  Briefcase,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  Contact,
  Plus,
} from 'lucide-react';
import type { CommissionBalance, Campaign, Lead, LeadOpportunity, ServiceMaster, User } from '../types';
import type { NavTab } from './Sidebar';

interface DashboardViewProps {
  currentUser: User | null;
  commission: CommissionBalance | null;
  campaigns: Campaign[];
  leads: Lead[];
  opportunities: LeadOpportunity[];
  services: ServiceMaster[];
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  commission,
  campaigns,
  leads,
  opportunities,
  services,
  onNavigate,
}) => {
  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const pendingOpps = opportunities.filter((o) => o.status === 'pending');
  const assignedLeadsToday = leads.filter((l) => {
    if (!l.assigned_at && !l.created_at) return false;
    const d = (l.assigned_at || l.created_at).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return d === today;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Welcome back, {currentUser?.firstName || 'Partner'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time operations overview for your franchise territory, active campaigns, leads, and commission ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors shadow-2xs"
          >
            <Contact className="w-3.5 h-3.5 text-indigo-600" />
            <span>Client Directory</span>
          </button>
          <button
            onClick={() => onNavigate('own-leads')}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors shadow-2xs"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
            <span>Own Lead Center (₹20)</span>
          </button>
          <button
            onClick={() => onNavigate('inbox')}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Lead Inbox ({pendingOpps.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Commission Balance */}
        <div
          onClick={() => onNavigate('commissions')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 hover:border-indigo-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Commission Balance</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            ₹{Number(commission?.current_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
            <span>Total earned: ₹{Number(commission?.total_credits || 0).toLocaleString('en-IN')}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </p>
        </div>

        {/* Active Campaigns */}
        <div
          onClick={() => onNavigate('campaigns')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 hover:border-indigo-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Campaigns</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">{activeCampaigns.length}</div>
          <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
            <span>₹100/day · Max 5 leads/day</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </p>
        </div>

        {/* Assigned Leads */}
        <div
          onClick={() => onNavigate('leads')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 hover:border-indigo-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">My Leads</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {leads.filter((l) => l.status === 'assigned').length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
            <span>Today's leads: {assignedLeadsToday.length}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </p>
        </div>

        {/* Pending Opportunities */}
        <div
          onClick={() => onNavigate('inbox')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 hover:border-amber-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Inbox</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">{pendingOpps.length}</div>
          <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
            <span className={pendingOpps.length > 0 ? 'text-amber-600 font-medium' : ''}>
              {pendingOpps.length > 0 ? '60-min window active' : 'All opportunities cleared'}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition-colors" />
          </p>
        </div>
      </div>

      {/* Two Column Layout: Pending Opportunities & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Opportunities Box */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Immediate Lead Opportunities</h3>
              </div>
              <button
                onClick={() => onNavigate('inbox')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                View Inbox
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {pendingOpps.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-semibold text-slate-700">No pending opportunities</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Matching incoming leads will appear here with an instant 1-hour window.
                  </p>
                </div>
              ) : (
                pendingOpps.slice(0, 3).map((opp) => (
                  <div key={opp.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{opp.customer_name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {opp.lead_number}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {opp.service_name || 'Service'} · {opp.city}, {opp.state}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('inbox')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      Accept
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Opportunities automatically re-distribute if unaccepted within 60 minutes.</span>
          </div>
        </div>

        {/* Active Campaigns Overview */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Active Territory Campaigns</h3>
              </div>
              <button
                onClick={() => onNavigate('campaigns')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Manage
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {activeCampaigns.length === 0 ? (
                <div className="py-8 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-semibold text-slate-700">No active campaigns running</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Start a campaign to start receiving targeted leads in your territory.
                  </p>
                </div>
              ) : (
                activeCampaigns.slice(0, 3).map((camp) => (
                  <div key={camp.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{camp.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {camp.city}, {camp.district} · {camp.service_name || 'Service'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700">
                        Active
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">₹100/day · max 5 leads</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Total Catalog Services: {services.length} available</span>
            <button
              onClick={() => onNavigate('services')}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Browse Catalog
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
