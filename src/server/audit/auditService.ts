import { getDatabase } from '../db/connection.js';

export interface AuditEntry {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  static async log(entry: AuditEntry): Promise<void> {
    const db = getDatabase();
    const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const isSqlite = db.getDialect() === 'sqlite';

    try {
      await db.execute(
        `INSERT INTO audit_logs (
          id, organization_id, user_id, action, entity_type, entity_id,
          old_values, new_values, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.organizationId || null,
          entry.userId || null,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.oldValues ? JSON.stringify(entry.oldValues) : null,
          entry.newValues ? JSON.stringify(entry.newValues) : null,
          entry.ipAddress || null,
          entry.userAgent || null,
        ]
      );
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }

  static async getLogsForEntity(entityType: string, entityId: string): Promise<any[]> {
    const db = getDatabase();
    return db.query(
      `SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
      [entityType, entityId]
    );
  }
}
