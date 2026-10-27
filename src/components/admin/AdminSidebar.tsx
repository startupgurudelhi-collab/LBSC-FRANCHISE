import React from 'react';
import {
  LayoutDashboard,
  Building2,
  FileCheck2,
  Briefcase,
  Wallet,
  Megaphone,
  Users2,
  FileBarChart2,
  LifeBuoy,
  BookOpen,
  Tag,
  Share2,
  FileCheck,
  ClipboardList,
  LogOut,
  ShieldAlert,
  ArrowRightLeft,
  Tv,
  Cpu,
  TrendingUp,
} from 'lucide-react';
import type { User as AuthUser } from '../../types';

export type AdminNavTab =
  | 'admin-dashboard'
  | 'admin-network-revenue'
  | 'admin-franchises'
  | 'admin-requests'
  | 'admin-services'
  | 'admin-service-applications'
  | 'admin-work-queue'
  | 'admin-commissions'
  | 'admin-campaigns'
  | 'admin-advertisements'
  | 'admin-leads'
  | 'admin-reports'
  | 'admin-tickets'
  | 'admin-jobs'
  | 'admin-knowledgebase'
  | 'admin-offers'
  | 'admin-marketing';

interface AdminSidebarProps {
  currentTab?: AdminNavTab;
  activeTab?: AdminNavTab;
  onSelectTab: (tab: AdminNavTab) => void;
  currentUser?: AuthUser | null;
  user?: AuthUser | null;
  onLogout: () => void;
  pendingRequestsCount?: number;
  onSwitchToFranchisePortal?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  activeTab,
  onSelectTab,
  currentUser,
  user,
  onLogout,
  pendingRequestsCount = 0,
  onSwitchToFranchisePortal,
}) => {
  const selectedTab = activeTab || currentTab || 'admin-dashboard';
  const effectiveUser = user || currentUser;

  const primaryNavItems: { id: AdminNavTab; label: string; icon: any; badge?: number }[] = [
    { id: 'admin-dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
    { id: 'admin-network-revenue', label: 'Network Revenue', icon: TrendingUp },
    { id: 'admin-franchises', label: 'Franchise Management', icon: Building2 },
    { id: 'admin-requests', label: 'Franchise Requests', icon: FileCheck2, badge: pendingRequestsCount },
    { id: 'admin-services', label: 'Services Management', icon: Briefcase },
    { id: 'admin-service-applications', label: 'Applied Services', icon: FileCheck },
    { id: 'admin-work-queue', label: 'Work Queue', icon: ClipboardList },
    { id: 'admin-commissions', label: 'Commission Management', icon: Wallet },
    { id: 'admin-campaigns', label: 'Campaign Management', icon: Megaphone },
    { id: 'admin-advertisements', label: 'Ad Requests', icon: Tv },
    { id: 'admin-leads', label: 'Lead Directory', icon: Users2 },
    { id: 'admin-reports', label: 'Reports & Analytics', icon: FileBarChart2 },
    { id: 'admin-tickets', label: 'Support Tickets', icon: LifeBuoy },
    { id: 'admin-jobs', label: 'Job Operations', icon: Cpu },
  ];

  const modularFutureModules: { id: AdminNavTab; label: string; icon: any }[] = [
    { id: 'admin-knowledgebase', label: 'Knowledgebase', icon: BookOpen },
    { id: 'admin-offers', label: 'Offers Management', icon: Tag },
    { id: 'admin-marketing', label: 'Marketing Collateral', icon: Share2 },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 select-none">
      <div className="flex flex-col h-full overflow-hidden">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-sm font-bold text-xs tracking-wider">
              SA
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">LBSC Master</h1>
              <p className="text-[10px] text-amber-700 font-semibold tracking-wide uppercase">Super Admin HQ</p>
            </div>
          </div>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
            Root
          </span>
        </div>

        {/* Super Admin Status Card */}
        <div className="mx-3 my-3 p-2.5 bg-slate-900 text-white rounded-lg shadow-xs shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-amber-400 font-semibold text-xs shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser?.firstName} {currentUser?.lastName || 'Admin'}
              </p>
              <p className="text-[10px] text-slate-300 truncate font-mono">
                {currentUser?.email}
              </p>
            </div>
          </div>

          {onSwitchToFranchisePortal && (
            <button
              onClick={onSwitchToFranchisePortal}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded transition-colors"
              title="Preview the partner franchise operations portal"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Franchise Portal View</span>
            </button>
          )}
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
          {/* Core Master Admin Modules */}
          <div>
            <p className="px-3 pb-1 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              Core Modules
            </p>
            <nav className="space-y-0.5">
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = selectedTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-amber-400' : 'text-slate-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                          isActive
                            ? 'bg-amber-400 text-slate-900'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Modular Extended Modules (Upcoming) */}
          <div>
            <p className="px-3 pb-1 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              Upcoming Modules
            </p>
            <div className="space-y-0.5">
              {modularFutureModules.map((item) => {
                const Icon = item.icon;
                const isActive = selectedTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-[11px]">{item.label}</span>
                    </div>
                    <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-tight">
                      Modular
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer with Logout */}
        <div className="p-3 border-t border-slate-100 shrink-0 bg-slate-50/50">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out Authority</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
