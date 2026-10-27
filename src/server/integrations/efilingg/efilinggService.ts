import { getDatabase } from '../../db/connection.js';
import { AuditService } from '../../audit/auditService.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import type { AuthenticatedUser as AuthUser } from '../../types/index.js';
import { EfilinggClient } from './efilinggClient.js';
import type {
  EfilinggIntegrationStatus,
  EfilinggSyncResult,
  EfilinggWebhookPayload,
  UpdateFilingReferencesInput,
} from './types.js';

export class EfilinggIntegrationService {
  /**
   * 1. Get Integration Configuration & Overall Health Status
   */
  static async getIntegrationStatus(): Promise<EfilinggIntegrationStatus> {
    const db = getDatabase();
    const mode = EfilinggClient.getMode();
    const config = EfilinggClient.isConfigured();

    const counts = await db.query<any>(`
      SELECT 
        COUNT(CASE WHEN external_filing_id IS NOT NULL THEN 1 END) as total_synced,
        COUNT(CASE WHEN arn_number IS NOT NULL THEN 1 END) as total_arn,
        COUNT(CASE WHEN srn_number IS NOT NULL THEN 1 END) as total_srn
      FROM service_applications
    `);

    const row = counts[0] || {};

    let statusMessage = '';
    if (mode === 'SANDBOX') {
      statusMessage = 'Integration running in SANDBOX/SIMULATED mode. Safe for local QA and workflow testing.';
    } else if (mode === 'DISABLED') {
      statusMessage = 'Efilingg integration is currently DISABLED in configuration.';
    } else {
      statusMessage = 'LIVE mode configured; real external dispatch requires vendor API registration.';
    }

    return {
      mode,
      apiUrlConfigured: config.apiUrl,
      apiKeyConfigured: config.apiKey,
      webhookSecretConfigured: config.webhookSecret,
      isLiveContractAvailable: false, // Explicit: No third-party contract invented
      totalSyncedApplications: Number(row.total_synced || 0),
      totalWithArn: Number(row.total_arn || 0),
      totalWithSrn: Number(row.total_srn || 0),
      statusMessage,
    };
  }

  /**
   * 2. Synchronize a Service Application with Efilingg Gateway
   * Safe foundation: Uses EfilinggClient (which refuses unverified live calls and operates cleanly in Sandbox).
   */
  static async syncApplication(
    applicationId: string,
    user: AuthUser
  ): Promise<{ syncResult: EfilinggSyncResult; updatedApplication: any }> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Fetch existing application with client, service, and document counts
    const appRows = await db.query<any>(
      `SELECT a.*,
              c.full_name as client_name, c.email as client_email, c.phone as client_phone,
              s.name as service_name, s.code as service_code,
              (SELECT COUNT(*) FROM service_application_documents d WHERE d.application_id = a.id AND d.status = 'VERIFIED') as verified_docs_count,
              (SELECT COUNT(*) FROM service_application_documents d WHERE d.application_id = a.id) as total_docs_count
       FROM service_applications a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN service_masters s ON s.id = a.service_id
       WHERE a.id = ?
       LIMIT 1`,
      [applicationId]
    );

    if (appRows.length === 0) {
      throw new NotFoundError(`Service application '${applicationId}' not found`);
    }

    const app = appRows[0];

    // Multi-tenant check: Franchise callers can only sync their own applications
    const isSuper = user.roles.includes('super_admin');
    if (!isSuper && app.franchise_id !== user.organizationId) {
      throw new BadRequestError('Access denied: Cannot sync applications belonging to another organization');
    }

    // Parse custom fields if present
    let customFields: Record<string, any> | null = null;
    if (app.custom_fields) {
      try {
        customFields = typeof app.custom_fields === 'string' ? JSON.parse(app.custom_fields) : app.custom_fields;
      } catch {
        customFields = null;
      }
    }

    // 2. Dispatch to Client Abstraction
    const syncResult = await EfilinggClient.pushApplication({
      applicationId: app.id,
      applicationNumber: app.application_number,
      serviceCode: app.service_code,
      serviceName: app.service_name,
      clientName: app.client_name,
      clientEmail: app.client_email,
      clientPhone: app.client_phone,
      documentsCount: Number(app.verified_docs_count || 0),
      customFields,
    });

    const nowIso = new Date().toISOString();

    // 3. Update database record with sync status and references
    if (syncResult.success) {
      await db.execute(
        `UPDATE service_applications
         SET external_filing_id = COALESCE(?, external_filing_id),
             arn_number = COALESCE(?, arn_number),
             srn_number = COALESCE(?, srn_number),
             challan_number = COALESCE(?, challan_number),
             efilingg_status = ?,
             efilingg_synced_at = ?,
             efilingg_sync_error = NULL,
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ?`,
        [
          syncResult.externalFilingId,
          syncResult.arnNumber,
          syncResult.srnNumber,
          syncResult.challanNumber,
          syncResult.status,
          nowIso,
          applicationId,
        ]
      );

      // Record operational note
      const noteId = `wn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await db.execute(
        `INSERT INTO service_application_work_notes (
          id, application_id, author_user_id, note_type, note, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, 'integration_sync', ?, ?, ?, ?)`,
        [
          noteId,
          applicationId,
          user.id,
          syncResult.isSimulated
            ? `[SANDBOX/SIMULATED] Efilingg sync completed. External ID: ${syncResult.externalFilingId}, ARN: ${syncResult.arnNumber || 'N/A'}`
            : `Efilingg sync completed. External ID: ${syncResult.externalFilingId}`,
          JSON.stringify(syncResult),
          nowIso,
          nowIso,
        ]
      );

      // Audit Log
      await AuditService.log({
        userId: user.id,
        organizationId: app.franchise_id,
        action: 'EFILINGG_SYNC_SUCCESS',
        entityType: 'SERVICE_APPLICATION',
        entityId: applicationId,
        oldValues: {
          efilingg_status: app.efilingg_status,
          external_filing_id: app.external_filing_id,
        },
        newValues: {
          efilingg_status: syncResult.status,
          external_filing_id: syncResult.externalFilingId,
          arn_number: syncResult.arnNumber,
          isSimulated: syncResult.isSimulated,
        },
      });
    } else {
      // Record failed sync attempt
      await db.execute(
        `UPDATE service_applications
         SET efilingg_status = 'FAILED',
             efilingg_sync_error = ?,
             updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
         WHERE id = ?`,
        [syncResult.error || 'Unknown integration error', applicationId]
      );

      await AuditService.log({
        userId: user.id,
        organizationId: app.franchise_id,
        action: 'EFILINGG_SYNC_FAILED',
        entityType: 'SERVICE_APPLICATION',
        entityId: applicationId,
        oldValues: { efilingg_status: app.efilingg_status },
        newValues: { efilingg_status: 'FAILED', error: syncResult.error },
      });
    }

    // 4. Return fresh record
    const updatedRows = await db.query<any>('SELECT * FROM service_applications WHERE id = ? LIMIT 1', [applicationId]);
    return {
      syncResult,
      updatedApplication: updatedRows[0],
    };
  }

  /**
   * 3. Manually Update Filing References (ARN, SRN, Challan, External Status)
   * Essential operations method when government portal generates numbers directly or offline.
   */
  static async updateFilingReferences(
    applicationId: string,
    input: UpdateFilingReferencesInput,
    user: AuthUser
  ): Promise<any> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    const appRows = await db.query<any>('SELECT * FROM service_applications WHERE id = ? LIMIT 1', [applicationId]);
    if (appRows.length === 0) {
      throw new NotFoundError(`Service application '${applicationId}' not found`);
    }
    const app = appRows[0];

    const updates: string[] = [];
    const params: any[] = [];

    if (input.arn_number !== undefined) {
      updates.push('arn_number = ?');
      params.push(input.arn_number ? input.arn_number.trim() : null);
    }
    if (input.srn_number !== undefined) {
      updates.push('srn_number = ?');
      params.push(input.srn_number ? input.srn_number.trim() : null);
    }
    if (input.challan_number !== undefined) {
      updates.push('challan_number = ?');
      params.push(input.challan_number ? input.challan_number.trim() : null);
    }
    if (input.efilingg_status !== undefined) {
      updates.push('efilingg_status = ?');
      params.push(input.efilingg_status ? input.efilingg_status.trim() : null);
    }

    if (updates.length === 0) {
      return app;
    }

    const nowIso = new Date().toISOString();
    updates.push(`updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`);
    params.push(applicationId);

    await db.execute(`UPDATE service_applications SET ${updates.join(', ')} WHERE id = ?`, params);

    // Record work note
    const noteId = `wn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const noteBody = input.notes || 'Government filing references updated manually.';
    await db.execute(
      `INSERT INTO service_application_work_notes (
        id, application_id, author_user_id, note_type, note, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, 'filing_reference_update', ?, ?, ?, ?)`,
      [
        noteId,
        applicationId,
        user.id,
        noteBody,
        JSON.stringify({
          arn_number: input.arn_number,
          srn_number: input.srn_number,
          challan_number: input.challan_number,
          efilingg_status: input.efilingg_status,
        }),
        nowIso,
        nowIso,
      ]
    );

    // Audit Log
    await AuditService.log({
      userId: user.id,
      organizationId: app.franchise_id,
      action: 'FILING_REFERENCES_UPDATED',
      entityType: 'SERVICE_APPLICATION',
      entityId: applicationId,
      oldValues: {
        arn_number: app.arn_number,
        srn_number: app.srn_number,
        challan_number: app.challan_number,
        efilingg_status: app.efilingg_status,
      },
      newValues: {
        arn_number: input.arn_number ?? app.arn_number,
        srn_number: input.srn_number ?? app.srn_number,
        challan_number: input.challan_number ?? app.challan_number,
        efilingg_status: input.efilingg_status ?? app.efilingg_status,
      },
    });

    const refreshed = await db.query<any>('SELECT * FROM service_applications WHERE id = ? LIMIT 1', [applicationId]);
    return refreshed[0];
  }

  /**
   * 4. Inbound Webhook Event Handler
   * Securely consumes external filing events from Efilingg
   */
  static async handleWebhook(
    payload: EfilinggWebhookPayload
  ): Promise<{ success: boolean; message: string; applicationId?: string }> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    if (!payload.externalFilingId && !payload.applicationNumber) {
      throw new BadRequestError('Webhook payload must provide externalFilingId or applicationNumber');
    }

    // Locate target application
    let query = 'SELECT * FROM service_applications WHERE ';
    const params: any[] = [];
    if (payload.externalFilingId && payload.applicationNumber) {
      query += '(external_filing_id = ? OR application_number = ?) LIMIT 1';
      params.push(payload.externalFilingId, payload.applicationNumber);
    } else if (payload.externalFilingId) {
      query += 'external_filing_id = ? LIMIT 1';
      params.push(payload.externalFilingId);
    } else {
      query += 'application_number = ? LIMIT 1';
      params.push(payload.applicationNumber);
    }

    const appRows = await db.query<any>(query, params);
    if (appRows.length === 0) {
      throw new NotFoundError(
        `No application found matching externalFilingId='${payload.externalFilingId}' or applicationNumber='${payload.applicationNumber}'`
      );
    }

    const app = appRows[0];
    const nowIso = new Date().toISOString();

    const updates: string[] = ['efilingg_status = ?'];
    const updateParams: any[] = [payload.status];

    if (payload.arnNumber) {
      updates.push('arn_number = ?');
      updateParams.push(payload.arnNumber);
    }
    if (payload.srnNumber) {
      updates.push('srn_number = ?');
      updateParams.push(payload.srnNumber);
    }
    if (payload.challanNumber) {
      updates.push('challan_number = ?');
      updateParams.push(payload.challanNumber);
    }

    updates.push(`updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`);
    updateParams.push(app.id);

    await db.execute(`UPDATE service_applications SET ${updates.join(', ')} WHERE id = ?`, updateParams);

    // Record webhook work note
    let authorUserId = app.submitted_by_user_id || app.created_by_user_id || app.assigned_to_user_id;
    if (!authorUserId) {
      const userRows = await db.query<any>('SELECT id FROM users LIMIT 1');
      authorUserId = userRows[0]?.id;
    }

    if (authorUserId) {
      const noteId = `wn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await db.execute(
        `INSERT INTO service_application_work_notes (
          id, application_id, author_user_id, note_type, note, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, 'webhook_callback', ?, ?, ?, ?)`,
        [
          noteId,
          app.id,
          authorUserId,
          `Webhook callback received: Event '${payload.event}', Status '${payload.status}'`,
          JSON.stringify(payload),
          nowIso,
          nowIso,
        ]
      );
    }

    // Audit log
    await AuditService.log({
      userId: authorUserId,
      organizationId: app.franchise_id,
      action: 'EFILINGG_WEBHOOK_PROCESSED',
      entityType: 'SERVICE_APPLICATION',
      entityId: app.id,
      newValues: {
        event: payload.event,
        status: payload.status,
        arn_number: payload.arnNumber,
        srn_number: payload.srnNumber,
      },
    });

    return {
      success: true,
      message: `Webhook event '${payload.event}' processed for application ${app.application_number}`,
      applicationId: app.id,
    };
  }
}
