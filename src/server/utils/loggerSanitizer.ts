/**
 * Server log sanitization utilities
 * Prevents leakage of credentials, tokens, secrets, connection strings,
 * authorization headers, and sensitive request data into server logs.
 */

const SENSITIVE_KEY_PATTERN = /^(password|passwd|secret|token|authorization|cookie|apiKey|api_key|credential|privateKey|private_key|credit_card|cvv|access_token|refresh_token)$/i;

const SENSITIVE_KEY_SUBSTRING_PATTERN = /(password|secret|token|apikey|credential|auth_header)/i;

/**
 * Sanitizes connection strings and raw text containing secrets.
 */
export function sanitizeLogString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  return (
    str
      // Sanitize Postgres/MySQL/MongoDB connection URIs: postgresql://user:pass@host:port/db
      .replace(
        /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s/]+)@/g,
        '$1$2:[REDACTED]@'
      )
      // Sanitize Bearer tokens: Bearer eyJhbGciOi...
      .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]')
      // Sanitize JWT token patterns: ey...ey...
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
      // Sanitize authorization headers in log lines: authorization: "Bearer ..."
      .replace(/(authorization|cookie)\s*[:=]\s*['"]?[^'",\s\n]+['"]?/gi, '$1: [REDACTED]')
      // Sanitize password/secret key-values in query strings or serialized JSON
      .replace(/(password|passwd|secret|apikey|token)\s*[:=]\s*['"]?[^'",\s\n]+['"]?/gi, '$1=[REDACTED]')
  );
}

/**
 * Recursively sanitizes arbitrary objects, headers, request bodies, or Errors for safe logging.
 */
export function sanitizeForLogging(data: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[TRUNCATED_DEPTH]';
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeLogString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeLogString(data.message),
      stack: data.stack ? sanitizeLogString(data.stack) : undefined,
      ...(typeof (data as any).code === 'string' ? { code: (data as any).code } : {}),
      ...(typeof (data as any).statusCode === 'number' ? { statusCode: (data as any).statusCode } : {}),
      details: (data as any).details ? sanitizeForLogging((data as any).details, depth + 1) : undefined,
    };
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key) || SENSITIVE_KEY_SUBSTRING_PATTERN.test(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitizedObj[key] = sanitizeForLogging(value, depth + 1);
      } else if (typeof value === 'string') {
        sanitizedObj[key] = sanitizeLogString(value);
      } else {
        sanitizedObj[key] = value;
      }
    }

    return sanitizedObj;
  }

  return String(data);
}
