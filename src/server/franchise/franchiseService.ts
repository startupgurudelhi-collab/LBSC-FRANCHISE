import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import {
  BadRequestError,
  NotFoundError,
} from '../errors/AppError.js';
import {
  FRANCHISE_APPLICATION_STATUS,
  type FranchiseApplicationModel,
  type FranchiseProfileModel,
} from './types.js';

export interface CreateApplicationDto {
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  district: string;
  state: string;
  pin: string;
  applicantUserId?: string | null;
}

export interface UpdateProfileDto {
  operatingName?: string;
  legalName?: string;
  taxId?: string | null;
  contactEmail?: string;
  contactPhone?: string;
  city?: string;
  district?: string;
  state?: string;
  pin?: string;
}

export class FranchiseService {
  /**
   * Submit a new franchise application (Initial status: application)
   */
  static async createApplication(
    dto: CreateApplicationDto,
    context?: { userId?: string | null; ipAddress?: string | null; userAgent?: string | null }
  ): Promise<FranchiseApplicationModel> {
    const db = getDatabase();
    const id = `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.execute(
      `INSERT INTO franchise_applications (
        id, applicant_user_id, business_name, contact_name, contact_email, contact_phone,
        status, city, district, state, pin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.applicantUserId || null,
        dto.businessName.trim(),
        dto.contactName.trim(),
        dto.contactEmail.toLowerCase().trim(),
        dto.contactPhone.trim(),
        FRANCHISE_APPLICATION_STATUS.APPLICATION,
        dto.city.trim(),
        dto.district.trim(),
        dto.state.trim(),
        dto.pin.trim(),
      ]
    );

    await AuditService.log({
      userId: context?.userId,
      action: 'FRANCHISE_APPLICATION_SUBMITTED',
      entityType: 'franchise_application',
      entityId: id,
      newValues: {
        businessName: dto.businessName,
        status: FRANCHISE_APPLICATION_STATUS.APPLICATION,
        city: dto.city,
        district: dto.district,
        state: dto.state,
        pin: dto.pin,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const created = await this.getApplicationById(id);
    if (!created) {
      throw new Error('Application could not be retrieved after creation');
    }
    return created;
  }

  /**
   * Get application by ID
   */
  static async getApplicationById(id: string): Promise<FranchiseApplicationModel | null> {
    const db = getDatabase();
    const rows = await db.query<FranchiseApplicationModel>(
      `SELECT * FROM franchise_applications WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * List applications with optional status / location filters and tenant isolation
   */
  static async listApplications(
    filter?: {
      status?: string;
      city?: string;
      district?: string;
      state?: string;
      pin?: string;
    },
    scope?: {
      userId?: string;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    }
  ): Promise<FranchiseApplicationModel[]> {
    const db = getDatabase();
    let sql = `SELECT * FROM franchise_applications WHERE 1=1`;
    const params: unknown[] = [];

    // Tenant isolation: non-super-admins see only their own application(s)
    if (!scope?.isSuperAdmin) {
      if (scope?.userId && scope?.organizationId) {
        sql += ` AND (applicant_user_id = ? OR organization_id = ?)`;
        params.push(scope.userId, scope.organizationId);
      } else if (scope?.userId) {
        sql += ` AND applicant_user_id = ?`;
        params.push(scope.userId);
      } else if (scope?.organizationId) {
        sql += ` AND organization_id = ?`;
        params.push(scope.organizationId);
      } else {
        sql += ` AND 1=0`;
      }
    }

    if (filter?.status) {
      sql += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter?.city) {
      sql += ` AND LOWER(city) = LOWER(?)`;
      params.push(filter.city);
    }
    if (filter?.district) {
      sql += ` AND LOWER(district) = LOWER(?)`;
      params.push(filter.district);
    }
    if (filter?.state) {
      sql += ` AND LOWER(state) = LOWER(?)`;
      params.push(filter.state);
    }
    if (filter?.pin) {
      sql += ` AND pin = ?`;
      params.push(filter.pin);
    }

    sql += ` ORDER BY created_at DESC`;
    return db.query<FranchiseApplicationModel>(sql, params);
  }

  /**
   * Workflow Action: Move Application to Screening
   * Allowed from: application
   */
  static async moveToScreening(
    applicationId: string,
    notes?: string,
    context?: { adminUserId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<FranchiseApplicationModel> {
    const db = getDatabase();
    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new NotFoundError('Franchise application not found');
    }

    if (app.status !== FRANCHISE_APPLICATION_STATUS.APPLICATION) {
      throw new BadRequestError(
        `Cannot screen application in current state: ${app.status}. Must be in 'application' state.`
      );
    }

    await db.execute(
      `UPDATE franchise_applications 
       SET status = ?, screening_notes = ?, reviewed_by_user_id = ?, reviewed_at = ${
         db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'
       }, updated_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [FRANCHISE_APPLICATION_STATUS.SCREENING, notes || null, context?.adminUserId || null, applicationId]
    );

    await AuditService.log({
      userId: context?.adminUserId,
      action: 'FRANCHISE_APPLICATION_SCREENING_STARTED',
      entityType: 'franchise_application',
      entityId: applicationId,
      oldValues: { status: app.status },
      newValues: { status: FRANCHISE_APPLICATION_STATUS.SCREENING, notes },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return (await this.getApplicationById(applicationId))!;
  }

  /**
   * Workflow Action: Approve Application
   * Allowed from: screening or application
   */
  static async approveApplication(
    applicationId: string,
    context?: { adminUserId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<FranchiseApplicationModel> {
    const db = getDatabase();
    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new NotFoundError('Franchise application not found');
    }

    if (
      app.status !== FRANCHISE_APPLICATION_STATUS.SCREENING &&
      app.status !== FRANCHISE_APPLICATION_STATUS.APPLICATION
    ) {
      throw new BadRequestError(
        `Cannot approve application in '${app.status}' status. Must be in 'application' or 'screening'.`
      );
    }

    await db.execute(
      `UPDATE franchise_applications
       SET status = ?, reviewed_by_user_id = ?, reviewed_at = ${
         db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'
       }, updated_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [FRANCHISE_APPLICATION_STATUS.APPROVED, context?.adminUserId || null, applicationId]
    );

    await AuditService.log({
      userId: context?.adminUserId,
      action: 'FRANCHISE_APPLICATION_APPROVED',
      entityType: 'franchise_application',
      entityId: applicationId,
      oldValues: { status: app.status },
      newValues: { status: FRANCHISE_APPLICATION_STATUS.APPROVED },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return (await this.getApplicationById(applicationId))!;
  }

  /**
   * Workflow Action: Reject Application
   * Allowed from: application, screening
   */
  static async rejectApplication(
    applicationId: string,
    reason: string,
    context?: { adminUserId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<FranchiseApplicationModel> {
    const db = getDatabase();
    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new NotFoundError('Franchise application not found');
    }

    if (
      app.status === FRANCHISE_APPLICATION_STATUS.REJECTED ||
      app.status === FRANCHISE_APPLICATION_STATUS.ACTIVE ||
      app.status === FRANCHISE_APPLICATION_STATUS.DEACTIVATED
    ) {
      throw new BadRequestError(`Cannot reject application in '${app.status}' status.`);
    }

    await db.execute(
      `UPDATE franchise_applications
       SET status = ?, rejection_reason = ?, reviewed_by_user_id = ?, reviewed_at = ${
         db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'
       }, updated_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [FRANCHISE_APPLICATION_STATUS.REJECTED, reason, context?.adminUserId || null, applicationId]
    );

    await AuditService.log({
      userId: context?.adminUserId,
      action: 'FRANCHISE_APPLICATION_REJECTED',
      entityType: 'franchise_application',
      entityId: applicationId,
      oldValues: { status: app.status },
      newValues: { status: FRANCHISE_APPLICATION_STATUS.REJECTED, reason },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return (await this.getApplicationById(applicationId))!;
  }

  /**
   * Workflow Action: Activate Franchise (From Approved state)
   * Provisions organization, creates official franchise_profile, sets status to ACTIVE
   */
  static async activateFranchise(
    applicationId: string,
    context?: { adminUserId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ application: FranchiseApplicationModel; profile: FranchiseProfileModel }> {
    const db = getDatabase();
    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new NotFoundError('Franchise application not found');
    }

    if (app.status !== FRANCHISE_APPLICATION_STATUS.APPROVED) {
      throw new BadRequestError(
        `Application must be in 'approved' status to activate. Current status: '${app.status}'`
      );
    }

    // 1. Create or link Organization
    let orgId = app.organization_id;
    const franchiseCode = `FRAN-${app.pin}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (!orgId) {
      orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(
        `INSERT INTO organizations (id, code, name, type, status)
         VALUES (?, ?, ?, 'franchise', 'active')`,
        [orgId, franchiseCode, app.business_name]
      );
    } else {
      await db.execute(
        `UPDATE organizations SET status = 'active' WHERE id = ?`,
        [orgId]
      );
    }

    // 2. Create or Update Franchise Profile
    const profileId = `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const existingProfile = await db.query<any>(
      `SELECT id FROM franchise_profiles WHERE organization_id = ? LIMIT 1`,
      [orgId]
    );

    if (existingProfile.length === 0) {
      await db.execute(
        `INSERT INTO franchise_profiles (
          id, organization_id, application_id, franchise_code, operating_name, legal_name,
          contact_email, contact_phone, status, city, district, state, pin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        [
          profileId,
          orgId,
          applicationId,
          franchiseCode,
          app.business_name,
          app.business_name,
          app.contact_email,
          app.contact_phone,
          app.city,
          app.district,
          app.state,
          app.pin,
        ]
      );
    } else {
      await db.execute(
        `UPDATE franchise_profiles SET status = 'active' WHERE organization_id = ?`,
        [orgId]
      );
    }

    // 3. Update application status to active
    await db.execute(
      `UPDATE franchise_applications
       SET status = ?, organization_id = ?, activated_at = ${
         db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'
       }, updated_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [FRANCHISE_APPLICATION_STATUS.ACTIVE, orgId, applicationId]
    );

    // 4. If applicant user exists, link their user to this franchise org
    if (app.applicant_user_id) {
      await db.execute(
        `UPDATE users SET organization_id = ? WHERE id = ?`,
        [orgId, app.applicant_user_id]
      );
    }

    // 5. Initialize Franchise Commission Account if not present
    const existingAcc = await db.query<any>(
      `SELECT id FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1`,
      [orgId]
    );
    if (existingAcc.length === 0) {
      await db.execute(
        `INSERT INTO franchise_commission_accounts (id, organization_id, current_balance, currency, version)
         VALUES (?, ?, 0.0, 'INR', 1)`,
        [`comm_acc_${orgId}`, orgId]
      );
    }

    await AuditService.log({
      organizationId: orgId,
      userId: context?.adminUserId,
      action: 'FRANCHISE_ACTIVATED',
      entityType: 'franchise_application',
      entityId: applicationId,
      oldValues: { status: app.status },
      newValues: {
        status: FRANCHISE_APPLICATION_STATUS.ACTIVE,
        organizationId: orgId,
        franchiseCode,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const updatedApp = (await this.getApplicationById(applicationId))!;
    const profile = (await this.getProfileByOrganizationId(orgId))!;

    return { application: updatedApp, profile };
  }

  /**
   * Workflow Action: Deactivate Franchise
   * Allowed from: active
   */
  static async deactivateFranchise(
    applicationIdOrOrgId: string,
    reason?: string,
    context?: { adminUserId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<{ application?: FranchiseApplicationModel; profile?: FranchiseProfileModel }> {
    const db = getDatabase();

    let app = await this.getApplicationById(applicationIdOrOrgId);
    let orgId: string | null = null;

    if (app) {
      orgId = app.organization_id;
    } else {
      orgId = applicationIdOrOrgId;
      const apps = await db.query<FranchiseApplicationModel>(
        `SELECT * FROM franchise_applications WHERE organization_id = ? LIMIT 1`,
        [orgId]
      );
      if (apps.length > 0) app = apps[0];
    }

    if (!app && !orgId) {
      throw new NotFoundError('Franchise not found');
    }

    if (app) {
      await db.execute(
        `UPDATE franchise_applications
         SET status = ?, deactivated_at = ${
           db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'
         }, updated_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ?`,
        [FRANCHISE_APPLICATION_STATUS.DEACTIVATED, app.id]
      );
    }

    if (orgId) {
      await db.execute(`UPDATE organizations SET status = 'suspended' WHERE id = ?`, [orgId]);
      await db.execute(`UPDATE franchise_profiles SET status = 'deactivated' WHERE organization_id = ?`, [
        orgId,
      ]);
    }

    await AuditService.log({
      organizationId: orgId,
      userId: context?.adminUserId,
      action: 'FRANCHISE_DEACTIVATED',
      entityType: 'franchise_application',
      entityId: app ? app.id : (orgId as string),
      oldValues: { status: app?.status || 'active' },
      newValues: { status: FRANCHISE_APPLICATION_STATUS.DEACTIVATED, reason },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const updatedApp = app ? await this.getApplicationById(app.id) : null;
    const updatedProfile = orgId ? await this.getProfileByOrganizationId(orgId) : null;

    return {
      application: updatedApp || undefined,
      profile: updatedProfile || undefined,
    };
  }

  /**
   * Get Franchise Profile by Organization ID
   */
  static async getProfileByOrganizationId(orgId: string): Promise<FranchiseProfileModel | null> {
    const db = getDatabase();
    const rows = await db.query<FranchiseProfileModel>(
      `SELECT * FROM franchise_profiles WHERE organization_id = ? LIMIT 1`,
      [orgId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Update Franchise Profile details & location mapping (City, District, State, PIN)
   */
  static async updateProfile(
    orgId: string,
    dto: UpdateProfileDto,
    context?: { userId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<FranchiseProfileModel> {
    const db = getDatabase();
    const existing = await this.getProfileByOrganizationId(orgId);
    if (!existing) {
      throw new NotFoundError('Franchise profile not found');
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (dto.operatingName !== undefined) {
      updates.push('operating_name = ?');
      params.push(dto.operatingName);
    }
    if (dto.legalName !== undefined) {
      updates.push('legal_name = ?');
      params.push(dto.legalName);
    }
    if (dto.taxId !== undefined) {
      updates.push('tax_id = ?');
      params.push(dto.taxId);
    }
    if (dto.contactEmail !== undefined) {
      updates.push('contact_email = ?');
      params.push(dto.contactEmail);
    }
    if (dto.contactPhone !== undefined) {
      updates.push('contact_phone = ?');
      params.push(dto.contactPhone);
    }
    if (dto.city !== undefined) {
      updates.push('city = ?');
      params.push(dto.city);
    }
    if (dto.district !== undefined) {
      updates.push('district = ?');
      params.push(dto.district);
    }
    if (dto.state !== undefined) {
      updates.push('state = ?');
      params.push(dto.state);
    }
    if (dto.pin !== undefined) {
      updates.push('pin = ?');
      params.push(dto.pin);
    }

    if (updates.length > 0) {
      updates.push(
        `updated_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`
      );
      params.push(orgId);

      await db.execute(
        `UPDATE franchise_profiles SET ${updates.join(', ')} WHERE organization_id = ?`,
        params
      );

      await AuditService.log({
        organizationId: orgId,
        userId: context?.userId,
        action: 'FRANCHISE_PROFILE_UPDATED',
        entityType: 'franchise_profile',
        entityId: existing.id,
        oldValues: {
          operatingName: existing.operating_name,
          city: existing.city,
          district: existing.district,
          state: existing.state,
          pin: existing.pin,
        },
        newValues: dto as Record<string, unknown>,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    }

    return (await this.getProfileByOrganizationId(orgId))!;
  }
}
