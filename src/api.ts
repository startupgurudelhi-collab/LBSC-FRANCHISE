const API_BASE = '/api/v1';

export class ApiClient {
  private static token: string | null = localStorage.getItem('lbsc_token');

  static setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('lbsc_token', token);
    } else {
      localStorage.removeItem('lbsc_token');
    }
  }

  static getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('lbsc_token');
    }
    return this.token;
  }

  static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || `Request failed with status ${response.status}`;
      const err = new Error(errorMsg) as any;
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  // Auth endpoints
  static async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  static async getProfile() {
    return this.request('/protected/profile');
  }

  // Franchises & Applications
  static async getApplications(params?: { status?: string; city?: string; district?: string; state?: string; pin?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.city) searchParams.append('city', params.city);
    if (params?.district) searchParams.append('district', params.district);
    if (params?.state) searchParams.append('state', params.state);
    if (params?.pin) searchParams.append('pin', params.pin);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/franchise/applications${qs}`);
  }

  static async getApplicationById(id: string) {
    return this.request(`/franchise/applications/${id}`);
  }

  static async getFranchises() {
    return this.request('/franchise/applications');
  }

  static async createApplication(data: any) {
    return this.request('/franchise/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async screenApplication(id: string, notes?: string) {
    return this.request(`/franchise/applications/${id}/screen`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  static async approveApplication(id: string) {
    return this.request(`/franchise/applications/${id}/approve`, {
      method: 'POST',
    });
  }

  static async rejectApplication(id: string, reason: string) {
    return this.request(`/franchise/applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  static async activateApplication(id: string) {
    return this.request(`/franchise/applications/${id}/activate`, {
      method: 'POST',
    });
  }

  static async deactivateFranchise(id: string, reason?: string) {
    return this.request(`/franchise/${id}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  static async getFranchiseProfile(orgId: string) {
    return this.request(`/franchise/profile/${orgId}`);
  }

  static async updateFranchiseProfile(orgId: string, data: any) {
    return this.request(`/franchise/profile/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Services
  static async getCategories() {
    return this.request('/services/categories');
  }

  static async createCategory(data: { code: string; name: string; description?: string; displayOrder?: number }) {
    return this.request('/services/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateCategory(id: string, data: { name?: string; description?: string; isActive?: boolean; displayOrder?: number }) {
    return this.request(`/services/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static async getServices(categoryId?: string) {
    const query = categoryId ? `?categoryId=${categoryId}` : '';
    return this.request(`/services${query}`);
  }

  static async createService(data: any) {
    return this.request('/services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateService(id: string, data: any) {
    return this.request(`/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static async setServiceStatus(id: string, isActive: boolean) {
    return this.request(`/services/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  // Commissions
  static async getCommissionAccounts() {
    return this.request('/commissions/accounts');
  }

  static async getCommissionBalance(organizationId?: string) {
    const query = organizationId ? `?organizationId=${organizationId}` : '';
    return this.request(`/commissions/balance${query}`);
  }

  static async getCommissionLedger(params?: {
    organizationId?: string;
    entryType?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.organizationId) searchParams.append('organizationId', params.organizationId);
    if (params?.entryType) searchParams.append('entryType', params.entryType);
    if (params?.category) searchParams.append('category', params.category);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/commissions/ledger${qs}`);
  }

  static async applyCommissionAdjustment(data: {
    organizationId: string;
    adjustmentType: 'credit' | 'debit';
    amount: number;
    reason: string;
    notes?: string;
  }) {
    return this.request('/commissions/adjustments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async getSettlementStatement(params?: {
    organizationId?: string;
    franchiseId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.organizationId) searchParams.append('organizationId', params.organizationId);
    if (params?.franchiseId) searchParams.append('franchiseId', params.franchiseId);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/commissions/settlement-statement${qs}`);
  }

  // Campaigns
  static async getCampaigns(params?: { organizationId?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.organizationId) searchParams.append('organizationId', params.organizationId);
    if (params?.status) searchParams.append('status', params.status);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/campaigns${qs}`);
  }

  static async createCampaign(data: any) {
    return this.request('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateCampaignStatus(id: string, status: 'active' | 'paused') {
    return this.request(`/campaigns/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  static async updateCampaignBudget(id: string, dailyBudget: number, totalBudget?: number) {
    return this.request(`/campaigns/${id}/budget`, {
      method: 'POST',
      body: JSON.stringify({ dailyBudget, totalBudget }),
    });
  }

  static async updateCampaign(id: string, data: any) {
    return this.request(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async pauseCampaign(id: string, reason?: string) {
    return this.request(`/campaigns/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'admin_pause' }),
    });
  }

  static async resumeCampaign(id: string) {
    return this.request(`/campaigns/${id}/resume`, {
      method: 'POST',
    });
  }

  static async processDailyCharges(date?: string) {
    return this.request('/campaigns/process-daily-charges', {
      method: 'POST',
      body: JSON.stringify(date ? { date } : {}),
    });
  }

  // Leads
  static async createLead(data: any) {
    return this.ingestLead(data);
  }
  static async getLeads(params?: {
    status?: string;
    serviceId?: string;
    city?: string;
    district?: string;
    state?: string;
    franchiseId?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.serviceId) searchParams.append('serviceId', params.serviceId);
    if (params?.city) searchParams.append('city', params.city);
    if (params?.district) searchParams.append('district', params.district);
    if (params?.state) searchParams.append('state', params.state);
    if (params?.franchiseId) searchParams.append('franchiseId', params.franchiseId);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/leads${qs}`);
  }

  static async processExpiredOpportunities() {
    return this.request('/leads/process-expired', {
      method: 'POST',
    });
  }

  static async getLeadById(id: string) {
    return this.request(`/leads/${id}`);
  }

  static async ingestLead(data: any) {
    return this.request('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Opportunities Inbox
  static async getOpportunities(status: 'pending' | 'accepted' | 'expired' | 'all' = 'pending') {
    return this.request(`/leads/opportunities?status=${status}`);
  }

  static async acceptOpportunity(opportunityId: string, notes?: string) {
    return this.request(`/leads/opportunities/${opportunityId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  static async releaseOpportunity(opportunityId: string) {
    return this.request(`/leads/opportunities/${opportunityId}/release`, {
      method: 'POST',
    });
  }

  // Own Lead Center & Buy Leads (Phase 8)
  static async getAvailableBuyLeads(params?: { serviceId?: string; city?: string; search?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.serviceId) searchParams.append('serviceId', params.serviceId);
    if (params?.city) searchParams.append('city', params.city);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/own-lead-center/available${qs}`);
  }

  static async getAvailableBuyLeadById(id: string) {
    return this.request(`/own-lead-center/available/${id}`);
  }

  static async buyLead(leadId: string) {
    return this.request(`/own-lead-center/leads/${leadId}/buy`, {
      method: 'POST',
    });
  }

  static async getLeadPurchases(params?: { franchiseId?: string; leadId?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.franchiseId) searchParams.append('franchiseId', params.franchiseId);
    if (params?.leadId) searchParams.append('leadId', params.leadId);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/own-lead-center/purchases${qs}`);
  }

  static async getOwnLeadCenterStats() {
    return this.request('/own-lead-center/admin/stats');
  }

  // Client Directory (Phase 9)
  static async getClients(params?: {
    franchiseId?: string;
    search?: string;
    city?: string;
    district?: string;
    state?: string;
    status?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.franchiseId) searchParams.append('franchiseId', params.franchiseId);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.city) searchParams.append('city', params.city);
    if (params?.district) searchParams.append('district', params.district);
    if (params?.state) searchParams.append('state', params.state);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.source) searchParams.append('source', params.source);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/clients${qs}`);
  }

  static async getClientById(id: string) {
    return this.request(`/clients/${id}`);
  }

  static async getClientStats(franchiseId?: string) {
    const qs = franchiseId ? `?franchiseId=${franchiseId}` : '';
    return this.request(`/clients/stats${qs}`);
  }

  static async createClient(clientData: any) {
    return this.request('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  }

  static async updateClient(id: string, clientData: any) {
    return this.request(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(clientData),
    });
  }

  static async linkLeadToClient(clientId: string, leadId: string) {
    return this.request(`/clients/${clientId}/link-lead/${leadId}`, {
      method: 'POST',
    });
  }

  // Phase 12B - Server-Side Reporting & Custom Reports
  private static buildReportQueryString(filters?: Record<string, any>): string {
    if (!filters) return '';
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '' && val !== 'all') {
        params.append(key, String(val));
      }
    });
    const str = params.toString();
    return str ? `?${str}` : '';
  }

  static async getNetworkRevenue(filters?: {
    startDate?: string;
    endDate?: string;
    district?: string;
    service?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (filters?.startDate) searchParams.append('startDate', filters.startDate);
    if (filters?.endDate) searchParams.append('endDate', filters.endDate);
    if (filters?.district) searchParams.append('district', filters.district);
    if (filters?.service) searchParams.append('service', filters.service);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/reports/network-revenue${qs}`);
  }

  static async getFranchiseSummaryReport(filters?: any) {
    const qs = this.buildReportQueryString(filters);
    return this.request(`/reports/franchise-summary${qs}`);
  }

  static async getLeadMetricsReport(filters?: any) {
    const qs = this.buildReportQueryString(filters);
    return this.request(`/reports/lead-metrics${qs}`);
  }

  static async getCommissionMetricsReport(filters?: any) {
    const qs = this.buildReportQueryString(filters);
    return this.request(`/reports/commission-metrics${qs}`);
  }

  static async getServiceMetricsReport(filters?: any) {
    const qs = this.buildReportQueryString(filters);
    return this.request(`/reports/service-metrics${qs}`);
  }

  static async getCustomReportSchema() {
    return this.request('/reports/custom/schema');
  }

  static async executeCustomReport(requestBody: any) {
    return this.request('/reports/custom', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  static async getSavedCustomReports() {
    return this.request('/reports/saved');
  }

  static async saveCustomReport(reportData: any) {
    return this.request('/reports/saved', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  }

  static async deleteSavedCustomReport(id: string) {
    return this.request(`/reports/saved/${id}`, {
      method: 'DELETE',
    });
  }

  // Support Tickets API (Phase 13A)
  static async getTickets(params?: {
    status?: string;
    priority?: string;
    category?: string;
    franchiseId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.priority) searchParams.append('priority', params.priority);
    if (params?.category) searchParams.append('category', params.category);
    if (params?.franchiseId) searchParams.append('franchiseId', params.franchiseId);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/tickets${qs}`);
  }

  static async getTicketStats(franchiseId?: string) {
    const qs = franchiseId ? `?franchiseId=${encodeURIComponent(franchiseId)}` : '';
    return this.request(`/tickets/stats${qs}`);
  }

  static async getTicketById(id: string) {
    return this.request(`/tickets/${id}`);
  }

  static async createTicket(data: {
    title: string;
    description: string;
    category: string;
    priority?: string;
    organizationId?: string;
  }) {
    return this.request('/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async addTicketMessage(id: string, data: { message: string; is_internal?: boolean }) {
    return this.request(`/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateTicketStatus(id: string, status: string) {
    return this.request(`/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  static async updateTicketPriority(id: string, priority: string) {
    return this.request(`/tickets/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority }),
    });
  }

  static async assignTicket(id: string, assignedToUserId: string | null) {
    return this.request(`/tickets/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedToUserId }),
    });
  }

  static async getTicketAssignees() {
    return this.request('/tickets/assignees');
  }

  // ==========================================
  // KNOWLEDGEBASE (PHASE 13B)
  // ==========================================

  static async getKbCategories() {
    return this.request('/knowledgebase/categories');
  }

  static async createKbCategory(data: {
    name: string;
    slug?: string;
    description?: string | null;
    icon?: string | null;
    display_order?: number;
    is_active?: boolean;
  }) {
    return this.request('/knowledgebase/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateKbCategory(id: string, data: {
    name?: string;
    slug?: string;
    description?: string | null;
    icon?: string | null;
    display_order?: number;
    is_active?: boolean;
  }) {
    return this.request(`/knowledgebase/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async deleteKbCategory(id: string) {
    return this.request(`/knowledgebase/categories/${id}`, {
      method: 'DELETE',
    });
  }

  static async getKbArticles(params?: {
    category_id?: string;
    category_slug?: string;
    status?: string;
    search?: string;
    tag?: string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.category_id) searchParams.append('category_id', params.category_id);
    if (params?.category_slug) searchParams.append('category_slug', params.category_slug);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.tag) searchParams.append('tag', params.tag);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/knowledgebase/articles${qs}`);
  }

  static async getKbStats() {
    return this.request('/knowledgebase/articles/stats');
  }

  static async getKbArticleById(idOrSlug: string) {
    return this.request(`/knowledgebase/articles/${idOrSlug}`);
  }

  static async createKbArticle(data: {
    category_id: string;
    title: string;
    slug?: string;
    summary: string;
    content: string;
    status?: 'draft' | 'published' | 'archived';
    tags?: string[] | string;
  }) {
    return this.request('/knowledgebase/articles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateKbArticle(id: string, data: {
    category_id?: string;
    title?: string;
    slug?: string;
    summary?: string;
    content?: string;
    status?: 'draft' | 'published' | 'archived';
    tags?: string[] | string;
  }) {
    return this.request(`/knowledgebase/articles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async deleteKbArticle(id: string) {
    return this.request(`/knowledgebase/articles/${id}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // OFFERS (PHASE 14A)
  // ==========================================

  static async getOffers(params?: {
    serviceId?: string;
    search?: string;
    isActive?: boolean | string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.serviceId) searchParams.append('service_id', params.serviceId);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.isActive !== undefined) searchParams.append('is_active', params.isActive.toString());
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/offers${qs}`);
  }

  static async getOfferById(id: string) {
    return this.request(`/offers/${id}`);
  }

  static async createOffer(data: {
    title: string;
    description?: string | null;
    start_date: string;
    end_date: string;
    is_active?: boolean;
    service_ids: string[];
  }) {
    return this.request('/offers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateOffer(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      start_date?: string;
      end_date?: string;
      is_active?: boolean;
      service_ids?: string[];
    }
  ) {
    return this.request(`/offers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async setOfferStatus(id: string, isActive: boolean) {
    return this.request(`/offers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  // ==========================================
  // MARKETING MATERIALS (PHASE 15A)
  // ==========================================

  static async getMarketingMaterials(params?: {
    serviceId?: string;
    materialType?: string;
    search?: string;
    isPublished?: boolean | string;
    isArchived?: boolean | string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.serviceId) searchParams.append('service_id', params.serviceId);
    if (params?.materialType) searchParams.append('material_type', params.materialType);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.isPublished !== undefined) searchParams.append('is_published', params.isPublished.toString());
    if (params?.isArchived !== undefined) searchParams.append('is_archived', params.isArchived.toString());
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/marketing-materials${qs}`);
  }

  static async getMarketingMaterialById(id: string) {
    return this.request(`/marketing-materials/${id}`);
  }

  static getMarketingMaterialDownloadUrl(id: string): string {
    const token = this.getToken();
    return `${API_BASE}/marketing-materials/${id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  static async createMarketingMaterial(data: {
    title: string;
    description?: string | null;
    material_type: string;
    file_name?: string | null;
    file_type?: string | null;
    file_size?: number | null;
    file_url?: string | null;
    file_data?: string | null;
    is_published?: boolean;
    service_ids: string[];
  }) {
    return this.request('/marketing-materials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateMarketingMaterial(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      material_type?: string;
      file_name?: string | null;
      file_type?: string | null;
      file_size?: number | null;
      file_url?: string | null;
      file_data?: string | null;
      is_published?: boolean;
      is_archived?: boolean;
      service_ids?: string[];
    }
  ) {
    return this.request(`/marketing-materials/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async setMarketingMaterialPublishStatus(id: string, isPublished: boolean) {
    return this.request(`/marketing-materials/${id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ is_published: isPublished }),
    });
  }

  static async setMarketingMaterialArchiveStatus(id: string, isArchived: boolean) {
    return this.request(`/marketing-materials/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: isArchived }),
    });
  }

  // ==========================================
  // SERVICE APPLICATIONS API (PHASE 15B)
  // ==========================================

  static async getServiceApplications(params: Record<string, any> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    });
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/service-applications${queryString}`);
  }

  static async getServiceApplicationById(id: string) {
    return this.request(`/service-applications/${id}`);
  }

  static async createServiceApplication(data: {
    client_id: string;
    service_id: string;
    franchise_id?: string;
    status?: 'DRAFT' | 'SUBMITTED';
    custom_fields?: Record<string, any> | null;
    notes?: string | null;
    priority?: string;
  }) {
    return this.request('/service-applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateServiceApplication(
    id: string,
    data: {
      custom_fields?: Record<string, any> | null;
      notes?: string | null;
      priority?: string;
    }
  ) {
    return this.request(`/service-applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async submitServiceApplication(id: string) {
    return this.request(`/service-applications/${id}/submit`, {
      method: 'POST',
    });
  }

  static async setServiceApplicationStatus(
    id: string,
    status: string,
    reason?: string | null
  ) {
    return this.request(`/service-applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    });
  }

  static async assignServiceApplication(
    id: string,
    data: {
      assigned_to_user_id: string;
      assignment_notes?: string | null;
      move_to_assigned_status?: boolean;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
    }
  ) {
    return this.request(`/service-applications/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async reassignServiceApplication(
    id: string,
    data: {
      assigned_to_user_id: string;
      reassignment_reason: string;
      notes?: string | null;
    }
  ) {
    return this.request(`/service-applications/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async getWorkQueueSummary() {
    return this.request('/service-applications/work-queue/summary');
  }

  static async getWorkQueue(params?: Record<string, any>) {
    const query = params
      ? `?${new URLSearchParams(
          Object.entries(params)
            .filter(([_, v]) => v !== undefined && v !== null && v !== 'ALL' && v !== 'all' && v !== '')
            .map(([k, v]) => [k, String(v)])
        ).toString()}`
      : '';
    return this.request(`/service-applications/work-queue${query}`);
  }

  static async getServiceApplicationAssignees() {
    return this.request('/service-applications/assignees');
  }

  static async getServiceApplicationWorkNotes(id: string) {
    return this.request(`/service-applications/${id}/work-notes`);
  }

  static async addServiceApplicationWorkNote(
    id: string,
    data: {
      note: string;
      is_internal?: boolean;
    }
  ) {
    return this.request(`/service-applications/${id}/work-notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async releaseServiceApplicationCommission(id: string) {
    return this.request(`/service-applications/${id}/release-commission`, {
      method: 'POST',
    });
  }

  static async uploadServiceApplicationDocument(
    id: string,
    docId: string,
    data: {
      file_name: string;
      file_type?: string | null;
      file_size?: number | null;
      file_url?: string | null;
      file_data?: string | null;
    }
  ) {
    return this.request(`/service-applications/${id}/documents/${docId}/upload`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async verifyServiceApplicationDocument(id: string, docId: string) {
    return this.request(`/service-applications/${id}/documents/${docId}/verify`, {
      method: 'PATCH',
    });
  }

  static async rejectServiceApplicationDocument(
    id: string,
    docId: string,
    rejectionReason: string
  ) {
    return this.request(`/service-applications/${id}/documents/${docId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason: rejectionReason }),
    });
  }

  static getServiceApplicationDocumentDownloadUrl(id: string, docId: string): string {
    return `/api/v1/service-applications/${id}/documents/${docId}/download`;
  }

  // ==========================================
  // EFILINGG INTEGRATION (PHASE 19A/B)
  // ==========================================

  static async getEfilinggStatus() {
    return this.request('/integrations/efilingg/status');
  }

  static async syncApplicationWithEfilingg(id: string) {
    return this.request(`/integrations/efilingg/sync/${id}`, {
      method: 'POST',
    });
  }

  static async updateFilingReferences(
    id: string,
    data: {
      arn_number?: string | null;
      srn_number?: string | null;
      challan_number?: string | null;
      efilingg_status?: string | null;
      notes?: string | null;
    }
  ) {
    return this.request(`/integrations/efilingg/references/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ==========================================
  // LEAD INTAKE GATEWAY (PHASE 20A/B)
  // ==========================================

  static async getLeadIntakeStatus() {
    return this.request('/integrations/lead-intake/status');
  }

  // ==========================================
  // ADVERTISEMENT REQUESTS (PHASE 17A/B)
  // ==========================================

  static async getAdvertisementRequests(params?: {
    franchise_id?: string;
    status?: string;
    advertising_type?: string;
    service_id?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.franchise_id) searchParams.append('franchise_id', params.franchise_id);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.advertising_type) searchParams.append('advertising_type', params.advertising_type);
    if (params?.service_id) searchParams.append('service_id', params.service_id);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.sort_by) searchParams.append('sort_by', params.sort_by);
    if (params?.sort_order) searchParams.append('sort_order', params.sort_order);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/advertisement-requests${qs}`);
  }

  static async getAdvertisementRequestSummary() {
    return this.request('/advertisement-requests/summary');
  }

  static async getAdvertisementRequestById(id: string) {
    return this.request(`/advertisement-requests/${id}`);
  }

  static async getAdvertisementRequestHistory(id: string) {
    return this.request(`/advertisement-requests/${id}/history`);
  }

  static async createAdvertisementRequest(data: {
    franchise_id?: string;
    title: string;
    description: string;
    advertising_type: string;
    service_id?: string | null;
    target_audience?: string | null;
    target_location?: string | null;
    preferred_timeline?: string | null;
    notes?: string | null;
    reference_details?: string | null;
  }) {
    return this.request('/advertisement-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async reviewAdvertisementRequest(id: string, notes?: string) {
    return this.request(`/advertisement-requests/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  static async approveAdvertisementRequest(id: string, admin_notes?: string) {
    return this.request(`/advertisement-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ admin_notes }),
    });
  }

  static async rejectAdvertisementRequest(id: string, rejection_reason: string, admin_notes?: string) {
    return this.request(`/advertisement-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason, admin_notes }),
    });
  }

  static async updateAdvertisementRequestStatus(
    id: string,
    status: 'UNDER_REVIEW' | 'IN_PROGRESS' | 'COMPLETED',
    notes?: string
  ) {
    return this.request(`/advertisement-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
  }

  static async addAdvertisementRequestAdminNote(id: string, note: string) {
    return this.request(`/advertisement-requests/${id}/admin-notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  // ==========================================
  // Notifications APIs (Phase 18)
  // ==========================================
  static async getNotifications(params?: { is_read?: boolean; type?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.is_read !== undefined) searchParams.append('is_read', String(params.is_read));
    if (params?.type) searchParams.append('type', params.type);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/notifications${qs}`);
  }

  static async getUnreadNotificationCount(): Promise<{ success: boolean; data: { unreadCount: number } }> {
    return this.request('/notifications/unread-count');
  }

  static async markNotificationAsRead(id: string): Promise<{ success: boolean; data: { marked: boolean } }> {
    return this.request(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }

  static async markAllNotificationsAsRead(): Promise<{ success: boolean; data: { markedCount: number } }> {
    return this.request('/notifications/mark-all-read', {
      method: 'POST',
    });
  }

  // ==========================================
  // Background Job Operations APIs (Phase 18 - Super Admin Only)
  // ==========================================
  static async triggerCampaignDailyChargesJob(targetDate?: string) {
    return this.request('/jobs/campaign-daily-charges', {
      method: 'POST',
      body: JSON.stringify({ targetDate }),
    });
  }

  static async triggerLeadOpportunityExpiryJob() {
    return this.request('/jobs/lead-opportunity-expiry', {
      method: 'POST',
    });
  }

  static async triggerServiceApplicationSlaJob() {
    return this.request('/jobs/service-application-sla', {
      method: 'POST',
    });
  }

  static async getJobHistory(params?: { job_name?: string; status?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.job_name) searchParams.append('job_name', params.job_name);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/jobs/history${qs}`);
  }

  static async getJobStatus() {
    return this.request('/jobs/status');
  }
}
