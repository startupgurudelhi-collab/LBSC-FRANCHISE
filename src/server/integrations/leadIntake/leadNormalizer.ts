import crypto from 'crypto';
import { getDatabase } from '../../db/connection.js';
import { BadRequestError } from '../../errors/AppError.js';
import type { LeadWebhookPayload, NormalizedLeadData } from './types.js';

export class LeadNormalizer {
  /**
   * Normalizes customer phone number:
   * - Strips all non-numeric characters (+, spaces, hyphens, parentheses)
   * - Removes leading country code (+91 / 91) if 12 digits
   * - Removes leading 0 if 11 digits
   * - Validates minimum length
   */
  static normalizePhone(rawPhone?: string | null): string {
    if (!rawPhone || typeof rawPhone !== 'string') {
      throw new BadRequestError('Customer phone number is required');
    }

    let digits = rawPhone.replace(/\D/g, '');

    // Handle 12-digit Indian numbers starting with 91 (e.g., 919876543210 -> 9876543210)
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    }

    // Handle 11-digit numbers starting with 0 (e.g., 09876543210 -> 9876543210)
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    if (digits.length < 7 || digits.length > 15) {
      throw new BadRequestError(
        `Invalid customer phone number '${rawPhone}'. Must contain between 7 and 15 digits.`
      );
    }

    return digits;
  }

  /**
   * Normalizes customer email address
   */
  static normalizeEmail(rawEmail?: string | null): string | null {
    if (!rawEmail || typeof rawEmail !== 'string') {
      return null;
    }

    const trimmed = rawEmail.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }

    // Simple email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new BadRequestError(`Invalid email address format: '${rawEmail}'`);
    }

    return trimmed;
  }

  /**
   * Resolves service identifier (UUID, code, or slug/name) to an active service_masters record
   */
  static async resolveActiveService(payload: LeadWebhookPayload): Promise<{
    id: string;
    code: string;
    name: string;
  }> {
    const db = getDatabase();

    const rawService =
      payload.serviceId ||
      payload.service_id ||
      payload.serviceCode ||
      payload.service_code ||
      payload.serviceSlug ||
      payload.service_slug ||
      payload.serviceName ||
      payload.service_name;

    if (!rawService || typeof rawService !== 'string' || !rawService.trim()) {
      throw new BadRequestError(
        'Service identifier is required (provide serviceId, serviceCode, or serviceSlug)'
      );
    }

    const cleaned = rawService.trim();
    const lowerCleaned = cleaned.toLowerCase();
    const slugCleaned = lowerCleaned.replace(/[_\s]+/g, '-');

    // Query active service matching by ID, code, or name/slug
    const services = await db.query<any>(
      `SELECT id, code, name, is_active 
       FROM service_masters 
       WHERE (id = ? 
          OR code = ? 
          OR LOWER(code) = ? 
          OR LOWER(name) = ? 
          OR LOWER(REPLACE(name, ' ', '-')) = ? 
          OR LOWER(REPLACE(code, '_', '-')) = ?)
       LIMIT 1`,
      [cleaned, cleaned, lowerCleaned, lowerCleaned, slugCleaned, slugCleaned]
    );

    if (services.length === 0) {
      throw new BadRequestError(
        `No service found matching '${rawService}'. Please provide a valid active service code or ID.`
      );
    }

    const service = services[0];
    if (!service.is_active) {
      throw new BadRequestError(
        `Service '${service.name}' (${service.code}) is currently inactive and cannot accept leads.`
      );
    }

    return {
      id: service.id,
      code: service.code,
      name: service.name,
    };
  }

  /**
   * Normalizes and validates the complete external webhook payload
   */
  static async normalize(rawPayload: LeadWebhookPayload): Promise<NormalizedLeadData> {
    // 1. Customer Name
    const rawName =
      rawPayload.customerName ||
      rawPayload.name ||
      rawPayload.fullName ||
      rawPayload.full_name;

    if (!rawName || typeof rawName !== 'string' || rawName.trim().length < 2) {
      throw new BadRequestError('Customer name must be at least 2 characters');
    }
    const customerName = rawName.trim();

    // 2. Customer Phone
    const rawPhone =
      rawPayload.customerPhone ||
      rawPayload.phone ||
      rawPayload.phoneNumber ||
      rawPayload.phone_number;
    const customerPhone = this.normalizePhone(rawPhone);

    // 3. Customer Email
    const rawEmail = rawPayload.customerEmail || rawPayload.email;
    const customerEmail = this.normalizeEmail(rawEmail);

    // 4. Resolve Service
    const service = await this.resolveActiveService(rawPayload);

    // 5. Location details
    if (!rawPayload.city || typeof rawPayload.city !== 'string' || rawPayload.city.trim().length < 2) {
      throw new BadRequestError('City is required and must be at least 2 characters');
    }
    const city = rawPayload.city.trim();

    // District defaults to city if omitted (standard fallback for routing)
    const district =
      rawPayload.district && typeof rawPayload.district === 'string' && rawPayload.district.trim().length >= 2
        ? rawPayload.district.trim()
        : city;

    if (!rawPayload.state || typeof rawPayload.state !== 'string' || rawPayload.state.trim().length < 2) {
      throw new BadRequestError('State is required and must be at least 2 characters');
    }
    const state = rawPayload.state.trim();

    const pin = (rawPayload.pin || rawPayload.pincode)?.toString().trim() || null;
    const address = rawPayload.address?.trim() || null;
    const notes = rawPayload.notes?.trim() || null;

    // 6. Source & Attribution
    const source = (rawPayload.source || rawPayload.utm_source || 'lead_webhook')
      .toString()
      .trim()
      .toLowerCase();

    const sourceReference =
      rawPayload.sourceReference ||
      rawPayload.source_reference ||
      rawPayload.externalLeadId ||
      rawPayload.external_lead_id ||
      rawPayload.leadgen_id ||
      rawPayload.utm_campaign ||
      rawPayload.form_id ||
      null;

    // 7. Idempotency Key & Payload Hash
    const externalKey =
      rawPayload.idempotencyKey ||
      rawPayload.idempotency_key ||
      rawPayload.externalLeadId ||
      rawPayload.external_lead_id ||
      rawPayload.leadgen_id;

    let idempotencyKey: string;
    if (externalKey && typeof externalKey === 'string' && externalKey.trim().length > 0) {
      idempotencyKey = externalKey.trim();
    } else {
      // Deterministic fingerprint based on normalized phone, service, city, and date
      const hashInput = `${customerPhone}:${service.id}:${city.toLowerCase()}`;
      const fingerprint = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
      idempotencyKey = `idem_${customerPhone}_${service.code}_${fingerprint}`;
    }

    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rawPayload))
      .digest('hex');

    return {
      customerName,
      customerPhone,
      customerEmail,
      serviceId: service.id,
      serviceCode: service.code,
      serviceName: service.name,
      city,
      district,
      state,
      pin,
      address,
      notes,
      source,
      sourceReference: sourceReference ? sourceReference.trim() : null,
      idempotencyKey,
      payloadHash,
    };
  }
}
