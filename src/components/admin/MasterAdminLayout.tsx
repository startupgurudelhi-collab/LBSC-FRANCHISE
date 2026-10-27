import React, { useState } from 'react';
import {
  Shield,
  LogOut,
  Menu,
  X,
  FileText,
  LifeBuoy,
  BookOpen,
  Sparkles,
  Share2,
} from 'lucide-react';
import { AdminSidebar, type AdminNavTab } from './AdminSidebar';
import { AdminDashboardView } from './AdminDashboardView';
import { AdminFranchisesView } from './AdminFranchisesView';
import { AdminFranchiseRequestsView } from './AdminFranchiseRequestsView';
import { AdminServicesView } from './AdminServicesView';
import { AdminCommissionsView } from './AdminCommissionsView';
import { AdminCampaignsView } from './AdminCampaignsView';
import { AdminLeadDirectoryView } from './AdminLeadDirectoryView';
import { AdminReportsView } from './AdminReportsView';
import { NetworkRevenueDashboardView } from './NetworkRevenueDashboardView';
import { AdminTicketsView } from './AdminTicketsView';
import { AdminKnowledgebaseView } from './AdminKnowledgebaseView';
import { AdminOffersView } from './AdminOffersView';
import { AdminMarketingView } from './AdminMarketingView';
import { AdminServiceApplicationsView } from './AdminServiceApplicationsView';
import { AdminWorkQueueView } from './AdminWorkQueueView';
import { AdminAdvertisementRequestsView } from './AdminAdvertisementRequestsView';
import { AdminJobOperationsView } from './AdminJobOperationsView';
import { NotificationBell } from '../notifications/NotificationBell';
import type { User } from '../../types';

interface MasterAdminLayoutProps {
  user: User;
  onLogout: () => void;
}

export const MasterAdminLayout: React.FC<MasterAdminLayoutProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AdminNavTab>('admin-dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderModulePlaceholder = (title: string, icon: React.ReactNode, description: string) => (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          Scheduled Module
        </span>
      </div>
      <p className="text-xs text-slate-500">{description}</p>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-12 text-center text-slate-400 space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
          {icon}
        </div>
        <h3 className="text-sm font-bold text-slate-900">{title} Architecture Ready</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          This administrative module is registered in the Super Admin routing registry and configured
          to integrate seamlessly with backend microservices in upcoming release phases.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans antialiased text-slate-800">
      {/* Mobile Top Navigation */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold text-xs">
            LB
          </div>
          <div>
            <span className="text-xs font-bold tracking-tight block">LBSC Master HQ</span>
            <span className="text-[10px] text-amber-400 font-medium">Super Admin</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell isAdmin={true} onNavigate={(tab) => setActiveTab(tab as AdminNavTab)} />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex">
          <div className="w-64 bg-slate-950 h-full p-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Navigation</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AdminSidebar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                setMobileMenuOpen(false);
              }}
              onLogout={onLogout}
              user={user}
            />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 shrink-0 bg-slate-950 border-r border-slate-900 min-h-screen">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <AdminSidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onLogout={onLogout}
            user={user}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Header Bar for Desktop */}
        <header className="hidden md:flex items-center justify-between px-8 py-3.5 bg-white border-b border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              ENVIRONMENT: PRODUCTION HQ
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">
              Legal & Business Services Network Control
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Super Admin In-App Notification Bell */}
            <NotificationBell isAdmin={true} onNavigate={(tab) => setActiveTab(tab as AdminNavTab)} />

            <div className="text-right">
              <p className="text-xs font-bold text-slate-900">
                {`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Super Administrator'}
              </p>
              <p className="text-[11px] text-amber-600 font-mono font-medium">{user.email}</p>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
              title="Sign Out of Master HQ"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Dynamic View Canvas */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'admin-dashboard' && <AdminDashboardView onNavigate={setActiveTab} />}
          {activeTab === 'admin-network-revenue' && <NetworkRevenueDashboardView />}
          {activeTab === 'admin-franchises' && <AdminFranchisesView />}
          {activeTab === 'admin-requests' && <AdminFranchiseRequestsView />}
          {activeTab === 'admin-services' && <AdminServicesView />}
          {activeTab === 'admin-service-applications' && <AdminServiceApplicationsView onNavigate={setActiveTab} />}
          {activeTab === 'admin-work-queue' && <AdminWorkQueueView user={user} />}
          {activeTab === 'admin-commissions' && <AdminCommissionsView />}
          {activeTab === 'admin-campaigns' && <AdminCampaignsView />}
          {activeTab === 'admin-advertisements' && <AdminAdvertisementRequestsView />}
          {activeTab === 'admin-leads' && <AdminLeadDirectoryView />}
          {activeTab === 'admin-reports' && <AdminReportsView />}
          {activeTab === 'admin-tickets' && <AdminTicketsView />}
          {activeTab === 'admin-jobs' && <AdminJobOperationsView />}
          {activeTab === 'admin-knowledgebase' && <AdminKnowledgebaseView />}
          {activeTab === 'admin-offers' && <AdminOffersView />}
          {activeTab === 'admin-marketing' && <AdminMarketingView />}
        </main>
      </div>
    </div>
  );
};
