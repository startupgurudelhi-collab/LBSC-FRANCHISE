import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Wallet,
  Megaphone,
  Users,
  Inbox,
  ShoppingBag,
  User,
  LogOut,
  ShieldCheck,
  Contact,
  CheckCircle2,
  LifeBuoy,
  BookOpen,
  Tag,
  Share2,
  FileCheck,
  Tv,
  Receipt,
} from 'lucide-react';
import type { User as AuthUser } from '../types';

export type NavTab =
  | 'dashboard'
  | 'leads'
  | 'inbox'
  | 'own-leads'
  | 'clients'
  | 'services'
  | 'service-applications'
  | 'advertisement-requests'
  | 'campaigns'
  | 'commissions'
  | 'settlement-statement'
  | 'tickets'
  | 'knowledgebase'
  | 'offers'
  | 'marketing'
  | 'profile';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  pendingOpportunitiesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onLogout,
  pendingOpportunitiesCount = 0,
}) => {
  const isOwner = currentUser?.roles.includes('franchise_owner');
  const roleLabel = isOwner ? 'Franchise Owner' : 'Franchise Staff';

  const navItems: { id: NavTab; label: string; icon: any; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'My Leads', icon: Users },
    { id: 'inbox', label: 'Lead Inbox', icon: Inbox, badge: pendingOpportunitiesCount },
    { id: 'own-leads', label: 'Own Lead Center', icon: ShoppingBag },
    { id: 'clients', label: 'Client Directory', icon: Contact },
    { id: 'services', label: 'Services Catalog', icon: Briefcase },
    { id: 'service-applications', label: 'Applied Services', icon: FileCheck },
    { id: 'advertisement-requests', label: 'Ad Requests', icon: Tv },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
    { id: 'commissions', label: 'Commission Ledger', icon: Wallet },
    { id: 'settlement-statement', label: 'Settlement Statement', icon: Receipt },
    { id: 'tickets', label: 'Support Tickets', icon: LifeBuoy },
    { id: 'knowledgebase', label: 'Knowledgebase', icon: BookOpen },
    { id: 'offers', label: 'Offers', icon: Tag },
    { id: 'marketing', label: 'Marketing Material', icon: Share2 },
    { id: 'profile', label: 'Franchise / Profile', icon: Building2 },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-100">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm font-bold text-sm">
            LB
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">LBSC Portal</h1>
            <p className="text-[11px] text-indigo-600 font-medium">Franchise Operations</p>
          </div>
        </div>

        {/* Franchise Partner Scope Banner */}
        <div className="mx-3 my-3 p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {currentUser?.firstName} {currentUser?.lastName}
              </p>
              <p className="text-[10px] text-slate-500 truncate capitalize font-medium">
                {roleLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="px-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Logout */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
