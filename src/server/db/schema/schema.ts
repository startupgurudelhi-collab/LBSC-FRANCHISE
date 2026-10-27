/**
 * LBSC Core Database Schema Definitions (TypeScript Interfaces)
 *
 * This represents the foundational data models. Future modules (campaigns, leads, commissions, etc.)
 * will link foreign keys to these core tables.
 */

export interface OrganizationModel {
  id: string;
  code: string;
  name: string;
  type: 'headquarters' | 'franchise' | 'branch' | 'partner';
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface UserModel {
  id: string;
  organization_id: string | null;
  email: string;
  password_hash: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: 'active' | 'invited' | 'suspended' | 'deactivated';
  token_version: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleModel {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface PermissionModel {
  id: string;
  code: string;
  category: string;
  description: string | null;
  created_at: string;
}

export interface UserRoleModel {
  user_id: string;
  role_id: string;
  assigned_at: string;
}

export interface RolePermissionModel {
  role_id: string;
  permission_id: string;
}

export interface AuditLogModel {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SystemSettingModel {
  id: string;
  organization_id: string | null;
  key: string;
  value: unknown;
  description: string | null;
  is_encrypted: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchemaMigrationModel {
  id: number;
  name: string;
  applied_at: string;
  execution_time_ms: number;
}
