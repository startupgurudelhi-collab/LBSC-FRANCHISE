import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env if present
dotenv.config();

export const DEV_DEFAULT_JWT_SECRET = 'lbsc-default-development-secret-key-change-in-production';
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

/**
 * Validates JWT_SECRET strictly for production environments.
 * Fails fast if secret is missing, too short (<32 chars), or equals the dev default.
 */
export function validateProductionJwtSecret(secret: string | undefined): void {
  if (!secret || secret.trim() === '') {
    throw new Error('JWT_SECRET is required and cannot be empty in production');
  }
  if (secret === DEV_DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET cannot use the development default value in production');
  }
  if (secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is too short for production: must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters long (got ${secret.length})`
    );
  }
}

/**
 * Validates CORS_ORIGIN strictly for production environments.
 * Rejects '*' (wildcard), empty string, or undefined in production.
 */
export function validateProductionCorsOrigin(origin: string | undefined): void {
  if (!origin || origin.trim() === '' || origin.trim() === '*') {
    throw new Error(
      "CORS_ORIGIN cannot be '*' (wildcard) or empty in production. An explicit configured frontend origin is required."
    );
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().optional().default('http://localhost:3000'),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().default('file:data/lbsc.db'),
  DATABASE_CLIENT: z.enum(['sqlite', 'postgres', 'auto']).default('auto'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  GEMINI_API_KEY: z.string().optional(),

  // Phase 19: Efilingg Integration Configuration
  EFILINGG_MODE: z.enum(['DISABLED', 'SANDBOX', 'LIVE']).default('SANDBOX'),
  EFILINGG_API_URL: z.string().optional().default(''),
  EFILINGG_API_KEY: z.string().optional().default(''),
  EFILINGG_WEBHOOK_SECRET: z.string().optional().default(''),

  // Phase 20: Lead Intake Gateway Configuration
  LEAD_WEBHOOK_SECRET: z.string().optional().default(''),

  // Phase 22F: Rate Limiting Configuration
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().default(30),
  RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce.number().default(60000),

  // Phase 23B: Background Scheduler Configuration
  ENABLE_BACKGROUND_SCHEDULER: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      }
      return val;
    }, z.boolean())
    .default(true),

  // Phase 23C.1: Multi-Channel Notification Delivery Configuration
  NOTIFICATION_WHATSAPP_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      }
      return val;
    }, z.boolean())
    .default(false),

  NOTIFICATION_SMS_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      }
      return val;
    }, z.boolean())
    .default(false),

  NOTIFICATION_EMAIL_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      }
      return val;
    }, z.boolean())
    .default(false),

  NOTIFICATION_PROVIDER_MODE: z.enum(['MOCK', 'LOG_ONLY', 'DISABLED']).default('MOCK'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): EnvConfig {
  const nodeEnv = (rawEnv.NODE_ENV || 'development').trim();

  // In production, strictly enforce strong, non-default JWT_SECRET with no static fallback
  // and validate non-wildcard CORS_ORIGIN if provided
  if (nodeEnv === 'production') {
    validateProductionJwtSecret(rawEnv.JWT_SECRET);
    if (rawEnv.CORS_ORIGIN !== undefined) {
      validateProductionCorsOrigin(rawEnv.CORS_ORIGIN);
    }
  }

  // In development and test, provide default fallback if unset
  const effectiveJwtSecret =
    rawEnv.JWT_SECRET && rawEnv.JWT_SECRET.trim() !== ''
      ? rawEnv.JWT_SECRET
      : nodeEnv === 'production'
        ? ''
        : DEV_DEFAULT_JWT_SECRET;

  const effectiveEnv = {
    ...rawEnv,
    JWT_SECRET: effectiveJwtSecret,
  };

  const result = envSchema.safeParse(effectiveEnv);
  if (!result.success) {
    console.error('❌ Environment configuration validation failed:');
    console.error(result.error.format());
    if (nodeEnv === 'production') {
      throw new Error(`Invalid production environment configuration: ${result.error.issues.map((i) => i.message).join(', ')}`);
    }
    return envSchema.parse({
      ...effectiveEnv,
      JWT_SECRET: DEV_DEFAULT_JWT_SECRET,
    });
  }
  return result.data;
}

export const env = parseEnv();
