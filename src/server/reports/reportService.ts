import { getDatabase } from '../db/connection.js';
import type {
  ReportFilterCriteria,
  FranchiseSummaryReport,
  LeadMetricsReport,
  CommissionMetricsReport,
  ServiceMetricsReport,
  CustomReportDatasetSchema,
  CustomReportRequest,
  CustomReportResult,
  SavedCustomReportModel,
  NetworkRevenueReport,
  NetworkRevenueFilterCriteria,
} from './types.js';
import { BadRequestError } from '../errors/AppError.js';
import { AuditService } from '../audit/auditService.js';
import { randomUUID } from 'crypto';

export class ReportService {
  /**
   * Helper to normalize date boundaries
   */
  private static normalizeDateParams(startDate?: string, endDate?: string): { start?: string; end?: string } {
    let start: string | undefined;
    let end: string | undefined;

    if (startDate) {
      const cleaned = startDate.replace('T', ' ').replace('Z', '').split('.')[0];
      start = cleaned.includes(':') ? cleaned : `${cleaned} 00:00:00`;
    }
    if (endDate) {
      const cleaned = endDate.replace('T', ' ').replace('Z', '').split('.')[0];
      end = cleaned.includes(':') ? cleaned : `${cleaned} 23:59:59`;
    }
    return { start, end };
  }

  // ==========================================================================
  // 1. Franchise-wise Server-Side Report & Summary
  // ==========================================================================
  static async getFranchiseSummary(criteria: ReportFilterCriteria = {}): Promise<FranchiseSummaryReport> {
    const db = getDatabase();
    const { start, end } = this.normalizeDateParams(criteria.startDate, criteria.endDate);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (start) {
      conditions.push('fca.created_at >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push('fca.created_at <= ?');
      params.push(end);
    }
    if (criteria.franchise && criteria.franchise !== 'all') {
      conditions.push('(fca.organization_id = ? OR fp.franchise_code = ?)');
      params.push(criteria.franchise, criteria.franchise);
    }
    if (criteria.status && criteria.status !== 'all') {
      conditions.push('(LOWER(COALESCE(fp.status, fa.status, o.status)) = LOWER(?))');
      params.push(criteria.status);
    }
    if (criteria.city) {
      conditions.push("(LOWER(COALESCE(fp.city, fa.city, '')) LIKE LOWER(?))");
      params.push(`%${criteria.city}%`);
    }
    if (criteria.district) {
      conditions.push("(LOWER(COALESCE(fp.district, fa.district, '')) LIKE LOWER(?))");
      params.push(`%${criteria.district}%`);
    }
    if (criteria.state) {
      conditions.push("(LOWER(COALESCE(fp.state, fa.state, '')) LIKE LOWER(?))");
      params.push(`%${criteria.state}%`);
    }
    if (criteria.service && criteria.service !== 'all') {
      conditions.push(
        'EXISTS (SELECT 1 FROM franchise_campaigns fc_sub WHERE fc_sub.organization_id = fca.organization_id AND (fc_sub.service_id = ? OR fc_sub.service_id IN (SELECT id FROM service_masters WHERE code = ?)))'
      );
      params.push(criteria.service, criteria.service);
    }
    if (criteria.search) {
      const q = `%${criteria.search}%`;
      conditions.push(
        "(LOWER(COALESCE(fp.operating_name, fa.business_name, o.name)) LIKE LOWER(?) OR LOWER(COALESCE(fp.franchise_code, '')) LIKE LOWER(?) OR LOWER(COALESCE(fp.city, fa.city, '')) LIKE LOWER(?) OR LOWER(COALESCE(fp.district, fa.district, '')) LIKE LOWER(?))"
      );
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Aggregated KPIs
    const kpiQuery = `
      SELECT
        COUNT(DISTINCT fca.organization_id) as total,
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(fp.status, fa.status, o.status)) = 'active' OR fca.current_balance >= 0 THEN fca.organization_id END) as active,
        COALESCE(SUM(fca.current_balance), 0) as total_balance
      FROM franchise_commission_accounts fca
      JOIN organizations o ON fca.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = fca.organization_id
      LEFT JOIN franchise_applications fa ON fa.organization_id = fca.organization_id
      WHERE ${whereClause}
    `;
    const kpiRows = await db.query<any>(kpiQuery, params);
    const kpi = kpiRows[0] || { total: 0, active: 0, total_balance: 0 };

    // Active campaigns count within filtered franchises
    const campQuery = `
      SELECT COUNT(DISTINCT fc.id) as active_campaigns
      FROM franchise_campaigns fc
      WHERE fc.status = 'active'
        AND fc.organization_id IN (
          SELECT fca.organization_id
          FROM franchise_commission_accounts fca
          JOIN organizations o ON fca.organization_id = o.id
          LEFT JOIN franchise_profiles fp ON fp.organization_id = fca.organization_id
          LEFT JOIN franchise_applications fa ON fa.organization_id = fca.organization_id
          WHERE ${whereClause}
        )
    `;
    const campRows = await db.query<any>(campQuery, params);
    const activeCampaigns = campRows[0]?.active_campaigns || 0;

    // 2. Breakdown by State
    const stateQuery = `
      SELECT
        COALESCE(fp.state, fa.state, 'Tamil Nadu') as state,
        COUNT(DISTINCT fca.organization_id) as count,
        COALESCE(SUM(fca.current_balance), 0) as total_balance
      FROM franchise_commission_accounts fca
      JOIN organizations o ON fca.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = fca.organization_id
      LEFT JOIN franchise_applications fa ON fa.organization_id = fca.organization_id
      WHERE ${whereClause}
      GROUP BY COALESCE(fp.state, fa.state, 'Tamil Nadu')
      ORDER BY count DESC
    `;
    const stateRows = await db.query<any>(stateQuery, params);

    // 3. Breakdown by Status
    const statusQuery = `
      SELECT
        COALESCE(fp.status, fa.status, o.status, 'active') as status,
        COUNT(DISTINCT fca.organization_id) as count
      FROM franchise_commission_accounts fca
      JOIN organizations o ON fca.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = fca.organization_id
      LEFT JOIN franchise_applications fa ON fa.organization_id = fca.organization_id
      WHERE ${whereClause}
      GROUP BY COALESCE(fp.status, fa.status, o.status, 'active')
    `;
    const statusRows = await db.query<any>(statusQuery, params);

    // 4. Franchise Detailed Records
    const recordsQuery = `
      SELECT
        fca.organization_id as organizationId,
        COALESCE(fp.franchise_code, 'N/A') as franchiseCode,
        COALESCE(fp.operating_name, fa.business_name, o.name) as operatingName,
        COALESCE(fp.city, fa.city, '') as city,
        COALESCE(fp.district, fa.district, '') as district,
        COALESCE(fp.state, fa.state, 'Tamil Nadu') as state,
        COALESCE(fp.status, fa.status, o.status, 'active') as status,
        fca.current_balance as currentBalance,
        (SELECT COUNT(*) FROM franchise_campaigns fc WHERE fc.organization_id = fca.organization_id AND fc.status = 'active') as activeCampaignsCount,
        fca.created_at as createdAt
      FROM franchise_commission_accounts fca
      JOIN organizations o ON fca.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = fca.organization_id
      LEFT JOIN franchise_applications fa ON fa.organization_id = fca.organization_id
      WHERE ${whereClause}
      ORDER BY fca.current_balance DESC, operatingName ASC
    `;
    const records = await db.query<any>(recordsQuery, params);

    return {
      kpis: {
        total: Number(kpi.total) || 0,
        active: Number(kpi.active) || 0,
        totalBalance: Number(kpi.total_balance) || 0,
        activeCampaigns: Number(activeCampaigns) || 0,
      },
      breakdowns: {
        byState: stateRows.map((r) => ({
          state: String(r.state),
          count: Number(r.count) || 0,
          totalBalance: Number(r.total_balance) || 0,
        })),
        byStatus: statusRows.map((r) => ({
          status: String(r.status),
          count: Number(r.count) || 0,
        })),
      },
      records: records.map((r) => ({
        organizationId: r.organizationId,
        franchiseCode: r.franchiseCode,
        operatingName: r.operatingName,
        city: r.city,
        district: r.district,
        state: r.state,
        status: r.status,
        currentBalance: Number(r.currentBalance) || 0,
        activeCampaignsCount: Number(r.activeCampaignsCount) || 0,
        createdAt: r.createdAt,
      })),
    };
  }

  // ==========================================================================
  // 2. Lead Metrics Server-Side Report
  // ==========================================================================
  static async getLeadMetrics(criteria: ReportFilterCriteria = {}): Promise<LeadMetricsReport> {
    const db = getDatabase();
    const { start, end } = this.normalizeDateParams(criteria.startDate, criteria.endDate);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (start) {
      conditions.push('l.created_at >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push('l.created_at <= ?');
      params.push(end);
    }
    if (criteria.franchise && criteria.franchise !== 'all') {
      conditions.push('l.assigned_franchise_id = ?');
      params.push(criteria.franchise);
    }
    if (criteria.service && criteria.service !== 'all') {
      conditions.push('(l.service_id = ? OR sm.code = ?)');
      params.push(criteria.service, criteria.service);
    }
    if (criteria.status && criteria.status !== 'all') {
      conditions.push('LOWER(l.status) = LOWER(?)');
      params.push(criteria.status);
    }
    if (criteria.city) {
      conditions.push('LOWER(l.city) LIKE LOWER(?)');
      params.push(`%${criteria.city}%`);
    }
    if (criteria.district) {
      conditions.push('LOWER(l.district) LIKE LOWER(?)');
      params.push(`%${criteria.district}%`);
    }
    if (criteria.state) {
      conditions.push('LOWER(l.state) LIKE LOWER(?)');
      params.push(`%${criteria.state}%`);
    }
    if (criteria.search) {
      const q = `%${criteria.search}%`;
      conditions.push(
        "(LOWER(l.lead_number) LIKE LOWER(?) OR LOWER(l.customer_name) LIKE LOWER(?) OR LOWER(l.customer_phone) LIKE LOWER(?) OR LOWER(COALESCE(sm.name, '')) LIKE LOWER(?))"
      );
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Aggregated KPIs
    const kpiQuery = `
      SELECT
        COUNT(l.id) as total,
        COUNT(CASE WHEN l.status = 'offered' THEN 1 END) as offered,
        COUNT(CASE WHEN l.status = 'assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN l.status = 'own_lead_center' THEN 1 END) as own_lead_center,
        COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted,
        COUNT(CASE WHEN l.status IN ('rejected', 'expired') THEN 1 END) as closed,
        COALESCE(SUM(sm.service_fee), 0) as gross_value
      FROM leads l
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      WHERE ${whereClause}
    `;
    const kpiRows = await db.query<any>(kpiQuery, params);
    const kpi = kpiRows[0] || {
      total: 0,
      offered: 0,
      assigned: 0,
      own_lead_center: 0,
      converted: 0,
      closed: 0,
      gross_value: 0,
    };

    // 2. Breakdown by Status
    const statusQuery = `
      SELECT
        l.status,
        COUNT(l.id) as count,
        COALESCE(SUM(sm.service_fee), 0) as gross_value
      FROM leads l
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      WHERE ${whereClause}
      GROUP BY l.status
      ORDER BY count DESC
    `;
    const statusRows = await db.query<any>(statusQuery, params);

    // 3. Breakdown by Service
    const serviceQuery = `
      SELECT
        l.service_id as serviceId,
        COALESCE(sm.name, l.service_id) as serviceName,
        COUNT(l.id) as count,
        COALESCE(SUM(sm.service_fee), 0) as gross_value
      FROM leads l
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      WHERE ${whereClause}
      GROUP BY l.service_id, sm.name
      ORDER BY count DESC
    `;
    const serviceRows = await db.query<any>(serviceQuery, params);

    // 4. Breakdown by State & City
    const stateQuery = `
      SELECT l.state, COUNT(l.id) as count
      FROM leads l
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      WHERE ${whereClause}
      GROUP BY l.state
      ORDER BY count DESC
    `;
    const stateRows = await db.query<any>(stateQuery, params);

    const cityQuery = `
      SELECT l.city, COUNT(l.id) as count
      FROM leads l
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      WHERE ${whereClause}
      GROUP BY l.city
      ORDER BY count DESC
      LIMIT 10
    `;
    const cityRows = await db.query<any>(cityQuery, params);

    // 5. Records list
    const recordsQuery = `
      SELECT
        l.id,
        l.lead_number as leadNumber,
        l.customer_name as customerName,
        l.customer_phone as customerPhone,
        l.service_id as serviceId,
        COALESCE(sm.name, l.service_id) as serviceName,
        l.city,
        l.district,
        l.state,
        l.status,
        COALESCE(sm.service_fee, 0) as serviceFee,
        COALESCE(fp.operating_name, fa.business_name, o.name) as assignedFranchiseName,
        l.created_at as createdAt
      FROM leads l
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      LEFT JOIN organizations o ON l.assigned_franchise_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      WHERE ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT 200
    `;
    const records = await db.query<any>(recordsQuery, params);

    return {
      kpis: {
        total: Number(kpi.total) || 0,
        offered: Number(kpi.offered) || 0,
        assigned: Number(kpi.assigned) || 0,
        ownLeadCenter: Number(kpi.own_lead_center) || 0,
        converted: Number(kpi.converted) || 0,
        closed: Number(kpi.closed) || 0,
        grossValue: Number(kpi.gross_value) || 0,
      },
      breakdowns: {
        byStatus: statusRows.map((r) => ({
          status: String(r.status),
          count: Number(r.count) || 0,
          grossValue: Number(r.gross_value) || 0,
        })),
        byService: serviceRows.map((r) => ({
          serviceId: String(r.serviceId),
          serviceName: String(r.serviceName),
          count: Number(r.count) || 0,
          grossValue: Number(r.gross_value) || 0,
        })),
        byState: stateRows.map((r) => ({
          state: String(r.state || 'Tamil Nadu'),
          count: Number(r.count) || 0,
        })),
        byCity: cityRows.map((r) => ({
          city: String(r.city || 'Unknown'),
          count: Number(r.count) || 0,
        })),
      },
      records: records.map((r) => ({
        id: r.id,
        leadNumber: r.leadNumber,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        city: r.city,
        district: r.district,
        state: r.state,
        status: r.status,
        serviceFee: Number(r.serviceFee) || 0,
        assignedFranchiseName: r.assignedFranchiseName || 'Unassigned',
        createdAt: r.createdAt,
      })),
    };
  }

  // ==========================================================================
  // 3. Commission / Revenue Metrics Server-Side Report
  // ==========================================================================
  static async getCommissionMetrics(criteria: ReportFilterCriteria = {}): Promise<CommissionMetricsReport> {
    const db = getDatabase();
    const { start, end } = this.normalizeDateParams(criteria.startDate, criteria.endDate);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (start) {
      conditions.push('cle.created_at >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push('cle.created_at <= ?');
      params.push(end);
    }
    if (criteria.franchise && criteria.franchise !== 'all') {
      conditions.push('cle.organization_id = ?');
      params.push(criteria.franchise);
    }
    if (criteria.status && criteria.status !== 'all') {
      conditions.push('LOWER(cle.entry_type) = LOWER(?)');
      params.push(criteria.status);
    }
    if (criteria.city) {
      conditions.push("(LOWER(COALESCE(fp.city, fa.city, '')) LIKE LOWER(?))");
      params.push(`%${criteria.city}%`);
    }
    if (criteria.district) {
      conditions.push("(LOWER(COALESCE(fp.district, fa.district, '')) LIKE LOWER(?))");
      params.push(`%${criteria.district}%`);
    }
    if (criteria.state) {
      conditions.push("(LOWER(COALESCE(fp.state, fa.state, '')) LIKE LOWER(?))");
      params.push(`%${criteria.state}%`);
    }
    if (criteria.search) {
      const q = `%${criteria.search}%`;
      conditions.push(
        "(LOWER(cle.reference_id) LIKE LOWER(?) OR LOWER(COALESCE(cle.description, '')) LIKE LOWER(?) OR LOWER(cle.category) LIKE LOWER(?) OR LOWER(COALESCE(fp.operating_name, fa.business_name, o.name, '')) LIKE LOWER(?))"
      );
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Aggregated KPIs
    const kpiQuery = `
      SELECT
        COUNT(cle.id) as total_entries,
        COALESCE(SUM(CASE WHEN cle.entry_type = 'credit' THEN cle.amount ELSE 0 END), 0) as total_credits,
        COALESCE(SUM(CASE WHEN cle.entry_type = 'debit' THEN cle.amount ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN cle.entry_type = 'credit' THEN cle.amount ELSE -cle.amount END), 0) as net_balance
      FROM commission_ledger_entries cle
      JOIN organizations o ON cle.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      WHERE ${whereClause}
    `;
    const kpiRows = await db.query<any>(kpiQuery, params);
    const kpi = kpiRows[0] || {
      total_entries: 0,
      total_credits: 0,
      total_debits: 0,
      net_balance: 0,
    };

    // 2. Breakdown by Category
    const categoryQuery = `
      SELECT
        cle.category,
        cle.entry_type as entryType,
        COUNT(cle.id) as count,
        COALESCE(SUM(cle.amount), 0) as total_amount
      FROM commission_ledger_entries cle
      JOIN organizations o ON cle.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      WHERE ${whereClause}
      GROUP BY cle.category, cle.entry_type
      ORDER BY total_amount DESC
    `;
    const categoryRows = await db.query<any>(categoryQuery, params);

    // 3. Breakdown by Franchise
    const franchiseQuery = `
      SELECT
        cle.organization_id as organizationId,
        COALESCE(fp.operating_name, fa.business_name, o.name) as franchiseName,
        COALESCE(SUM(CASE WHEN cle.entry_type = 'credit' THEN cle.amount ELSE 0 END), 0) as credits,
        COALESCE(SUM(CASE WHEN cle.entry_type = 'debit' THEN cle.amount ELSE 0 END), 0) as debits
      FROM commission_ledger_entries cle
      JOIN organizations o ON cle.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      WHERE ${whereClause}
      GROUP BY cle.organization_id
      ORDER BY credits DESC
    `;
    const franchiseRows = await db.query<any>(franchiseQuery, params);

    // 4. Records List
    const recordsQuery = `
      SELECT
        cle.id,
        cle.organization_id as organizationId,
        COALESCE(fp.operating_name, fa.business_name, o.name) as franchiseName,
        cle.entry_type as entryType,
        cle.category,
        cle.amount,
        cle.balance_before as balanceBefore,
        cle.balance_after as balanceAfter,
        cle.reference_id as referenceId,
        COALESCE(cle.description, '') as description,
        cle.created_at as createdAt
      FROM commission_ledger_entries cle
      JOIN organizations o ON cle.organization_id = o.id
      LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
      LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      WHERE ${whereClause}
      ORDER BY cle.created_at DESC
      LIMIT 200
    `;
    const records = await db.query<any>(recordsQuery, params);

    return {
      kpis: {
        totalEntries: Number(kpi.total_entries) || 0,
        totalCredits: Number(kpi.total_credits) || 0,
        totalDebits: Number(kpi.total_debits) || 0,
        netBalance: Number(kpi.net_balance) || 0,
      },
      breakdowns: {
        byCategory: categoryRows.map((r) => ({
          category: String(r.category),
          entryType: String(r.entryType),
          count: Number(r.count) || 0,
          totalAmount: Number(r.total_amount) || 0,
        })),
        byFranchise: franchiseRows.map((r) => {
          const credits = Number(r.credits) || 0;
          const debits = Number(r.debits) || 0;
          return {
            organizationId: String(r.organizationId),
            franchiseName: String(r.franchiseName),
            credits,
            debits,
            net: credits - debits,
          };
        }),
      },
      records: records.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        franchiseName: r.franchiseName,
        entryType: r.entryType,
        category: r.category,
        amount: Number(r.amount) || 0,
        balanceBefore: Number(r.balanceBefore) || 0,
        balanceAfter: Number(r.balanceAfter) || 0,
        referenceId: r.referenceId,
        description: r.description,
        createdAt: r.createdAt,
      })),
    };
  }

  // ==========================================================================
  // 4. Applied Service Metrics Server-Side Report
  // ==========================================================================
  static async getServiceMetrics(criteria: ReportFilterCriteria = {}): Promise<ServiceMetricsReport> {
    const db = getDatabase();
    const { start, end } = this.normalizeDateParams(criteria.startDate, criteria.endDate);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (criteria.service && criteria.service !== 'all') {
      conditions.push('(sm.id = ? OR sm.code = ?)');
      params.push(criteria.service, criteria.service);
    }
    if (criteria.status && criteria.status !== 'all') {
      if (criteria.status === 'active') {
        conditions.push('sm.is_active = 1');
      } else if (criteria.status === 'inactive') {
        conditions.push('sm.is_active = 0');
      }
    }
    if (criteria.search) {
      const q = `%${criteria.search}%`;
      conditions.push(
        "(LOWER(sm.code) LIKE LOWER(?) OR LOWER(sm.name) LIKE LOWER(?) OR LOWER(COALESCE(sc.name, '')) LIKE LOWER(?))"
      );
      params.push(q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // Subquery condition for leads attached to services
    const leadConditions: string[] = ['1=1'];
    const leadParams: any[] = [];
    if (start) {
      leadConditions.push('l_sub.created_at >= ?');
      leadParams.push(start);
    }
    if (end) {
      leadConditions.push('l_sub.created_at <= ?');
      leadParams.push(end);
    }
    if (criteria.franchise && criteria.franchise !== 'all') {
      leadConditions.push('l_sub.assigned_franchise_id = ?');
      leadParams.push(criteria.franchise);
    }
    if (criteria.city) {
      leadConditions.push('LOWER(l_sub.city) LIKE LOWER(?)');
      leadParams.push(`%${criteria.city}%`);
    }
    if (criteria.district) {
      leadConditions.push('LOWER(l_sub.district) LIKE LOWER(?)');
      leadParams.push(`%${criteria.district}%`);
    }
    if (criteria.state) {
      leadConditions.push('LOWER(l_sub.state) LIKE LOWER(?)');
      leadParams.push(`%${criteria.state}%`);
    }
    const leadWhereClause = leadConditions.join(' AND ');

    // 1. Service Catalog KPIs
    const kpiQuery = `
      SELECT
        COUNT(DISTINCT sm.id) as total_catalog,
        COUNT(DISTINCT CASE WHEN sm.is_active = 1 THEN sm.id END) as active_services,
        COALESCE(AVG(sm.service_fee), 0) as avg_fee
      FROM service_masters sm
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE ${whereClause}
    `;
    const kpiRows = await db.query<any>(kpiQuery, params);
    const kpi = kpiRows[0] || { total_catalog: 0, active_services: 0, avg_fee: 0 };

    // Total demands and gross demand fee for services matching criteria
    const demandQuery = `
      SELECT
        COUNT(l_sub.id) as total_demands,
        COALESCE(SUM(sm_sub.service_fee), 0) as gross_demand_fee
      FROM leads l_sub
      JOIN service_masters sm_sub ON l_sub.service_id = sm_sub.id
      LEFT JOIN service_categories sc_sub ON sm_sub.category_id = sc_sub.id
      WHERE ${leadWhereClause}
        AND sm_sub.id IN (SELECT sm.id FROM service_masters sm LEFT JOIN service_categories sc ON sm.category_id = sc.id WHERE ${whereClause})
    `;
    const demandRows = await db.query<any>(demandQuery, [...leadParams, ...params]);
    const demand = demandRows[0] || { total_demands: 0, gross_demand_fee: 0 };

    // 2. Breakdown by Category
    const categoryQuery = `
      SELECT
        COALESCE(sc.name, 'General Services') as categoryName,
        COUNT(sm.id) as count,
        COUNT(CASE WHEN sm.is_active = 1 THEN 1 END) as activeCount
      FROM service_masters sm
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE ${whereClause}
      GROUP BY sc.name
      ORDER BY count DESC
    `;
    const categoryRows = await db.query<any>(categoryQuery, params);

    // 3. Breakdown & Records by Service
    const recordsQuery = `
      SELECT
        sm.id,
        sm.code,
        sm.name,
        COALESCE(sc.name, 'General Services') as categoryName,
        sm.service_fee as serviceFee,
        sm.commission_value as commissionValue,
        sm.is_active as isActive,
        (
          SELECT COUNT(*)
          FROM leads l_sub
          WHERE l_sub.service_id = sm.id AND ${leadWhereClause}
        ) as totalDemands,
        (
          SELECT COALESCE(SUM(sm.service_fee), 0)
          FROM leads l_sub
          WHERE l_sub.service_id = sm.id AND ${leadWhereClause}
        ) as demandRevenue
      FROM service_masters sm
      LEFT JOIN service_categories sc ON sm.category_id = sc.id
      WHERE ${whereClause}
      ORDER BY totalDemands DESC, sm.name ASC
    `;
    const records = await db.query<any>(recordsQuery, [...leadParams, ...leadParams, ...params]);

    return {
      kpis: {
        totalCatalog: Number(kpi.total_catalog) || 0,
        activeServices: Number(kpi.active_services) || 0,
        totalDemands: Number(demand.total_demands) || 0,
        grossDemandFee: Number(demand.gross_demand_fee) || 0,
        avgFee: Math.round(Number(kpi.avg_fee) || 0),
      },
      breakdowns: {
        byCategory: categoryRows.map((r) => ({
          categoryName: String(r.categoryName),
          count: Number(r.count) || 0,
          activeCount: Number(r.activeCount) || 0,
        })),
        byPopularity: records.map((r) => ({
          serviceId: r.id,
          code: r.code,
          name: r.name,
          demandCount: Number(r.totalDemands) || 0,
          demandRevenue: Number(r.demandRevenue) || 0,
        })),
      },
      records: records.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        categoryName: r.categoryName,
        serviceFee: Number(r.serviceFee) || 0,
        commissionValue: Number(r.commissionValue) || 0,
        isActive: Boolean(r.isActive),
        totalDemands: Number(r.totalDemands) || 0,
        demandRevenue: Number(r.demandRevenue) || 0,
      })),
    };
  }

  // ==========================================================================
  // Phase 21A: Network Revenue & Margin Server-Side Report
  // ==========================================================================
  static async getNetworkRevenue(
    criteria: NetworkRevenueFilterCriteria = {},
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<NetworkRevenueReport> {
    const db = getDatabase();
    const { start, end } = this.normalizeDateParams(criteria.startDate, criteria.endDate);

    // 1. Campaign Fee Inflow (₹100/day daily campaign charges)
    const campConditions: string[] = ["cle.category = 'campaign_daily_charge'", "cle.entry_type = 'debit'"];
    const campParams: any[] = [];

    if (start) {
      campConditions.push('cle.created_at >= ?');
      campParams.push(start);
    }
    if (end) {
      campConditions.push('cle.created_at <= ?');
      campParams.push(end);
    }
    if (criteria.district) {
      campConditions.push("LOWER(COALESCE(fc.district, '')) LIKE LOWER(?)");
      campParams.push(`%${criteria.district}%`);
    }
    if (criteria.service) {
      campConditions.push('(fc.service_id = ? OR sm.code = ? OR sm.id = ?)');
      campParams.push(criteria.service, criteria.service, criteria.service);
    }

    const campQuery = `
      SELECT 
        COALESCE(SUM(cle.amount), 0) as total_inflow,
        COUNT(cle.id) as total_count
      FROM commission_ledger_entries cle
      LEFT JOIN franchise_campaigns fc ON cle.external_reference = fc.id
      LEFT JOIN service_masters sm ON fc.service_id = sm.id
      WHERE ${campConditions.join(' AND ')}
    `;
    const campRows = await db.query<any>(campQuery, campParams);
    const campaignFeeInflow = Math.round(Number(campRows[0]?.total_inflow || 0) * 100) / 100;
    const campaignChargesCount = Number(campRows[0]?.total_count || 0);

    // 2. Buy Lead Inflow (₹20/lead Own Lead Center purchases)
    const buyConditions: string[] = ["cle.category = 'BUY_LEAD'", "cle.entry_type = 'debit'"];
    const buyParams: any[] = [];

    if (start) {
      buyConditions.push('cle.created_at >= ?');
      buyParams.push(start);
    }
    if (end) {
      buyConditions.push('cle.created_at <= ?');
      buyParams.push(end);
    }
    if (criteria.district) {
      buyConditions.push("LOWER(COALESCE(l.district, '')) LIKE LOWER(?)");
      buyParams.push(`%${criteria.district}%`);
    }
    if (criteria.service) {
      buyConditions.push('(l.service_id = ? OR sm.code = ? OR sm.id = ?)');
      buyParams.push(criteria.service, criteria.service, criteria.service);
    }

    const buyQuery = `
      SELECT 
        COALESCE(SUM(cle.amount), 0) as total_inflow,
        COUNT(cle.id) as total_count
      FROM commission_ledger_entries cle
      LEFT JOIN lead_purchases lp ON cle.id = lp.ledger_entry_id
      LEFT JOIN leads l ON (lp.lead_id = l.id OR cle.external_reference = l.lead_number)
      LEFT JOIN service_masters sm ON l.service_id = sm.id
      WHERE ${buyConditions.join(' AND ')}
    `;
    const buyRows = await db.query<any>(buyQuery, buyParams);
    const buyLeadInflow = Math.round(Number(buyRows[0]?.total_inflow || 0) * 100) / 100;
    const buyLeadCount = Number(buyRows[0]?.total_count || 0);

    // 3. Completed Service Applications, Service Fee Value, Released Commissions, Retained Margin
    const saConditions: string[] = ["LOWER(sa.status) = 'completed'"];
    const saParams: any[] = [];

    if (start) {
      saConditions.push('(sa.completed_at >= ? OR (sa.completed_at IS NULL AND sa.updated_at >= ?))');
      saParams.push(start, start);
    }
    if (end) {
      saConditions.push('(sa.completed_at <= ? OR (sa.completed_at IS NULL AND sa.updated_at <= ?))');
      saParams.push(end, end);
    }
    if (criteria.district) {
      saConditions.push("(LOWER(COALESCE(c.district, '')) LIKE LOWER(?) OR LOWER(COALESCE(fp.district, '')) LIKE LOWER(?))");
      saParams.push(`%${criteria.district}%`, `%${criteria.district}%`);
    }
    if (criteria.service) {
      saConditions.push('(sa.service_id = ? OR sm.code = ? OR sm.id = ?)');
      saParams.push(criteria.service, criteria.service, criteria.service);
    }

    const saQuery = `
      SELECT 
        COUNT(sa.id) as completed_count,
        COALESCE(SUM(sa.service_fee_snapshot), 0) as completed_service_fee_value,
        COALESCE(SUM(CASE WHEN sa.commission_status = 'RELEASED' THEN sa.commission_value_snapshot ELSE 0 END), 0) as released_commissions,
        COALESCE(SUM(CASE WHEN sa.commission_status = 'RELEASED' THEN (sa.service_fee_snapshot - sa.commission_value_snapshot) ELSE 0 END), 0) as retained_margin
      FROM service_applications sa
      LEFT JOIN service_masters sm ON sa.service_id = sm.id
      LEFT JOIN clients c ON sa.client_id = c.id
      LEFT JOIN franchise_profiles fp ON sa.franchise_id = fp.organization_id
      WHERE ${saConditions.join(' AND ')}
    `;
    const saRows = await db.query<any>(saQuery, saParams);
    const completedServiceCount = Number(saRows[0]?.completed_count || 0);
    const completedServiceFeeValue = Math.round(Number(saRows[0]?.completed_service_fee_value || 0) * 100) / 100;
    const releasedFranchiseCommissions = Math.round(Number(saRows[0]?.released_commissions || 0) * 100) / 100;
    const retainedServiceMargin = Math.round(Number(saRows[0]?.retained_margin || 0) * 100) / 100;

    const totalPlatformInflow = Math.round((campaignFeeInflow + buyLeadInflow) * 100) / 100;
    const totalNetPlatformMargin = Math.round((campaignFeeInflow + buyLeadInflow + retainedServiceMargin) * 100) / 100;
    const retainedMarginPercentage =
      completedServiceFeeValue > 0
        ? Math.round((retainedServiceMargin / completedServiceFeeValue) * 10000) / 100
        : 0;

    // 4. Breakdown by Service
    const services = await db.query<any>(`
      SELECT id, code, name FROM service_masters ORDER BY name ASC
    `);

    const serviceBreakdowns = [];
    for (const svc of services) {
      if (criteria.service && criteria.service !== svc.id && criteria.service !== svc.code) {
        continue;
      }

      // Camp fee for this service
      const svcCampRows = await db.query<any>(
        `
        SELECT COALESCE(SUM(cle.amount), 0) as inflow
        FROM commission_ledger_entries cle
        JOIN franchise_campaigns fc ON cle.external_reference = fc.id
        WHERE cle.category = 'campaign_daily_charge' AND cle.entry_type = 'debit'
          AND fc.service_id = ?
          ${start ? 'AND cle.created_at >= ?' : ''}
          ${end ? 'AND cle.created_at <= ?' : ''}
          ${criteria.district ? "AND LOWER(COALESCE(fc.district, '')) LIKE LOWER(?)" : ''}
      `,
        [
          svc.id,
          ...(start ? [start] : []),
          ...(end ? [end] : []),
          ...(criteria.district ? [`%${criteria.district}%`] : []),
        ]
      );

      // Buy lead fee for this service
      const svcBuyRows = await db.query<any>(
        `
        SELECT COALESCE(SUM(cle.amount), 0) as inflow
        FROM commission_ledger_entries cle
        LEFT JOIN lead_purchases lp ON cle.id = lp.ledger_entry_id
        LEFT JOIN leads l ON (lp.lead_id = l.id OR cle.external_reference = l.lead_number)
        WHERE cle.category = 'BUY_LEAD' AND cle.entry_type = 'debit'
          AND l.service_id = ?
          ${start ? 'AND cle.created_at >= ?' : ''}
          ${end ? 'AND cle.created_at <= ?' : ''}
          ${criteria.district ? "AND LOWER(COALESCE(l.district, '')) LIKE LOWER(?)" : ''}
      `,
        [
          svc.id,
          ...(start ? [start] : []),
          ...(end ? [end] : []),
          ...(criteria.district ? [`%${criteria.district}%`] : []),
        ]
      );

      // Service applications for this service
      const svcSaRows = await db.query<any>(
        `
        SELECT 
          COALESCE(SUM(sa.service_fee_snapshot), 0) as service_val,
          COALESCE(SUM(CASE WHEN sa.commission_status = 'RELEASED' THEN sa.commission_value_snapshot ELSE 0 END), 0) as rel_comm,
          COALESCE(SUM(CASE WHEN sa.commission_status = 'RELEASED' THEN (sa.service_fee_snapshot - sa.commission_value_snapshot) ELSE 0 END), 0) as ret_margin
        FROM service_applications sa
        LEFT JOIN clients c ON sa.client_id = c.id
        LEFT JOIN franchise_profiles fp ON sa.franchise_id = fp.organization_id
        WHERE LOWER(sa.status) = 'completed' AND sa.service_id = ?
          ${start ? 'AND (sa.completed_at >= ? OR (sa.completed_at IS NULL AND sa.updated_at >= ?))' : ''}
          ${end ? 'AND (sa.completed_at <= ? OR (sa.completed_at IS NULL AND sa.updated_at <= ?))' : ''}
          ${criteria.district ? "AND (LOWER(COALESCE(c.district, '')) LIKE LOWER(?) OR LOWER(COALESCE(fp.district, '')) LIKE LOWER(?))" : ''}
      `,
        [
          svc.id,
          ...(start ? [start, start] : []),
          ...(end ? [end, end] : []),
          ...(criteria.district ? [`%${criteria.district}%`, `%${criteria.district}%`] : []),
        ]
      );

      const sCamp = Math.round(Number(svcCampRows[0]?.inflow || 0) * 100) / 100;
      const sBuy = Math.round(Number(svcBuyRows[0]?.inflow || 0) * 100) / 100;
      const sVal = Math.round(Number(svcSaRows[0]?.service_val || 0) * 100) / 100;
      const sComm = Math.round(Number(svcSaRows[0]?.rel_comm || 0) * 100) / 100;
      const sMargin = Math.round(Number(svcSaRows[0]?.ret_margin || 0) * 100) / 100;
      const sTotal = Math.round((sCamp + sBuy + sMargin) * 100) / 100;

      if (sCamp > 0 || sBuy > 0 || sVal > 0 || !criteria.service) {
        serviceBreakdowns.push({
          serviceId: svc.id,
          serviceCode: svc.code,
          serviceName: svc.name,
          campaignFeeInflow: sCamp,
          buyLeadInflow: sBuy,
          completedServiceFeeValue: sVal,
          releasedFranchiseCommissions: sComm,
          retainedServiceMargin: sMargin,
          totalRevenue: sTotal,
        });
      }
    }

    // 5. Breakdown by District
    const districtRows = await db.query<any>(`
      SELECT DISTINCT district FROM (
        SELECT district FROM franchise_profiles WHERE district IS NOT NULL AND district != ''
        UNION
        SELECT district FROM franchise_campaigns WHERE district IS NOT NULL AND district != ''
        UNION
        SELECT district FROM leads WHERE district IS NOT NULL AND district != ''
      ) d
      ORDER BY district ASC
    `);

    const districtBreakdowns = [];
    for (const dRow of districtRows) {
      const dist = dRow.district;
      if (criteria.district && !dist.toLowerCase().includes(criteria.district.toLowerCase())) {
        continue;
      }

      // Camp fee for this district
      const dCampRows = await db.query<any>(
        `
        SELECT COALESCE(SUM(cle.amount), 0) as inflow
        FROM commission_ledger_entries cle
        JOIN franchise_campaigns fc ON cle.external_reference = fc.id
        LEFT JOIN service_masters sm ON fc.service_id = sm.id
        WHERE cle.category = 'campaign_daily_charge' AND cle.entry_type = 'debit'
          AND LOWER(fc.district) = LOWER(?)
          ${start ? 'AND cle.created_at >= ?' : ''}
          ${end ? 'AND cle.created_at <= ?' : ''}
          ${criteria.service ? 'AND (fc.service_id = ? OR sm.code = ? OR sm.id = ?)' : ''}
      `,
        [
          dist,
          ...(start ? [start] : []),
          ...(end ? [end] : []),
          ...(criteria.service ? [criteria.service, criteria.service, criteria.service] : []),
        ]
      );

      // Buy lead fee for this district
      const dBuyRows = await db.query<any>(
        `
        SELECT COALESCE(SUM(cle.amount), 0) as inflow
        FROM commission_ledger_entries cle
        LEFT JOIN lead_purchases lp ON cle.id = lp.ledger_entry_id
        LEFT JOIN leads l ON (lp.lead_id = l.id OR cle.external_reference = l.lead_number)
        LEFT JOIN service_masters sm ON l.service_id = sm.id
        WHERE cle.category = 'BUY_LEAD' AND cle.entry_type = 'debit'
          AND LOWER(l.district) = LOWER(?)
          ${start ? 'AND cle.created_at >= ?' : ''}
          ${end ? 'AND cle.created_at <= ?' : ''}
          ${criteria.service ? 'AND (l.service_id = ? OR sm.code = ? OR sm.id = ?)' : ''}
      `,
        [
          dist,
          ...(start ? [start] : []),
          ...(end ? [end] : []),
          ...(criteria.service ? [criteria.service, criteria.service, criteria.service] : []),
        ]
      );

      // Completed service applications for this district
      const dSaRows = await db.query<any>(
        `
        SELECT 
          COALESCE(SUM(sa.service_fee_snapshot), 0) as service_val,
          COALESCE(SUM(CASE WHEN sa.commission_status = 'RELEASED' THEN sa.commission_value_snapshot ELSE 0 END), 0) as rel_comm,
          COALESCE(SUM(CASE WHEN sa.commission_status = 'RELEASED' THEN (sa.service_fee_snapshot - sa.commission_value_snapshot) ELSE 0 END), 0) as ret_margin
        FROM service_applications sa
        LEFT JOIN service_masters sm ON sa.service_id = sm.id
        LEFT JOIN clients c ON sa.client_id = c.id
        LEFT JOIN franchise_profiles fp ON sa.franchise_id = fp.organization_id
        WHERE LOWER(sa.status) = 'completed'
          AND (LOWER(COALESCE(c.district, '')) = LOWER(?) OR LOWER(COALESCE(fp.district, '')) = LOWER(?))
          ${start ? 'AND (sa.completed_at >= ? OR (sa.completed_at IS NULL AND sa.updated_at >= ?))' : ''}
          ${end ? 'AND (sa.completed_at <= ? OR (sa.completed_at IS NULL AND sa.updated_at <= ?))' : ''}
          ${criteria.service ? 'AND (sa.service_id = ? OR sm.code = ? OR sm.id = ?)' : ''}
      `,
        [
          dist,
          dist,
          ...(start ? [start, start] : []),
          ...(end ? [end, end] : []),
          ...(criteria.service ? [criteria.service, criteria.service, criteria.service] : []),
        ]
      );

      const dCamp = Math.round(Number(dCampRows[0]?.inflow || 0) * 100) / 100;
      const dBuy = Math.round(Number(dBuyRows[0]?.inflow || 0) * 100) / 100;
      const dVal = Math.round(Number(dSaRows[0]?.service_val || 0) * 100) / 100;
      const dComm = Math.round(Number(dSaRows[0]?.rel_comm || 0) * 100) / 100;
      const dMargin = Math.round(Number(dSaRows[0]?.ret_margin || 0) * 100) / 100;
      const dTotal = Math.round((dCamp + dBuy + dMargin) * 100) / 100;

      districtBreakdowns.push({
        district: dist,
        campaignFeeInflow: dCamp,
        buyLeadInflow: dBuy,
        completedServiceFeeValue: dVal,
        releasedFranchiseCommissions: dComm,
        retainedServiceMargin: dMargin,
        totalRevenue: dTotal,
      });
    }

    if (context?.userId) {
      await AuditService.log({
        userId: context.userId,
        organizationId: null,
        action: 'NETWORK_REVENUE_REPORT_GENERATED',
        entityType: 'report',
        entityId: 'network_revenue',
        newValues: {
          filterCriteria: criteria,
          campaignFeeInflow,
          buyLeadInflow,
          completedServiceFeeValue,
          releasedFranchiseCommissions,
          retainedServiceMargin,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    return {
      campaignFeeInflow,
      buyLeadInflow,
      completedServiceFeeValue,
      releasedFranchiseCommissions,
      retainedServiceMargin,
      campaign_fee_inflow: campaignFeeInflow,
      buy_lead_inflow: buyLeadInflow,
      completed_service_fee_value: completedServiceFeeValue,
      released_franchise_commissions: releasedFranchiseCommissions,
      retained_service_margin: retainedServiceMargin,
      kpis: {
        campaignFeeInflow,
        campaignChargesCount,
        buyLeadInflow,
        buyLeadCount,
        completedServiceFeeValue,
        completedServiceCount,
        releasedFranchiseCommissions,
        retainedServiceMargin,
        retainedMarginPercentage,
        totalPlatformInflow,
        totalNetPlatformMargin,
      },
      breakdowns: {
        byService: serviceBreakdowns,
        byDistrict: districtBreakdowns,
      },
      filterCriteria: criteria,
      generatedAt: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // 5. Custom Reports Schema & Execution Engine (Database-Level COUNT/SUM/GROUP BY)
  // ==========================================================================
  static getCustomReportDatasets(): CustomReportDatasetSchema[] {
    return [
      {
        dataset: 'leads',
        label: 'Client Leads Directory',
        description: 'Lead opportunities, conversion stages, fees, and location analytics',
        supportedFilters: ['dateRange', 'franchise', 'service', 'status', 'city', 'district', 'state', 'search'],
        fields: [
          { id: 'lead_number', label: 'Lead Number', type: 'string', dbColumn: 'l.lead_number', groupable: true },
          { id: 'customer_name', label: 'Customer Name', type: 'string', dbColumn: 'l.customer_name', groupable: true },
          { id: 'customer_phone', label: 'Phone', type: 'string', dbColumn: 'l.customer_phone' },
          { id: 'service_name', label: 'Requested Service', type: 'string', dbColumn: 'COALESCE(sm.name, l.service_id)', groupable: true },
          { id: 'service_fee', label: 'Statutory Fee (₹)', type: 'number', dbColumn: 'COALESCE(sm.service_fee, 0)', aggregatable: true },
          { id: 'status', label: 'Status', type: 'string', dbColumn: 'l.status', groupable: true },
          { id: 'city', label: 'City', type: 'string', dbColumn: 'l.city', groupable: true },
          { id: 'district', label: 'District', type: 'string', dbColumn: 'l.district', groupable: true },
          { id: 'state', label: 'State', type: 'string', dbColumn: 'l.state', groupable: true },
          { id: 'franchise_name', label: 'Assigned Center', type: 'string', dbColumn: "COALESCE(fp.operating_name, fa.business_name, o.name, 'Unassigned')", groupable: true },
          { id: 'created_at', label: 'Ingested Date', type: 'date', dbColumn: 'l.created_at', groupable: true },
        ],
      },
      {
        dataset: 'franchises',
        label: 'Franchise Accounts & Allocations',
        description: 'Franchise center profiles, operational balances, campaigns, and territories',
        supportedFilters: ['dateRange', 'franchise', 'status', 'city', 'district', 'state', 'search'],
        fields: [
          { id: 'franchise_code', label: 'Franchise Code', type: 'string', dbColumn: 'COALESCE(fp.franchise_code, o.code)', groupable: true },
          { id: 'operating_name', label: 'Operating Center', type: 'string', dbColumn: 'COALESCE(fp.operating_name, fa.business_name, o.name)', groupable: true },
          { id: 'status', label: 'Operating Status', type: 'string', dbColumn: "COALESCE(fp.status, fa.status, o.status, 'active')", groupable: true },
          { id: 'current_balance', label: 'Wallet Balance (₹)', type: 'number', dbColumn: 'fca.current_balance', aggregatable: true },
          { id: 'city', label: 'City', type: 'string', dbColumn: "COALESCE(fp.city, fa.city, '')", groupable: true },
          { id: 'district', label: 'District', type: 'string', dbColumn: "COALESCE(fp.district, fa.district, '')", groupable: true },
          { id: 'state', label: 'State', type: 'string', dbColumn: "COALESCE(fp.state, fa.state, 'Tamil Nadu')", groupable: true },
          { id: 'contact_email', label: 'Contact Email', type: 'string', dbColumn: "COALESCE(fp.contact_email, fa.contact_email, '')" },
          { id: 'contact_phone', label: 'Contact Phone', type: 'string', dbColumn: "COALESCE(fp.contact_phone, fa.contact_phone, '')" },
          { id: 'created_at', label: 'Activated Date', type: 'date', dbColumn: 'fca.created_at', groupable: true },
        ],
      },
      {
        dataset: 'commission_ledger',
        label: 'Commission & Revenue Ledger',
        description: 'Immutable financial double-entry transaction records, wallet top-ups, and deductions',
        supportedFilters: ['dateRange', 'franchise', 'status', 'city', 'district', 'state', 'search'],
        fields: [
          { id: 'reference_id', label: 'Reference ID', type: 'string', dbColumn: 'cle.reference_id', groupable: true },
          { id: 'franchise_name', label: 'Franchise Center', type: 'string', dbColumn: 'COALESCE(fp.operating_name, fa.business_name, o.name)', groupable: true },
          { id: 'entry_type', label: 'Entry Type (Credit/Debit)', type: 'string', dbColumn: 'cle.entry_type', groupable: true },
          { id: 'category', label: 'Transaction Category', type: 'string', dbColumn: 'cle.category', groupable: true },
          { id: 'amount', label: 'Amount (₹)', type: 'number', dbColumn: 'cle.amount', aggregatable: true },
          { id: 'balance_after', label: 'Post Balance (₹)', type: 'number', dbColumn: 'cle.balance_after', aggregatable: true },
          { id: 'description', label: 'Description', type: 'string', dbColumn: "COALESCE(cle.description, '')" },
          { id: 'created_at', label: 'Timestamp', type: 'date', dbColumn: 'cle.created_at', groupable: true },
        ],
      },
      {
        dataset: 'services',
        label: 'Legal & Business Services Catalog',
        description: 'Master statutory service fees, turnaround SLAs, and catalog demand analytics',
        supportedFilters: ['service', 'status', 'search'],
        fields: [
          { id: 'code', label: 'Service Code', type: 'string', dbColumn: 'sm.code', groupable: true },
          { id: 'name', label: 'Service Name', type: 'string', dbColumn: 'sm.name', groupable: true },
          { id: 'category', label: 'Category', type: 'string', dbColumn: "COALESCE(sc.name, 'General')", groupable: true },
          { id: 'service_fee', label: 'Statutory Fee (₹)', type: 'number', dbColumn: 'sm.service_fee', aggregatable: true },
          { id: 'commission_value', label: 'Partner Commission (₹)', type: 'number', dbColumn: 'sm.commission_value', aggregatable: true },
          { id: 'turnaround_days', label: 'SLA (Days)', type: 'number', dbColumn: 'sm.turnaround_days', aggregatable: true },
          { id: 'is_active', label: 'Active Flag', type: 'boolean', dbColumn: 'sm.is_active', groupable: true },
        ],
      },
    ];
  }

  /**
   * Execute custom report query with database-level aggregation / selection
   */
  static async executeCustomReport(req: CustomReportRequest): Promise<CustomReportResult> {
    const startTime = Date.now();
    const db = getDatabase();

    const datasets = this.getCustomReportDatasets();
    const datasetSchema = datasets.find((d) => d.dataset === req.dataset);
    if (!datasetSchema) {
      throw new BadRequestError(`Unsupported dataset: ${req.dataset}`);
    }

    const fieldMap = new Map(datasetSchema.fields.map((f) => [f.id, f]));
    const filters = req.filters || {};
    const { start, end } = this.normalizeDateParams(filters.startDate, filters.endDate);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    let fromClause = '';
    let dateColumn = '';
    let franchiseColumn = '';
    let serviceColumn = '';
    let statusColumn = '';
    let cityColumn = '';
    let districtColumn = '';
    let stateColumn = '';

    if (req.dataset === 'leads') {
      fromClause = `
        leads l
        LEFT JOIN service_masters sm ON l.service_id = sm.id
        LEFT JOIN organizations o ON l.assigned_franchise_id = o.id
        LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
        LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      `;
      dateColumn = 'l.created_at';
      franchiseColumn = 'l.assigned_franchise_id';
      serviceColumn = 'l.service_id';
      statusColumn = 'l.status';
      cityColumn = 'l.city';
      districtColumn = 'l.district';
      stateColumn = 'l.state';
    } else if (req.dataset === 'franchises') {
      fromClause = `
        franchise_commission_accounts fca
        JOIN organizations o ON fca.organization_id = o.id
        LEFT JOIN franchise_profiles fp ON fp.organization_id = fca.organization_id
        LEFT JOIN franchise_applications fa ON fa.organization_id = fca.organization_id
      `;
      dateColumn = 'fca.created_at';
      franchiseColumn = 'fca.organization_id';
      statusColumn = "COALESCE(fp.status, fa.status, o.status, 'active')";
      cityColumn = "COALESCE(fp.city, fa.city, '')";
      districtColumn = "COALESCE(fp.district, fa.district, '')";
      stateColumn = "COALESCE(fp.state, fa.state, '')";
    } else if (req.dataset === 'commission_ledger') {
      fromClause = `
        commission_ledger_entries cle
        JOIN organizations o ON cle.organization_id = o.id
        LEFT JOIN franchise_profiles fp ON fp.organization_id = o.id
        LEFT JOIN franchise_applications fa ON fa.organization_id = o.id
      `;
      dateColumn = 'cle.created_at';
      franchiseColumn = 'cle.organization_id';
      statusColumn = 'cle.entry_type';
      cityColumn = "COALESCE(fp.city, fa.city, '')";
      districtColumn = "COALESCE(fp.district, fa.district, '')";
      stateColumn = "COALESCE(fp.state, fa.state, '')";
    } else if (req.dataset === 'services') {
      fromClause = `
        service_masters sm
        LEFT JOIN service_categories sc ON sm.category_id = sc.id
      `;
      dateColumn = 'sm.created_at';
      serviceColumn = 'sm.id';
      statusColumn = "CASE WHEN sm.is_active = 1 THEN 'active' ELSE 'inactive' END";
    }

    // Apply Standard Filters
    if (start && dateColumn) {
      conditions.push(`${dateColumn} >= ?`);
      params.push(start);
    }
    if (end && dateColumn) {
      conditions.push(`${dateColumn} <= ?`);
      params.push(end);
    }
    if (filters.franchise && filters.franchise !== 'all' && franchiseColumn) {
      conditions.push(`${franchiseColumn} = ?`);
      params.push(filters.franchise);
    }
    if (filters.service && filters.service !== 'all' && serviceColumn) {
      conditions.push(`${serviceColumn} = ?`);
      params.push(filters.service);
    }
    if (filters.status && filters.status !== 'all' && statusColumn) {
      conditions.push(`LOWER(${statusColumn}) = LOWER(?)`);
      params.push(filters.status);
    }
    if (filters.city && cityColumn) {
      conditions.push(`LOWER(${cityColumn}) LIKE LOWER(?)`);
      params.push(`%${filters.city}%`);
    }
    if (filters.district && districtColumn) {
      conditions.push(`LOWER(${districtColumn}) LIKE LOWER(?)`);
      params.push(`%${filters.district}%`);
    }
    if (filters.state && stateColumn) {
      conditions.push(`LOWER(${stateColumn}) LIKE LOWER(?)`);
      params.push(`%${filters.state}%`);
    }

    const whereClause = conditions.join(' AND ');

    // ------------------------------------------------------------------
    // Strict GroupBy Whitelist Validation
    // ------------------------------------------------------------------
    if (req.groupBy && req.groupBy.trim() !== '') {
      const groupFieldDef = fieldMap.get(req.groupBy);
      if (!groupFieldDef) {
        throw new BadRequestError(
          `Invalid groupBy field '${req.groupBy}'. Field must be one of the approved fields in dataset '${req.dataset}': ${Array.from(fieldMap.keys()).join(', ')}`
        );
      }
      if (groupFieldDef.groupable === false) {
        throw new BadRequestError(
          `Field '${req.groupBy}' is not supported for grouping in dataset '${req.dataset}'.`
        );
      }
    }

    // ------------------------------------------------------------------
    // Case A: Grouped / Aggregated Mode (Database-level GROUP BY / SUM / COUNT)
    // ------------------------------------------------------------------
    if (req.groupBy && req.groupBy.trim() !== '') {
      const groupFieldDef = fieldMap.get(req.groupBy)!;
      const selectParts: string[] = [`${groupFieldDef.dbColumn} as ${groupFieldDef.id}`];
      const outputFields = [{ id: groupFieldDef.id, label: groupFieldDef.label, type: groupFieldDef.type }];

      // Count records per group
      selectParts.push('COUNT(*) as total_count');
      outputFields.push({ id: 'total_count', label: 'Record Count', type: 'number' });

      // Add user requested aggregations or default sums
      if (req.aggregations && req.aggregations.length > 0) {
        for (const agg of req.aggregations) {
          const targetDef = fieldMap.get(agg.field);
          if (targetDef && targetDef.aggregatable) {
            const allowedFuncs = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
            const func = allowedFuncs.includes(agg.func) ? agg.func : 'SUM';
            const alias = agg.alias || `${agg.field}_${func.toLowerCase()}`;
            selectParts.push(`COALESCE(${func}(${targetDef.dbColumn}), 0) as ${alias}`);
            outputFields.push({
              id: alias,
              label: `${func} of ${targetDef.label}`,
              type: 'number',
            });
          }
        }
      } else {
        // Automatic aggregations for number fields in dataset
        datasetSchema.fields
          .filter((f) => f.aggregatable)
          .forEach((f) => {
            selectParts.push(`COALESCE(SUM(${f.dbColumn}), 0) as total_${f.id}`);
            outputFields.push({
              id: `total_${f.id}`,
              label: `Total ${f.label}`,
              type: 'number',
            });
          });
      }

      const sql = `
        SELECT ${selectParts.join(', ')}
        FROM ${fromClause}
        WHERE ${whereClause}
        GROUP BY ${groupFieldDef.dbColumn}
        ORDER BY total_count DESC
        LIMIT ${Math.min(req.limit || 100, 500)}
      `;

      const rows = await db.query<any>(sql, params);

      return {
        dataset: req.dataset,
        totalRecords: rows.length,
        fields: outputFields,
        rows,
        executedAt: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
      };
    }

    // ------------------------------------------------------------------
    // Case B: Detailed Records Mode with Selected Fields
    // ------------------------------------------------------------------
    const requestedFields = (req.fields && req.fields.length > 0 ? req.fields : datasetSchema.fields.map((f) => f.id))
      .filter((id) => fieldMap.has(id))
      .map((id) => fieldMap.get(id)!);

    const selectExprs = requestedFields.map((f) => `${f.dbColumn} as ${f.id}`).join(', ');

    // Total count query
    const countSql = `SELECT COUNT(*) as total FROM ${fromClause} WHERE ${whereClause}`;
    const countRes = await db.query<any>(countSql, params);
    const totalRecords = Number(countRes[0]?.total) || 0;

    // Data query
    const limit = Math.min(req.limit || 100, 1000);
    const offset = req.offset || 0;

    const dataSql = `
      SELECT ${selectExprs}
      FROM ${fromClause}
      WHERE ${whereClause}
      LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await db.query<any>(dataSql, params);

    return {
      dataset: req.dataset,
      totalRecords,
      fields: requestedFields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
      rows,
      executedAt: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // 6. Saved Custom Reports Management
  // ==========================================================================
  static async saveCustomReport(
    name: string,
    description: string | null,
    dataset: string,
    selectedFields: string[],
    filterCriteria: ReportFilterCriteria,
    groupBy?: string,
    aggregations?: any[],
    userId?: string
  ): Promise<SavedCustomReportModel> {
    const db = getDatabase();

    if (groupBy && groupBy.trim() !== '') {
      const datasets = this.getCustomReportDatasets();
      const datasetSchema = datasets.find((d) => d.dataset === dataset);
      if (datasetSchema) {
        const fieldMap = new Map(datasetSchema.fields.map((f) => [f.id, f]));
        const groupFieldDef = fieldMap.get(groupBy);
        if (!groupFieldDef) {
          throw new BadRequestError(
            `Invalid groupBy field '${groupBy}'. Field must be one of the approved fields in dataset '${dataset}': ${Array.from(fieldMap.keys()).join(', ')}`
          );
        }
        if (groupFieldDef.groupable === false) {
          throw new BadRequestError(
            `Field '${groupBy}' is not supported for grouping in dataset '${dataset}'.`
          );
        }
      }
    }

    const id = `report_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    await db.execute(
      `
      INSERT INTO saved_custom_reports (
        id, name, description, dataset, selected_fields, filter_criteria, group_by, aggregations, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        name,
        description || null,
        dataset,
        JSON.stringify(selectedFields),
        JSON.stringify(filterCriteria),
        groupBy || null,
        aggregations ? JSON.stringify(aggregations) : null,
        userId || null,
        now,
        now,
      ]
    );

    return {
      id,
      name,
      description,
      dataset: dataset as any,
      selected_fields: JSON.stringify(selectedFields),
      filter_criteria: JSON.stringify(filterCriteria),
      group_by: groupBy || null,
      aggregations: aggregations ? JSON.stringify(aggregations) : null,
      created_by_user_id: userId || null,
      created_at: now,
      updated_at: now,
    };
  }

  static async getSavedReports(): Promise<SavedCustomReportModel[]> {
    const db = getDatabase();
    return await db.query<SavedCustomReportModel>(
      'SELECT * FROM saved_custom_reports ORDER BY created_at DESC LIMIT 50'
    );
  }

  static async deleteSavedReport(id: string): Promise<boolean> {
    const db = getDatabase();
    const res = await db.execute('DELETE FROM saved_custom_reports WHERE id = ?', [id]);
    return res.rowsAffected > 0;
  }
}
