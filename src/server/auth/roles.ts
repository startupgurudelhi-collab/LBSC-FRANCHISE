/**
 * Minimum LBSC System Roles & Permissions Definition
 */

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  FRANCHISE_OWNER: 'franchise_owner',
  FRANCHISE_STAFF: 'franchise_staff',
  AUDITOR: 'auditor',
} as const;

export type SystemRoleCode = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const SYSTEM_PERMISSIONS = {
  // Platform & system governance
  SYSTEM_MANAGE: 'system:manage',
  AUDIT_READ: 'audit:read',

  // Organization / Franchise governance
  ORG_READ: 'org:read',
  ORG_WRITE: 'org:write',
  ORG_MANAGE: 'org:manage',

  // User & Identity management
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_ROLES_MANAGE: 'user:roles:manage',

  // Protected feature foundations (for future modules)
  CAMPAIGNS_READ: 'campaigns:read',
  CAMPAIGNS_WRITE: 'campaigns:write',
  LEADS_READ: 'leads:read',
  LEADS_WRITE: 'leads:write',
  CLIENTS_READ: 'clients:read',
  CLIENTS_WRITE: 'clients:write',
  COMMISSIONS_READ: 'commissions:read',
  COMMISSIONS_MANAGE: 'commissions:manage',
} as const;

export type SystemPermissionCode = (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS];

export interface RoleSeedDefinition {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}

export const INITIAL_ROLES: RoleSeedDefinition[] = [
  {
    code: SYSTEM_ROLES.SUPER_ADMIN,
    name: 'Super Administrator',
    description: 'Unrestricted access to all organizations, users, and platform settings',
    isSystem: true,
    permissions: Object.values(SYSTEM_PERMISSIONS),
  },
  {
    code: SYSTEM_ROLES.FRANCHISE_OWNER,
    name: 'Franchise Owner',
    description: 'Full administrative access within their assigned franchise organization',
    isSystem: true,
    permissions: [
      SYSTEM_PERMISSIONS.ORG_READ,
      SYSTEM_PERMISSIONS.ORG_WRITE,
      SYSTEM_PERMISSIONS.USER_READ,
      SYSTEM_PERMISSIONS.USER_WRITE,
      SYSTEM_PERMISSIONS.CAMPAIGNS_READ,
      SYSTEM_PERMISSIONS.CAMPAIGNS_WRITE,
      SYSTEM_PERMISSIONS.LEADS_READ,
      SYSTEM_PERMISSIONS.LEADS_WRITE,
      SYSTEM_PERMISSIONS.CLIENTS_READ,
      SYSTEM_PERMISSIONS.CLIENTS_WRITE,
      SYSTEM_PERMISSIONS.COMMISSIONS_READ,
    ],
  },
  {
    code: SYSTEM_ROLES.FRANCHISE_STAFF,
    name: 'Franchise Staff',
    description: 'Operational access for franchise staff to view campaigns and handle leads',
    isSystem: true,
    permissions: [
      SYSTEM_PERMISSIONS.ORG_READ,
      SYSTEM_PERMISSIONS.CAMPAIGNS_READ,
      SYSTEM_PERMISSIONS.LEADS_READ,
      SYSTEM_PERMISSIONS.LEADS_WRITE,
      SYSTEM_PERMISSIONS.CLIENTS_READ,
      SYSTEM_PERMISSIONS.CLIENTS_WRITE,
    ],
  },
  {
    code: SYSTEM_ROLES.AUDITOR,
    name: 'Platform Auditor',
    description: 'Read-only access to audit logs, commissions, and organization compliance',
    isSystem: true,
    permissions: [
      SYSTEM_PERMISSIONS.AUDIT_READ,
      SYSTEM_PERMISSIONS.ORG_READ,
      SYSTEM_PERMISSIONS.CLIENTS_READ,
      SYSTEM_PERMISSIONS.COMMISSIONS_READ,
    ],
  },
];
