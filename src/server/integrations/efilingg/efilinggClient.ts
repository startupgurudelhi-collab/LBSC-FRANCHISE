import { env } from '../../config/env.js';
import type { EfilinggIntegrationMode, EfilinggSyncResult } from './types.js';

export class EfilinggClient {
  /**
   * Returns current integration mode from environment configuration
   */
  static getMode(): EfilinggIntegrationMode {
    return (env.EFILINGG_MODE as EfilinggIntegrationMode) || 'SANDBOX';
  }

  /**
   * Check if client is configured with valid credentials
   */
  static isConfigured(): { apiUrl: boolean; apiKey: boolean; webhookSecret: boolean } {
    return {
      apiUrl: Boolean(env.EFILINGG_API_URL && env.EFILINGG_API_URL.trim().length > 0),
      apiKey: Boolean(env.EFILINGG_API_KEY && env.EFILINGG_API_KEY.trim().length > 0),
      webhookSecret: Boolean(env.EFILINGG_WEBHOOK_SECRET && env.EFILINGG_WEBHOOK_SECRET.trim().length > 0),
    };
  }

  /**
   * Core dispatch method.
   * STRICT SAFETY RULE: Does NOT invent or execute real third-party HTTP requests because
   * no validated Efilingg API specification/contract exists in this project.
   */
  static async pushApplication(applicationPayload: {
    applicationId: string;
    applicationNumber: string;
    serviceCode?: string;
    serviceName?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    documentsCount: number;
    customFields?: Record<string, any> | null;
  }): Promise<EfilinggSyncResult> {
    const mode = this.getMode();
    const nowIso = new Date().toISOString();

    // 1. DISABLED Mode
    if (mode === 'DISABLED') {
      return {
        success: false,
        mode: 'DISABLED',
        externalFilingId: null,
        arnNumber: null,
        srnNumber: null,
        challanNumber: null,
        status: 'FAILED',
        syncedAt: nowIso,
        error: 'Efilingg integration is currently DISABLED via configuration.',
        isSimulated: false,
        message: 'Integration is disabled. No external communication performed.',
      };
    }

    // 2. LIVE Mode Protection
    // Because no official Efilingg contract or API credentials exist yet, live mode refuses blind calls
    if (mode === 'LIVE') {
      const { apiUrl, apiKey } = this.isConfigured();
      if (!apiUrl || !apiKey) {
        return {
          success: false,
          mode: 'LIVE',
          externalFilingId: null,
          arnNumber: null,
          srnNumber: null,
          challanNumber: null,
          status: 'FAILED',
          syncedAt: nowIso,
          error: 'LIVE Efilingg integration blocked: EFILINGG_API_URL and EFILINGG_API_KEY must be provided with verified vendor contracts.',
          isSimulated: false,
          message: 'LIVE integration blocked: Vendor contract/credentials missing.',
        };
      }

      // If credentials exist but official spec is pending, safeguard from hallucinating routes
      return {
        success: false,
        mode: 'LIVE',
        externalFilingId: null,
        arnNumber: null,
        srnNumber: null,
        challanNumber: null,
        status: 'FAILED',
        syncedAt: nowIso,
        error: 'LIVE Efilingg API contract is not yet registered. System prevented unverified network dispatch.',
        isSimulated: false,
        message: 'Live dispatch held pending vendor endpoint contract registration.',
      };
    }

    // 3. SANDBOX / SIMULATED Mode
    // Clearly marked as simulated with deterministic identifiers
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const simulatedExternalId = `SIMULATED_EFIL_${applicationPayload.applicationNumber}`;
    const simulatedArn = `SIMULATED_ARN_${randomHex}`;
    const simulatedSrn = `SIMULATED_SRN_${randomHex}`;

    console.log(
      `[EFILINGG_INTEGRATION_SANDBOX] Simulated Efilingg dispatch for application ${applicationPayload.applicationNumber} ` +
        `(${applicationPayload.serviceName || 'Service'}). Assigned simulated external ID: ${simulatedExternalId}`
    );

    return {
      success: true,
      mode: 'SANDBOX',
      externalFilingId: simulatedExternalId,
      arnNumber: simulatedArn,
      srnNumber: simulatedSrn,
      challanNumber: null,
      status: 'SYNCED',
      syncedAt: nowIso,
      error: null,
      isSimulated: true,
      message: '[SANDBOX/SIMULATED] Application filing simulated successfully. No external API call made.',
    };
  }
}
