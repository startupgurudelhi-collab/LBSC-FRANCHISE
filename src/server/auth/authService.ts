import { getDatabase } from '../db/connection.js';
import { hashPassword, verifyPassword, generateToken } from './security.js';
import { UnauthorizedError, ConflictError, NotFoundError, BadRequestError } from '../errors/AppError.js';
import type { AuthenticatedUser, DatabaseAdapter } from '../types/index.js';
import { env } from '../config/env.js';
import { AuditService } from '../audit/auditService.js';

export interface UserAuthDetails extends AuthenticatedUser {
  passwordHash: string | null;
}

export class AuthService {
  /**
   * Securely bootstraps the initial Super Administrator account if it does not exist.
   * Safe to run in both production and development environments:
   * - Idempotent and non-destructive: never alters or overwrites existing user passwords.
   * - Uses real bcrypt hashing with 12 salt rounds.
   * - Respects process.env.ADMIN_INITIAL_PASSWORD or process.env.ADMIN_PASSWORD if provided;
   *   otherwise defaults to the standard platform initial password.
   * - Ensures the 'super_admin' system role is mapped.
   */
  static async ensureSuperAdmin(dbInstance?: DatabaseAdapter, customPassword?: string): Promise<void> {
    const db = dbInstance || getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Ensure Super Admin role exists
    const superAdminRole = await db.query<any>('SELECT id FROM roles WHERE code = ? LIMIT 1', ['super_admin']);
    let superAdminRoleId = superAdminRole[0]?.id || 'role_super_admin';
    if (!superAdminRole || superAdminRole.length === 0) {
      await db.execute(
        'INSERT INTO roles (id, name, code, description, is_system) VALUES (?, ?, ?, ?, ?)',
        ['role_super_admin', 'Super Administrator', 'super_admin', 'Unrestricted system access', isSqlite ? 1 : true]
      );
      superAdminRoleId = 'role_super_admin';
    }

    // 2. Check if admin user exists
    const adminEmail = 'admin@lbsc.internal';
    const adminUsers = await db.query<any>('SELECT id, password_hash FROM users WHERE email = ? LIMIT 1', [adminEmail]);

    const initialPassword =
      customPassword ||
      process.env.ADMIN_INITIAL_PASSWORD ||
      process.env.ADMIN_PASSWORD ||
      'SuperAdminPassword123!';

    let adminUserId = 'usr_super_admin_001';
    if (adminUsers.length === 0) {
      const adminPasswordHash = await hashPassword(initialPassword);
      await db.execute(
        `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status, token_version)
         VALUES (?, NULL, ?, ?, 'Super', 'Admin', 'active', 1)`,
        [adminUserId, adminEmail, adminPasswordHash]
      );
      console.log(`[Auth] Super Admin user initialized successfully: ${adminEmail}`);
    } else {
      adminUserId = adminUsers[0].id;
      // If user exists but has no password hash, configure it
      if (!adminUsers[0].password_hash) {
        const adminPasswordHash = await hashPassword(initialPassword);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [adminPasswordHash, adminUserId]);
        console.log(`[Auth] Configured missing password hash for existing Super Admin: ${adminEmail}`);
      }
    }

    // 3. Ensure Super Admin role is mapped
    const adminRoleMap = await db.query<any>(
      'SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1',
      [adminUserId, superAdminRoleId]
    );
    if (adminRoleMap.length === 0) {
      await db.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminUserId, superAdminRoleId]);
    }
  }

  /**
   * Securely resets the Super Administrator password.
   * Can be invoked via CLI or server startup environment variable.
   * - Enforces minimum password strength (>= 8 characters)
   * - Generates real bcrypt hash with 12 salt rounds
   * - Increments token_version to immediately invalidate all existing sessions
   * - Records an audit log event
   */
  static async resetAdminPassword(newPassword: string, dbInstance?: DatabaseAdapter): Promise<{ success: boolean; email: string }> {
    if (!newPassword || newPassword.trim().length < 8) {
      throw new BadRequestError('Password must be at least 8 characters long');
    }

    const db = dbInstance || getDatabase();
    const adminEmail = 'admin@lbsc.internal';
    const users = await db.query<any>('SELECT id, token_version FROM users WHERE email = ? LIMIT 1', [adminEmail]);

    if (!users || users.length === 0) {
      await this.ensureSuperAdmin(db, newPassword.trim());
      return { success: true, email: adminEmail };
    }

    const adminUser = users[0];
    const newHash = await hashPassword(newPassword.trim());
    const newTokenVersion = (adminUser.token_version || 1) + 1;

    await db.execute(
      'UPDATE users SET password_hash = ?, token_version = ?, status = ? WHERE id = ?',
      [newHash, newTokenVersion, 'active', adminUser.id]
    );

    await AuditService.log({
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'user',
      entityId: adminUser.id,
      userId: adminUser.id,
      newValues: {
        email: adminEmail,
        tokenVersion: newTokenVersion,
      },
    });

    console.log(`[Auth] Super Admin password successfully reset for ${adminEmail} (sessions revoked)`);
    return { success: true, email: adminEmail };
  }

  /**
   * Seed / Ensure demo accounts and associated franchise structure exist in non-production.
   * Idempotent, non-destructive, and enforces real bcrypt password hashes.
   * STRICT SAFETY RULE: Must NEVER run in production and NEVER overwrite existing passwords.
   */
  static async seedDemoAccounts(dbInstance?: DatabaseAdapter): Promise<void> {
    // Demo accounts must NEVER be seeded in production
    if (env.NODE_ENV === 'production') {
      return;
    }

    const db = dbInstance || getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Ensure Super Admin exists
    await this.ensureSuperAdmin(db);

    // 2. Ensure Franchise Owner role exists
    const franchiseOwnerRole = await db.query<any>('SELECT id FROM roles WHERE code = ? LIMIT 1', ['franchise_owner']);
    let franchiseOwnerRoleId = franchiseOwnerRole[0]?.id || 'role_franchise_owner';
    if (!franchiseOwnerRole || franchiseOwnerRole.length === 0) {
      await db.execute(
        'INSERT INTO roles (id, name, code, description, is_system) VALUES (?, ?, ?, ?, ?)',
        ['role_franchise_owner', 'Franchise Owner', 'franchise_owner', 'Franchise administrative access', isSqlite ? 1 : true]
      );
      franchiseOwnerRoleId = 'role_franchise_owner';
    }

    // 3. Ensure Salem Franchise Organization & Profile exist
    const salemOrgId = 'org_salem_001';
    const existingOrg = await db.query<any>('SELECT id FROM organizations WHERE id = ? LIMIT 1', [salemOrgId]);
    if (existingOrg.length === 0) {
      await db.execute(
        `INSERT INTO organizations (id, code, name, type, status)
         VALUES (?, 'FRAN-SALEM-001', 'Salem Legal Solutions Pvt Ltd', 'franchise', 'active')`,
        [salemOrgId]
      );
    }

    const existingProfile = await db.query<any>('SELECT id FROM franchise_profiles WHERE organization_id = ? LIMIT 1', [salemOrgId]);
    if (existingProfile.length === 0) {
      await db.execute(
        `INSERT INTO franchise_profiles (
          id, organization_id, application_id, franchise_code, operating_name, legal_name,
          tax_id, contact_email, contact_phone, status, city, district, state, pin
        ) VALUES (?, ?, NULL, 'FRAN-SALEM-001', 'Salem Legal & Business Services Center', 'Salem Legal Solutions Pvt Ltd',
          '33AABCS1429B1Z8', 'owner.salem.a@demo.lbsc.internal', '+91 98765 43210', 'active', 'Salem', 'Salem', 'Tamil Nadu', '636001')`,
        ['prof_salem_001', salemOrgId]
      );
    }

    // 4. Ensure Commission Account exists for Salem Franchise
    const existingCommAcc = await db.query<any>(
      'SELECT id FROM franchise_commission_accounts WHERE organization_id = ? LIMIT 1',
      [salemOrgId]
    );
    if (existingCommAcc.length === 0) {
      await db.execute(
        `INSERT INTO franchise_commission_accounts (id, organization_id, current_balance, currency, version)
         VALUES (?, ?, 25000.0, 'INR', 1)`,
        [`comm_acc_${salemOrgId}`, salemOrgId]
      );
    }

    // 5. Ensure Franchise Owner user exists
    const ownerEmail = 'owner.salem.a@demo.lbsc.internal';
    const ownerUsers = await db.query<any>('SELECT id, password_hash FROM users WHERE email = ? LIMIT 1', [ownerEmail]);
    const ownerPasswordHash = await hashPassword('SalemPass123!');

    let ownerUserId = 'usr_franchise_owner_salem';
    if (ownerUsers.length === 0) {
      await db.execute(
        `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status, token_version)
         VALUES (?, ?, ?, ?, 'Salem', 'Owner', 'active', 1)`,
        [ownerUserId, salemOrgId, ownerEmail, ownerPasswordHash]
      );
    } else {
      ownerUserId = ownerUsers[0].id;
      if (!ownerUsers[0].organization_id) {
        await db.execute('UPDATE users SET organization_id = ? WHERE id = ?', [salemOrgId, ownerUserId]);
      }
      // Never overwrite an existing user's password!
      if (!ownerUsers[0].password_hash) {
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [ownerPasswordHash, ownerUserId]);
      }
    }

    // Map Franchise Owner role
    const ownerRoleMap = await db.query<any>(
      'SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1',
      [ownerUserId, franchiseOwnerRoleId]
    );
    if (ownerRoleMap.length === 0) {
      await db.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [ownerUserId, franchiseOwnerRoleId]);
    }

    // 6. Ensure default Service Masters exist if empty
    try {
      const serviceCount = await db.query<any>('SELECT COUNT(*) as c FROM service_masters');
      if (Number(serviceCount[0]?.c || 0) === 0) {
        const defaultServices = [
          {
            id: 'svc_gst_reg',
            categoryId: 'cat_registration',
            code: 'GST_REG',
            name: 'GST Registration',
            description: 'Complete new GST registration for proprietorship, partnership, and companies',
            fee: 1500,
            comm: 300,
            docs: JSON.stringify(['PAN Card', 'Aadhaar Card', 'Business Address Proof', 'Bank Statement']),
            days: 3,
            sla: 72,
          },
          {
            id: 'svc_pvt_ltd',
            categoryId: 'cat_registration',
            code: 'PVT_LTD_INC',
            name: 'Private Limited Company Incorporation',
            description: 'End-to-end company incorporation including SPICe+ form, DIN, PAN, TAN',
            fee: 7500,
            comm: 1500,
            docs: JSON.stringify(['PAN of Directors', 'ID & Address Proofs', 'Utility Bill for Registered Office', 'NOC']),
            days: 7,
            sla: 168,
          },
          {
            id: 'svc_itr_filing',
            categoryId: 'cat_taxation',
            code: 'ITR_FILING',
            name: 'Income Tax Return (ITR) Filing',
            description: 'Annual ITR filing for individuals, salaried, professionals, and small businesses',
            fee: 1000,
            comm: 250,
            docs: JSON.stringify(['Form 16', 'Bank Statements', 'Investment Proofs', 'Aadhaar & PAN']),
            days: 2,
            sla: 48,
          },
          {
            id: 'svc_tm_reg',
            categoryId: 'cat_legal',
            code: 'TM_REG',
            name: 'Trademark Registration',
            description: 'Brand name and logo trademark application filing under single class',
            fee: 4500,
            comm: 900,
            docs: JSON.stringify(['Logo Design', 'TM Authorization Form 48', 'Business Registration Document']),
            days: 4,
            sla: 96,
          },
          {
            id: 'svc_iso_cert',
            categoryId: 'cat_certifications',
            code: 'ISO_9001',
            name: 'ISO 9001:2015 Quality Certification',
            description: 'Quality Management Systems accreditation audit and certification',
            fee: 12000,
            comm: 2400,
            docs: JSON.stringify(['Company Profile', 'Scope of Operations', 'Process Documentation']),
            days: 10,
            sla: 240,
          },
        ];

        for (const svc of defaultServices) {
          await db.execute(
            `INSERT INTO service_masters (
              id, category_id, code, name, description, service_fee, commission_value,
              commission_notes, required_documents, turnaround_days, sla_hours, timeline_description, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Standard franchise commission', ?, ?, ?, 'Standard turnaround timeline', ${isSqlite ? 1 : 'TRUE'})`,
            [svc.id, svc.categoryId, svc.code, svc.name, svc.description, svc.fee, svc.comm, svc.docs, svc.days, svc.sla]
          );
        }
      }
    } catch {
      // Table might not exist yet if called before migrations
    }
  }
  /**
   * Resolve user with roles and permissions
   */
  static async getUserWithPermissions(userId: string): Promise<AuthenticatedUser | null> {
    const db = getDatabase();

    const users = await db.query<any>(
      `SELECT id, organization_id, email, first_name, last_name, status, token_version 
       FROM users 
       WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (!users || users.length === 0) {
      return null;
    }

    const user = users[0];

    // Fetch user's assigned roles
    const roles = await db.query<any>(
      `SELECT r.code 
       FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
      [userId]
    );

    const roleCodes = roles.map((r) => r.code);

    // Fetch user's associated permissions via their roles
    const permissions = await db.query<any>(
      `SELECT DISTINCT p.code
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`,
      [userId]
    );

    const permissionCodes = permissions.map((p) => p.code);

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      organizationId: user.organization_id,
      status: user.status,
      roles: roleCodes,
      permissions: permissionCodes,
      tokenVersion: user.token_version !== undefined && user.token_version !== null ? Number(user.token_version) : 1,
    };
  }

  /**
   * Authenticate user credentials and issue token
   */
  static async login(
    email: string,
    plainPassword: string,
    meta?: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const db = getDatabase();
    const normalizedEmail = email.toLowerCase().trim();

    let users = await db.query<any>(
      `SELECT id, organization_id, email, password_hash, first_name, last_name, status
       FROM users
       WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );

    // If super admin account is not found in database, self-heal by ensuring the initial super admin exists (safe in all environments)
    if ((!users || users.length === 0) && normalizedEmail === 'admin@lbsc.internal') {
      await this.ensureSuperAdmin(db);
      users = await db.query<any>(
        `SELECT id, organization_id, email, password_hash, first_name, last_name, status
         FROM users
         WHERE email = ? LIMIT 1`,
        [normalizedEmail]
      );
    }

    // If demo franchise account and not found in database, self-heal in non-production only
    if (
      env.NODE_ENV !== 'production' &&
      (!users || users.length === 0) &&
      normalizedEmail === 'owner.salem.a@demo.lbsc.internal'
    ) {
      await this.seedDemoAccounts(db);
      users = await db.query<any>(
        `SELECT id, organization_id, email, password_hash, first_name, last_name, status
         FROM users
         WHERE email = ? LIMIT 1`,
        [normalizedEmail]
      );
    }

    if (!users || users.length === 0) {
      await AuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: normalizedEmail,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        newValues: {
          email: normalizedEmail,
          reason: 'USER_NOT_FOUND',
        },
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    const userRecord = users[0];

    if (userRecord.status !== 'active') {
      await AuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: userRecord.id,
        organizationId: userRecord.organization_id,
        userId: userRecord.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        newValues: {
          email: normalizedEmail,
          reason: 'ACCOUNT_INACTIVE',
          status: userRecord.status,
        },
      });
      throw new UnauthorizedError(`Account is ${userRecord.status}. Please contact support.`);
    }

    if (!userRecord.password_hash) {
      await AuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: userRecord.id,
        organizationId: userRecord.organization_id,
        userId: userRecord.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        newValues: {
          email: normalizedEmail,
          reason: 'PASSWORD_NOT_CONFIGURED',
        },
      });
      throw new UnauthorizedError('Account password has not been configured.');
    }

    const isValid = await verifyPassword(plainPassword, userRecord.password_hash);
    if (!isValid) {
      await AuditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: userRecord.id,
        organizationId: userRecord.organization_id,
        userId: userRecord.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        newValues: {
          email: normalizedEmail,
          reason: 'INVALID_CREDENTIALS',
        },
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last_login_at
    await db.execute(
      `UPDATE users SET last_login_at = ${db.getDialect() === 'sqlite' ? "datetime('now')" : 'CURRENT_TIMESTAMP'} WHERE id = ?`,
      [userRecord.id]
    );

    const fullUser = await this.getUserWithPermissions(userRecord.id);
    if (!fullUser) {
      throw new UnauthorizedError('Failed to resolve authenticated user profile');
    }

    const token = generateToken({
      userId: fullUser.id,
      email: fullUser.email,
      organizationId: fullUser.organizationId,
      roles: fullUser.roles,
      permissions: fullUser.permissions,
      tokenVersion: fullUser.tokenVersion,
    });

    await AuditService.log({
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'user',
      entityId: userRecord.id,
      organizationId: userRecord.organization_id,
      userId: userRecord.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      newValues: {
        email: userRecord.email,
        roles: fullUser.roles,
      },
    });

    return {
      token,
      user: fullUser,
    };
  }

  /**
   * Register a user with an initial role (Foundation support)
   */
  static async register(
    params: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      organizationId?: string | null;
      roleCode?: string;
    },
    meta?: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const db = getDatabase();
    const email = params.email.toLowerCase().trim();

    // Check existing
    const existing = await db.query<any>('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length > 0) {
      throw new ConflictError('A user with this email already exists');
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const hashedPassword = await hashPassword(params.password);

    await db.execute(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status, token_version)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 1)`,
      [
        userId,
        params.organizationId || null,
        email,
        hashedPassword,
        params.firstName.trim(),
        params.lastName.trim(),
      ]
    );

    // Assign role if specified
    if (params.roleCode) {
      const roleRecords = await db.query<any>('SELECT id FROM roles WHERE code = ? LIMIT 1', [
        params.roleCode,
      ]);
      if (roleRecords.length > 0) {
        await db.execute(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [userId, roleRecords[0].id]
        );
      }
    }

    const fullUser = await this.getUserWithPermissions(userId);
    if (!fullUser) {
      throw new NotFoundError('Created user could not be retrieved');
    }

    const token = generateToken({
      userId: fullUser.id,
      email: fullUser.email,
      organizationId: fullUser.organizationId,
      roles: fullUser.roles,
      permissions: fullUser.permissions,
      tokenVersion: fullUser.tokenVersion,
    });

    await AuditService.log({
      action: 'AUTH_REGISTER',
      entityType: 'user',
      entityId: userId,
      organizationId: params.organizationId || null,
      userId,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      newValues: {
        email,
        firstName: params.firstName.trim(),
        lastName: params.lastName.trim(),
        roleCode: params.roleCode,
      },
    });

    return {
      token,
      user: fullUser,
    };
  }

  /**
   * Change user password and invalidate all previous active tokens by incrementing token_version
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const db = getDatabase();

    const users = await db.query<any>(
      'SELECT id, password_hash, token_version FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!users || users.length === 0) {
      throw new NotFoundError('User not found');
    }

    const user = users[0];
    if (!user.password_hash) {
      throw new UnauthorizedError('User does not have an existing password configured');
    }

    const isMatch = await verifyPassword(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    if (newPassword.length < 6) {
      throw new BadRequestError('New password must be at least 6 characters long');
    }

    const newHashedPassword = await hashPassword(newPassword);
    const isSqlite = db.getDialect() === 'sqlite';

    await db.execute(
      `UPDATE users
       SET password_hash = ?,
           token_version = COALESCE(token_version, 1) + 1,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [newHashedPassword, userId]
    );

    await AuditService.log({
      action: 'AUTH_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: userId,
      userId,
    });
  }

  /**
   * Reset user password (administrative or recovery) and invalidate existing tokens
   */
  static async resetPassword(userId: string, newPassword: string): Promise<void> {
    const db = getDatabase();

    const users = await db.query<any>(
      'SELECT id, token_version FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!users || users.length === 0) {
      throw new NotFoundError('User not found');
    }

    if (newPassword.length < 6) {
      throw new BadRequestError('New password must be at least 6 characters long');
    }

    const newHashedPassword = await hashPassword(newPassword);
    const isSqlite = db.getDialect() === 'sqlite';

    await db.execute(
      `UPDATE users
       SET password_hash = ?,
           token_version = COALESCE(token_version, 1) + 1,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [newHashedPassword, userId]
    );

    await AuditService.log({
      action: 'AUTH_PASSWORD_RESET',
      entityType: 'user',
      entityId: userId,
      userId,
    });
  }

  /**
   * Revoke user session and all issued tokens by incrementing token_version
   */
  static async revokeUserTokens(userId: string): Promise<number> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    await db.execute(
      `UPDATE users
       SET token_version = COALESCE(token_version, 1) + 1,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [userId]
    );

    await AuditService.log({
      action: 'AUTH_LOGOUT',
      entityType: 'user',
      entityId: userId,
      userId,
    });

    const rows = await db.query<any>(
      'SELECT token_version FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return rows[0]?.token_version ? Number(rows[0].token_version) : 2;
  }

  /**
   * Update user status (active, inactive, suspended) and invalidate sessions if deactivated
   */
  static async updateUserStatus(
    userId: string,
    newStatus: 'active' | 'inactive' | 'suspended',
    adminUser?: { id: string; organizationId?: string | null }
  ): Promise<void> {
    const db = getDatabase();
    const rows = await db.query<any>(
      'SELECT id, status, organization_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    const current = rows[0];
    const isSqlite = db.getDialect() === 'sqlite';

    // If deactivating or suspending, invalidate tokens immediately
    const shouldRevoke = newStatus !== 'active';
    await db.execute(
      `UPDATE users
       SET status = ?,
           token_version = ${shouldRevoke ? 'COALESCE(token_version, 1) + 1' : 'token_version'},
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [newStatus, userId]
    );

    await AuditService.log({
      action: 'USER_STATUS_CHANGED',
      entityType: 'user',
      entityId: userId,
      organizationId: current.organization_id,
      userId: adminUser?.id || null,
      oldValues: { status: current.status },
      newValues: { status: newStatus },
    });
  }
}
