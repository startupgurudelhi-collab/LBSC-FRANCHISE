import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ApiClient } from './api';
import type {
  User,
  CommissionBalance,
  LedgerEntry,
  Campaign,
  Lead,
  LeadOpportunity,
  ServiceMaster,
  ServiceCategory,
  FranchiseProfile,
  Client,
} from './types';
import { Sidebar, type NavTab } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { LeadInboxView } from './components/LeadInboxView';
import { LeadsView } from './components/LeadsView';
import { OwnLeadCenterView } from './components/OwnLeadCenterView';
import { ClientDirectoryView } from './components/ClientDirectoryView';
import { ServicesView } from './components/ServicesView';
import { CampaignsView } from './components/CampaignsView';
import { CommissionLedgerView } from './components/CommissionLedgerView';
import { SettlementStatementView } from './components/SettlementStatementView';
import { TicketsView } from './components/TicketsView';
import { KnowledgebaseView } from './components/KnowledgebaseView';
import { OffersView } from './components/OffersView';
import { MarketingView } from './components/MarketingView';
import { ServiceApplicationsView } from './components/ServiceApplicationsView';
import { AdvertisementRequestsView } from './components/AdvertisementRequestsView';
import { ProfileView } from './components/ProfileView';
import { MasterAdminLayout } from './components/admin/MasterAdminLayout';
import { NotificationBell } from './components/notifications/NotificationBell';
import {
  RefreshCw,
  Inbox,
  Wallet,
  Users,
  CheckCircle2,
  Clock,
  ChevronRight,
  X,
  Building2,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // Application Data States
  const [commission, setCommission] = useState<CommissionBalance | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<LeadOpportunity[]>([]);
  const [services, setServices] = useState<ServiceMaster[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [franchiseProfile, setFranchiseProfile] = useState<FranchiseProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Restore authenticated session on mount
  useEffect(() => {
    const token = ApiClient.getToken();
    if (token) {
      ApiClient.getProfile()
        .then((res) => {
          if (res.success && res.data?.user) {
            setCurrentUser(res.data.user);
          } else if (res.success && res.data && !res.data.user) {
            setCurrentUser(res.data);
          } else {
            ApiClient.setToken(null);
          }
        })
        .catch(() => {
          ApiClient.setToken(null);
        })
        .finally(() => {
          setLoadingUser(false);
        });
    } else {
      setLoadingUser(false);
    }
  }, []);

  // Fetch all domain data for active franchise session
  const fetchAllData = useCallback(async () => {
    if (!currentUser) return;
    setRefreshing(true);

    try {
      const orgId = currentUser.organizationId || undefined;

      // Parallel data gathering scoped strictly to franchise
      const promises: Promise<any>[] = [
        // 1. Services
        ApiClient.getServices().catch(() => ({ data: [] })),
        // 2. Categories
        ApiClient.getCategories().catch(() => ({ data: [] })),
        // 3. Franchise Campaigns
        ApiClient.getCampaigns({ organizationId: orgId }).catch(() => ({ data: [] })),
        // 4. Franchise Assigned Leads
        ApiClient.getLeads().catch(() => ({ data: [] })),
        // 5. Franchise Clients
        ApiClient.getClients({ limit: 100 }).catch(() => ({ data: [] })),
      ];

      if (orgId) {
        promises.push(
          ApiClient.getCommissionBalance(orgId).catch(() => ({ data: null })),
          ApiClient.getCommissionLedger({ organizationId: orgId, limit: 50 }).catch(() => ({ data: [] })),
          ApiClient.getOpportunities('all').catch(() => ({ data: [] })),
          ApiClient.getFranchiseProfile(orgId).catch(() => ({ data: null }))
        );
      } else {
        promises.push(
          Promise.resolve({ data: null }),
          Promise.resolve({ data: [] }),
          ApiClient.getOpportunities('all').catch(() => ({ data: [] })),
          Promise.resolve({ data: null })
        );
      }

      const [
        servicesRes,
        categoriesRes,
        campaignsRes,
        leadsRes,
        clientsRes,
        balanceRes,
        ledgerRes,
        oppsRes,
        profileRes,
      ] = await Promise.all(promises);

      if (servicesRes?.data) setServices(servicesRes.data);
      if (categoriesRes?.data) setCategories(categoriesRes.data);
      if (campaignsRes?.data) setCampaigns(campaignsRes.data);
      if (leadsRes?.data) setLeads(leadsRes.data);
      if (clientsRes?.data) setClients(clientsRes.data);
      if (balanceRes?.data) setCommission(balanceRes.data);
      if (ledgerRes?.data) setLedgerEntries(ledgerRes.data);
      if (oppsRes?.data) setOpportunities(oppsRes.data);
      if (profileRes?.data) setFranchiseProfile(profileRes.data);
    } catch (err) {
      console.error('Error fetching franchise portal data:', err);
    } finally {
      setRefreshing(false);
    }
  }, [currentUser]);

  const isSuperAdmin = Boolean(
    currentUser?.roles?.includes('super_admin') ||
    (currentUser as any)?.role === 'super_admin' ||
    currentUser?.email === 'admin@lbsc.internal'
  );

  useEffect(() => {
    if (currentUser && !isSuperAdmin) {
      fetchAllData();
    }
  }, [currentUser, isSuperAdmin, fetchAllData]);

  const handleLoginSuccess = (user: User, token: string) => {
    setCurrentUser(user);
    setCurrentTab('dashboard');
  };

  const handleLogout = () => {
    ApiClient.setToken(null);
    setCurrentUser(null);
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading LBSC Portal...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Super Admin view is routed directly to the Master Admin Panel
  if (isSuperAdmin) {
    return <MasterAdminLayout user={currentUser} onLogout={handleLogout} />;
  }

  const pendingOpps = opportunities.filter((o) => o.status === 'pending');
  const pendingOppsCount = pendingOpps.length;
  const recentAssignedLeads = leads.slice(0, 3);
  const recentLedger = ledgerEntries.slice(0, 3);
  const totalNotifications = pendingOppsCount + (recentAssignedLeads.length > 0 ? 1 : 0);

  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Franchise Operations Dashboard';
      case 'leads':
        return 'My Leads';
      case 'inbox':
        return 'Lead Opportunity Inbox';
      case 'own-leads':
        return 'Own Lead Center & Marketplace';
      case 'clients':
        return 'Client Directory';
      case 'services':
        return 'Services Catalog';
      case 'campaigns':
        return 'Territory Campaigns';
      case 'commissions':
        return 'Commission Ledger';
      case 'settlement-statement':
        return 'Franchise Settlement Statement';
      case 'tickets':
        return 'Support & Helpdesk Tickets';
      case 'knowledgebase':
        return 'Central Knowledgebase & SOPs';
      case 'offers':
        return 'Promotional Offers & Schemes';
      case 'marketing':
        return 'Marketing Collateral & Promotional Assets';
      case 'profile':
        return 'Franchise & Account Profile';
      default:
        return 'Franchise Portal';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 flex font-sans antialiased text-slate-900">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        pendingOpportunitiesCount={pendingOppsCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
              {getTabTitle()}
            </h2>
            {franchiseProfile?.operating_name && (
              <span className="hidden sm:inline-flex text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                {franchiseProfile.operating_name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 relative">
            <button
              onClick={fetchAllData}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{refreshing ? 'Syncing...' : 'Sync'}</span>
            </button>

            {/* Real In-App Notification Bell & Panel (Phase 18B) */}
            <NotificationBell onNavigate={(tab) => setCurrentTab(tab as NavTab)} isAdmin={false} />
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              commission={commission}
              campaigns={campaigns}
              leads={leads}
              opportunities={opportunities}
              services={services}
              onNavigate={setCurrentTab}
              onRefresh={fetchAllData}
            />
          )}

          {currentTab === 'leads' && (
            <LeadsView
              leads={leads}
              services={services}
              onRefresh={fetchAllData}
              onNavigateToClients={() => setCurrentTab('clients')}
            />
          )}

          {currentTab === 'inbox' && (
            <LeadInboxView opportunities={opportunities} onRefresh={fetchAllData} />
          )}

          {currentTab === 'own-leads' && (
            <OwnLeadCenterView
              commission={commission}
              services={services}
              onRefresh={fetchAllData}
            />
          )}

          {currentTab === 'clients' && (
            <ClientDirectoryView
              leads={leads}
              onRefreshParent={fetchAllData}
              onNavigateToLeads={() => setCurrentTab('leads')}
            />
          )}

          {currentTab === 'services' && (
            <ServicesView
              services={services}
              categories={categories}
              clients={clients}
              onRefresh={fetchAllData}
              onNavigateToClients={() => setCurrentTab('clients')}
            />
          )}

          {currentTab === 'service-applications' && (
            <ServiceApplicationsView
              onRefreshParent={fetchAllData}
              onNavigateToClients={() => setCurrentTab('clients')}
            />
          )}

          {currentTab === 'advertisement-requests' && (
            <AdvertisementRequestsView />
          )}

          {currentTab === 'campaigns' && (
            <CampaignsView campaigns={campaigns} services={services} onRefresh={fetchAllData} />
          )}

          {currentTab === 'commissions' && (
            <CommissionLedgerView
              balance={commission}
              entries={ledgerEntries}
              onRefresh={fetchAllData}
            />
          )}

          {currentTab === 'settlement-statement' && (
            <SettlementStatementView isAdmin={false} />
          )}

          {currentTab === 'tickets' && (
            <TicketsView onRefreshParent={fetchAllData} />
          )}

          {currentTab === 'knowledgebase' && (
            <KnowledgebaseView />
          )}

          {currentTab === 'offers' && (
            <OffersView />
          )}

          {currentTab === 'marketing' && (
            <MarketingView />
          )}

          {currentTab === 'profile' && (
            <ProfileView user={currentUser} franchiseProfile={franchiseProfile} />
          )}
        </main>
      </div>
    </div>
  );
}
