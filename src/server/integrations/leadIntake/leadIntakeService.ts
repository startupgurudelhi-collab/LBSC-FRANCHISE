import crypto from 'crypto';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { getDatabase } from '../../db/connection.js';
import { AuditService } from '../../audit/auditService.js';
import { LeadDistributionService } from '../../leads/leadDistributionService.js';
import { LeadNormalizer } from './leadNormalizer.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from '../../errors/AppError.js';
import type {
  LeadWebhookPayload,
  LeadIntakeResult,
  LeadIntakeStatus,
} from './types.js';

export class LeadIntakeService {
  /**
   * Timing-safe string comparison to protect against timing attacks
   */
  private static safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Verifies incoming webhook request authentication:
   * - In production: strictly fails closed if LEAD_WEBHOOK_SECRET is not configured or missing.
   * - Supports header x-lead-webhook-secret, x-webhook-secret, or Authorization Bearer token.
   * - Supports HMAC-SHA256 signature verification via x-hub-signature-256 or x-signature-256.
   */
  static verifyWebhookAuth(req: Request): void {
    const configuredSecret = env.LEAD_WEBHOOK_SECRET ? env.LEAD_WEBHOOK_SECRET.trim() : '';

    // Production Fail-Closed Safeguard
    if (env.NODE_ENV === 'production' && configuredSecret.length === 0) {
      throw new ForbiddenError(
        'Lead intake webhook secret is not configured in production environment. Webhook access blocked.'
      );
    }

    // If a secret is configured, require valid header or HMAC signature
    if (configuredSecret.length > 0) {
      // 1. Direct Secret Token Header (x-lead-webhook-secret, x-webhook-secret, or Bearer token)
      const tokenHeader =
        (req.headers['x-lead-webhook-secret'] as string) ||
        (req.headers['x-webhook-secret'] as string) ||
        (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
          ? req.headers.authorization.replace('Bearer ', '').trim()
          : null);

      if (tokenHeader && this.safeCompare(tokenHeader, configuredSecret)) {
        return; // Valid direct secret
      }

      // 2. HMAC-SHA256 Signature Header (x-hub-signature-256 or x-signature-256)
      const signatureHeader =
        (req.headers['x-hub-signature-256'] as string) ||
        (req.headers['x-signature-256'] as string);

      if (signatureHeader) {
        const rawBody = JSON.stringify(req.body || {});
        const expectedSignature = `sha256=${crypto
          .createHmac('sha256', configuredSecret)
          .update(rawBody)
          .digest('hex')}`;

        if (this.safeCompare(signatureHeader, expectedSignature)) {
          return; // Valid HMAC signature
        }
      }

      // If neither secret nor signature matched, reject with 401 Unauthorized
      throw new UnauthorizedError('Invalid or missing lead intake webhook secret or signature');
    }

    // Development / Sandbox mode without secret configured: allowed with warning log
    if (env.NODE_ENV !== 'production' && configuredSecret.length === 0) {
      // Allowed for local sandbox testing
    }
  }

  /**
   * Main Webhook Processing Pipeline:
   * 1. Normalizes fields (phone, email, service code/slug, location, source).
   * 2. Checks durable idempotency/deduplication:
   *    - Checks explicit idempotency_key
   *    - Checks 24-hour composite (phone + service_id) deduplication window
   *    - If duplicate: returns existing lead response WITHOUT re-routing, consuming daily quota, or creating opportunities.
   * 3. Fresh lead: delegates to LeadDistributionService.ingestLead() and records idempotency record.
   */
  static async handleWebhook(
    payload: LeadWebhookPayload,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeadIntakeResult> {
    const db = getDatabase();
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Normalize payload
    const normalized = await LeadNormalizer.normalize(payload);

    // 2. Check for duplicate submission
    // A duplicate is identified if:
    // a) Identical idempotency_key exists in lead_intake_idempotency
    // b) Same normalized phone + service_id submitted within the last 24 hours
    const duplicateWindowSql = isSqlite
      ? `SELECT * FROM lead_intake_idempotency 
         WHERE idempotency_key = ? 
            OR (customer_phone_normalized = ? AND service_id = ? AND datetime(created_at) >= datetime('now', '-24 hours'))
         ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM lead_intake_idempotency 
         WHERE idempotency_key = ? 
            OR (customer_phone_normalized = ? AND service_id = ? AND created_at >= NOW() - INTERVAL '24 hours')
         ORDER BY created_at DESC LIMIT 1`;

    const existingDuplicates = await db.query<any>(duplicateWindowSql, [
      normalized.idempotencyKey,
      normalized.customerPhone,
      normalized.serviceId,
    ]);

    if (existingDuplicates.length > 0) {
      const existingRecord = existingDuplicates[0];

      // Retrieve existing lead details from distribution engine
      const existingLead = await LeadDistributionService.getLeadById(existingRecord.lead_id);

      if (existingLead) {
        // Record audit log for duplicate rejection
        await AuditService.log({
          action: 'LEAD_WEBHOOK_DUPLICATE_IGNORED',
          entityType: 'lead',
          entityId: existingLead.id,
          newValues: {
            source: normalized.source,
            sourceReference: normalized.sourceReference,
            customerName: existingLead.customer_name || normalized.customerName,
            serviceCode: normalized.serviceCode,
            serviceName: normalized.serviceName,
            idempotencyKey: normalized.idempotencyKey,
            customerPhone: normalized.customerPhone,
            serviceId: normalized.serviceId,
            matchedRecordId: existingRecord.id,
            originalLeadNumber: existingLead.lead_number,
            reason: 'Duplicate external lead detected within deduplication window. Prevented duplicate routing and quota consumption.',
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        });

        return {
          success: true,
          isDuplicate: true,
          message:
            'Duplicate lead detected within deduplication window. Processed idempotently without creating a new lead or consuming campaign slots.',
          lead: existingLead,
          idempotencyKey: existingRecord.idempotency_key,
          receivedAt: new Date().toISOString(),
        };
      }
    }

    // 3. Fresh Lead Processing:
    // Dispatch to the existing LeadDistributionService.ingestLead() flow
    const ingestResult = await LeadDistributionService.ingestLead(
      {
        source: normalized.source,
        sourceReference: normalized.sourceReference,
        customerName: normalized.customerName,
        customerPhone: normalized.customerPhone,
        customerEmail: normalized.customerEmail,
        serviceId: normalized.serviceId,
        city: normalized.city,
        district: normalized.district,
        state: normalized.state,
        pin: normalized.pin,
        address: normalized.address,
        notes: normalized.notes,
      },
      context
    );

    // 4. Record durable idempotency entry
    const idempotencyRecordId = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.execute(
      `INSERT INTO lead_intake_idempotency (
        id, idempotency_key, lead_id, source, source_reference,
        customer_phone_normalized, service_id, payload_hash, response_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idempotencyRecordId,
        normalized.idempotencyKey,
        ingestResult.lead.id,
        normalized.source,
        normalized.sourceReference,
        normalized.customerPhone,
        normalized.serviceId,
        normalized.payloadHash,
        'processed',
      ]
    );

    // 5. Audit log
    await AuditService.log({
      action: 'LEAD_WEBHOOK_INGESTED',
      entityType: 'lead',
      entityId: ingestResult.lead.id,
      newValues: {
        leadNumber: ingestResult.lead.lead_number,
        source: normalized.source,
        serviceCode: normalized.serviceCode,
        idempotencyKey: normalized.idempotencyKey,
        routingStatus: ingestResult.matchResult.status,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      success: true,
      isDuplicate: false,
      message:
        ingestResult.matchResult.status === 'offered'
          ? 'Lead ingested and offered to matching franchise campaign'
          : 'Lead ingested and routed to Own Lead Center',
      lead: ingestResult.lead,
      routing: ingestResult.matchResult,
      idempotencyKey: normalized.idempotencyKey,
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Safe phone masking helper (e.g. 98401****40)
   */
  private static maskPhone(phone?: string | null): string {
    if (!phone) return '*****';
    const clean = phone.replace(/\D/g, '');
    if (clean.length <= 6) return clean.substring(0, 2) + '****';
    return clean.substring(0, 3) + '****' + clean.substring(clean.length - 3);
  }

  /**
   * Retrieves intake gateway health, channel counts, and recent webhook activity
   */
  static async getStatus(): Promise<LeadIntakeStatus> {
    const db = getDatabase();

    const isSecretConfigured = Boolean(
      env.LEAD_WEBHOOK_SECRET && env.LEAD_WEBHOOK_SECRET.trim().length > 0
    );

    // 1. Overall counts
    const counts = await db.query<any>(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT lead_id) as total_unique_leads
      FROM lead_intake_idempotency
    `);

    const totalRecords = Number(counts[0]?.total_records || 0);
    const totalUniqueLeads = Number(counts[0]?.total_unique_leads || 0);

    // Duplicate attempts logged
    const dupAuditRows = await db.query<any>(`
      SELECT COUNT(*) as dup_cnt
      FROM audit_logs
      WHERE action = 'LEAD_WEBHOOK_DUPLICATE_IGNORED'
    `);
    const duplicateAttemptsPrevented = Math.max(
      Number(dupAuditRows[0]?.dup_cnt || 0),
      totalRecords - totalUniqueLeads
    );

    // 2. Channel volume breakdown
    const channelRows = await db.query<any>(`
      SELECT source, COUNT(*) as cnt
      FROM lead_intake_idempotency
      GROUP BY source
    `);

    let metaCount = 0;
    let googleCount = 0;
    let landingPageCount = 0;
    let otherCount = 0;

    for (const row of channelRows) {
      const s = (row.source || '').toLowerCase();
      const count = Number(row.cnt || 0);
      if (s.includes('meta') || s.includes('facebook') || s.includes('instagram')) {
        metaCount += count;
      } else if (s.includes('google')) {
        googleCount += count;
      } else if (s.includes('landing') || s.includes('lp') || s.includes('web')) {
        landingPageCount += count;
      } else {
        otherCount += count;
      }
    }

    // 3. Recent webhook intake activity (last 30 transactions)
    const recentIngestions = await db.query<any>(`
      SELECT 
        i.id,
        i.created_at,
        i.source,
        i.source_reference,
        i.customer_phone_normalized,
        i.idempotency_key,
        l.customer_name,
        l.lead_number,
        s.code as service_code,
        s.name as service_name
      FROM lead_intake_idempotency i
      LEFT JOIN leads l ON i.lead_id = l.id
      LEFT JOIN service_masters s ON i.service_id = s.id
      ORDER BY i.created_at DESC
      LIMIT 25
    `);

    // Fetch recent duplicate attempts from audit logs
    const recentDuplicates = await db.query<any>(`
      SELECT 
        id,
        created_at,
        new_values,
        entity_id
      FROM audit_logs
      WHERE action = 'LEAD_WEBHOOK_DUPLICATE_IGNORED'
      ORDER BY created_at DESC
      LIMIT 15
    `);

    const activityList: LeadIntakeStatus['recentActivity'] = [];

    // Map successful ingestions
    for (const item of recentIngestions) {
      activityList.push({
        id: item.id,
        timestamp: new Date(item.created_at).toISOString(),
        source: item.source || 'webhook',
        sourceReference: item.source_reference || null,
        customerPhoneMasked: this.maskPhone(item.customer_phone_normalized),
        customerName: item.customer_name || 'Customer',
        serviceCode: item.service_code || 'SERVICE',
        serviceName: item.service_name || 'Service',
        leadNumber: item.lead_number || null,
        status: 'processed',
        isDuplicate: false,
        idempotencyKey: item.idempotency_key,
      });
    }

    // Map duplicate prevention events
    for (const dup of recentDuplicates) {
      let parsedValues: any = {};
      try {
        parsedValues = typeof dup.new_values === 'string' ? JSON.parse(dup.new_values) : dup.new_values || {};
      } catch {
        parsedValues = {};
      }

      activityList.push({
        id: dup.id,
        timestamp: new Date(dup.created_at).toISOString(),
        source: parsedValues.source || 'webhook',
        sourceReference: parsedValues.sourceReference || null,
        customerPhoneMasked: this.maskPhone(parsedValues.customerPhone),
        customerName: parsedValues.customerName || 'Existing Lead Contact',
        serviceCode: parsedValues.serviceCode || 'SERVICE',
        serviceName: parsedValues.serviceName || 'Duplicate Inquiry',
        leadNumber: parsedValues.originalLeadNumber || null,
        status: 'duplicate_prevented',
        isDuplicate: true,
        duplicateReason: parsedValues.reason || 'Duplicate submission caught within 24h deduplication window',
        idempotencyKey: parsedValues.idempotencyKey || 'N/A',
      });
    }

    // Sort by timestamp descending
    activityList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      webhookSecretConfigured: isSecretConfigured,
      isProduction: env.NODE_ENV === 'production',
      totalIdempotencyRecords: totalRecords,
      totalUniqueLeadsIngested: totalUniqueLeads,
      duplicateAttemptsPrevented: duplicateAttemptsPrevented,
      statusMessage: isSecretConfigured
        ? 'Lead intake gateway is operational with active secret protection.'
        : env.NODE_ENV === 'production'
        ? 'ALERT: LEAD_WEBHOOK_SECRET is not configured in production. Webhooks fail closed.'
        : 'Lead intake gateway running in development/sandbox mode.',
      webhookEndpoint: '/api/v1/integrations/lead-intake/webhook',
      channels: {
        meta: metaCount,
        google: googleCount,
        landingPage: landingPageCount,
        other: otherCount,
        total: totalRecords,
      },
      recentActivity: activityList.slice(0, 30),
    };
  }
}
