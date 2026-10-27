/**
 * LBSC Foundation Types
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorResponse;
  meta?: {
    timestamp: string;
    version: string;
    requestId?: string;
    pagination?: PaginationMeta;
  };
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DatabaseHealth {
  ok: boolean;
  dialect?: 'sqlite' | 'postgres';
  latencyMs?: number;
  activeMigrations?: number;
  lastMigration?: string;
  error?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptimeSeconds: number;
  timestamp: string;
  environment: string;
  version: string;
  database: DatabaseHealth;
}

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
  execution_time_ms: number;
}

export interface MigrationDefinition {
  id: string;
  name: string;
  up: (db: DatabaseAdapter) => Promise<void>;
  down?: (db: DatabaseAdapter) => Promise<void>;
}

export interface DatabaseTransaction {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
}

export interface DatabaseAdapter {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  batch(statements: string[]): Promise<void>;
  transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
  close(): Promise<void>;
  getDialect(): 'sqlite' | 'postgres';
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
