import { BadRequestError } from '../errors/AppError.js';
import type { UploadDocumentInput } from './types.js';

export const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'] as const;

export const UNSAFE_URL_SCHEMES = [
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'blob:',
  'ftp:',
  'about:',
] as const;

export interface SanitizedDocumentUpload {
  file_name: string;
  file_type: AllowedDocumentMimeType | null;
  file_size: number | null;
  file_url: string | null;
  file_data: string | null;
}

/**
 * Detect file MIME type by inspecting leading magic bytes in the decoded buffer.
 */
export function detectFileTypeFromMagicBytes(buffer: Buffer): AllowedDocumentMimeType | null {
  if (!buffer || buffer.length < 3) {
    return null;
  }

  // PDF: starts with %PDF (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // PNG: 8-byte signature 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return 'image/png';
  }

  // JPEG: starts with FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xFF &&
    buffer[1] === 0xD8 &&
    buffer[2] === 0xFF
  ) {
    return 'image/jpeg';
  }

  return null;
}

/**
 * Check if an external host is in the list of trusted document storage hosts
 * to prevent open / arbitrary external redirects.
 */
export function isAllowedDocumentHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();

  // Local development / loopback hosts
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  // RFC 2606 test domains
  if (host === 'example.com' || host.endsWith('.example.com')) {
    return true;
  }

  // App host from APP_URL if configured
  if (process.env.APP_URL) {
    try {
      const appUrlHost = new URL(process.env.APP_URL).hostname.toLowerCase();
      if (host === appUrlHost) {
        return true;
      }
    } catch {
      // Ignore invalid APP_URL
    }
  }

  // Trusted cloud storage & internal domains
  const trustedSuffixes = [
    'storage.googleapis.com',
    's3.amazonaws.com',
    'amazonaws.com',
    'blob.core.windows.net',
    'drive.google.com',
    'docs.google.com',
    'efilingg.com',
    'lbsc.in',
    'lbsc.internal',
  ];

  for (const suffix of trustedSuffixes) {
    if (host === suffix || host.endsWith('.' + suffix)) {
      return true;
    }
  }

  // Custom allowed domains configured via environment variable
  if (process.env.ALLOWED_DOCUMENT_DOMAINS) {
    const customList = process.env.ALLOWED_DOCUMENT_DOMAINS.split(',').map((d) => d.trim().toLowerCase());
    for (const custom of customList) {
      if (custom && (host === custom || host.endsWith('.' + custom))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate a document URL. Rejects unsafe schemes, arbitrary external redirects, and malformed URLs.
 */
export function validateDocumentUrl(url: string): string {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Reject protocol-relative URLs
  if (lower.startsWith('//')) {
    throw new BadRequestError('Protocol-relative URLs are not permitted for documents');
  }

  // Reject unsafe schemes explicitly
  for (const scheme of UNSAFE_URL_SCHEMES) {
    if (lower.startsWith(scheme)) {
      throw new BadRequestError(`Unsafe URL scheme detected: '${scheme}' is not permitted. Only http:// and https:// URLs are allowed.`);
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestError('Invalid file URL format');
  }

  // Must strictly be http or https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError(`Invalid file URL protocol '${parsed.protocol}': only http:// and https:// URLs are permitted`);
  }

  // Must have a valid hostname
  if (!parsed.hostname || parsed.hostname.trim() === '') {
    throw new BadRequestError('Invalid file URL: missing hostname');
  }

  // Verify destination is not an arbitrary untrusted host
  if (!isAllowedDocumentHost(parsed.hostname)) {
    throw new BadRequestError(
      `External document host '${parsed.hostname}' is not permitted. Only trusted document storage domains are allowed.`
    );
  }

  return parsed.toString();
}

/**
 * Validate a document URL before performing a redirect in the download endpoint.
 */
export function validateDocumentUrlForRedirect(url: string): string {
  return validateDocumentUrl(url);
}

/**
 * Validate base64 string, reject malformed payloads, and return decoded Buffer.
 */
export function validateAndDecodeBase64(rawBase64: string): Buffer {
  const clean = rawBase64.replace(/\s+/g, '');
  if (!clean || clean.length === 0) {
    throw new BadRequestError('Uploaded file data is empty');
  }

  // Pre-check maximum size from base64 string length to fail fast and prevent memory exhaustion
  // 5MB decoded requires at most ~6.99MB base64 chars
  const maxBase64Chars = Math.ceil((MAX_DOCUMENT_SIZE_BYTES * 4) / 3) + 4;
  if (clean.length > maxBase64Chars) {
    throw new BadRequestError(
      `File size exceeds maximum permitted limit of 5MB (${MAX_DOCUMENT_SIZE_BYTES} bytes)`
    );
  }

  // Strict base64 character and padding structure check
  // Length cannot have remainder 1 in base64 (a single 6-bit quantum is impossible)
  if (clean.length % 4 === 1) {
    throw new BadRequestError('Malformed base64 file data: invalid length');
  }

  // Linear, non-backtracking base64 regex to safely handle multi-megabyte payloads
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(clean)) {
    throw new BadRequestError('Malformed base64 file data: contains invalid characters or corrupt padding');
  }

  // If padded with '=', the total length must be a multiple of 4
  if (clean.includes('=') && clean.length % 4 !== 0) {
    throw new BadRequestError('Malformed base64 file data: invalid padding structure');
  }

  const buffer = Buffer.from(clean, 'base64');
  if (buffer.length === 0) {
    throw new BadRequestError('Uploaded file data is empty');
  }

  // Enforce size check on actual decoded bytes
  if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
    throw new BadRequestError(
      `Decoded file size (${buffer.length} bytes) exceeds maximum permitted limit of 5MB (${MAX_DOCUMENT_SIZE_BYTES} bytes)`
    );
  }

  // Verify padding integrity for strictly padded base64 strings
  if (clean.endsWith('=')) {
    const reEncoded = buffer.toString('base64');
    if (reEncoded !== clean) {
      throw new BadRequestError('Malformed base64 file data: corrupted padding or content');
    }
  }

  return buffer;
}

/**
 * Sanitize and validate uploaded document attributes:
 * - Reject unsafe file_url schemes and unapproved external redirects
 * - Enforce maximum 5MB size limit
 * - Allow only PDF, PNG, and JPEG
 * - Validate declared MIME and decoded magic bytes
 * - Reject malformed base64 and type mismatches
 * - Returns clean, sanitized payload
 */
export function validateAndSanitizeDocumentUpload(input: UploadDocumentInput): SanitizedDocumentUpload {
  if (!input) {
    throw new BadRequestError('Missing document upload payload');
  }

  // 1. Validate file_name
  if (!input.file_name || typeof input.file_name !== 'string' || input.file_name.trim().length === 0) {
    throw new BadRequestError('File name is required');
  }
  // Sanitize file_name: remove directory traversal paths and null bytes
  let cleanFileName = input.file_name.replace(/[\0\r\n]/g, '').trim();
  // Strip path segments
  const lastSlash = Math.max(cleanFileName.lastIndexOf('/'), cleanFileName.lastIndexOf('\\'));
  if (lastSlash >= 0) {
    cleanFileName = cleanFileName.slice(lastSlash + 1);
  }
  if (!cleanFileName || cleanFileName.length === 0) {
    cleanFileName = 'document';
  }
  if (cleanFileName.length > 255) {
    throw new BadRequestError('File name exceeds 255 characters limit');
  }

  // Check file extension if present
  const extMatch = cleanFileName.match(/\.([a-zA-Z0-9]+)$/);
  const fileExt = extMatch ? `.${extMatch[1].toLowerCase()}` : null;
  if (fileExt && !ALLOWED_EXTENSIONS.includes(fileExt as any)) {
    throw new BadRequestError(`Invalid file extension '${fileExt}': only .pdf, .png, .jpg, and .jpeg files are permitted`);
  }

  // 2. Validate declared file_size if present
  if (input.file_size !== undefined && input.file_size !== null) {
    if (typeof input.file_size !== 'number' || isNaN(input.file_size) || input.file_size < 0) {
      throw new BadRequestError('File size must be a non-negative integer');
    }
    if (input.file_size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestError(
        `Declared file size (${input.file_size} bytes) exceeds maximum permitted limit of 5MB (${MAX_DOCUMENT_SIZE_BYTES} bytes)`
      );
    }
  }

  // 3. Must provide either file_data or file_url
  const hasFileData = Boolean(input.file_data && typeof input.file_data === 'string' && input.file_data.trim().length > 0);
  const hasFileUrl = Boolean(input.file_url && typeof input.file_url === 'string' && input.file_url.trim().length > 0);

  if (!hasFileData && !hasFileUrl) {
    throw new BadRequestError('Either file_data or file_url must be provided for document upload');
  }

  let validatedUrl: string | null = null;
  if (hasFileUrl) {
    validatedUrl = validateDocumentUrl(input.file_url!);
  }

  // 4. Validate file_data if provided
  if (hasFileData) {
    const rawData = input.file_data!.trim();
    let dataUrlMime: string | null = null;
    let base64Payload = rawData;

    if (rawData.startsWith('data:')) {
      const dataUrlMatch = rawData.match(/^data:([a-zA-Z0-9/+-.]+)(?:;charset=[^;]+)?;base64,(.+)$/s);
      if (!dataUrlMatch) {
        throw new BadRequestError('Malformed data URL or missing base64 encoding in file_data');
      }
      dataUrlMime = dataUrlMatch[1].trim().toLowerCase();
      base64Payload = dataUrlMatch[2].trim();

      // Ensure data URL MIME is an allowed document type
      const normalizedDataUrlMime = dataUrlMime === 'image/jpg' || dataUrlMime === 'image/pjpeg' ? 'image/jpeg' : dataUrlMime;
      if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(normalizedDataUrlMime as any)) {
        throw new BadRequestError(`Invalid file type in data URL '${dataUrlMime}': only PDF, PNG, and JPEG documents are permitted`);
      }
    }

    // Decode and validate base64
    const buffer = validateAndDecodeBase64(base64Payload);

    // Enforce maximum size limit on decoded content
    if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestError(
        `Decoded file size (${buffer.length} bytes) exceeds maximum permitted limit of 5MB (${MAX_DOCUMENT_SIZE_BYTES} bytes)`
      );
    }

    // Magic bytes detection
    const detectedMime = detectFileTypeFromMagicBytes(buffer);
    if (!detectedMime) {
      throw new BadRequestError('Unsupported file content: file is not a valid PDF, PNG, or JPEG document');
    }

    // Validate declared file_type
    let declaredMime: string | null = null;
    if (input.file_type && typeof input.file_type === 'string' && input.file_type.trim().length > 0) {
      declaredMime = input.file_type.trim().toLowerCase();
      if (declaredMime === 'image/jpg' || declaredMime === 'image/pjpeg') {
        declaredMime = 'image/jpeg';
      }
      if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(declaredMime as any)) {
        throw new BadRequestError(`Unsupported file type '${input.file_type}': only PDF, PNG, and JPEG documents are allowed`);
      }

      if (declaredMime !== detectedMime) {
        throw new BadRequestError(`Mismatched file type: content detected as '${detectedMime}' but declared as '${input.file_type}'`);
      }
    }

    // Validate data URL MIME match if present
    if (dataUrlMime) {
      const normalizedDataUrlMime = dataUrlMime === 'image/jpg' || dataUrlMime === 'image/pjpeg' ? 'image/jpeg' : dataUrlMime;
      if (normalizedDataUrlMime !== detectedMime) {
        throw new BadRequestError(`Mismatched file type: content detected as '${detectedMime}' but data URL specified '${dataUrlMime}'`);
      }
    }

    // Validate extension match with detected content
    if (fileExt) {
      if (fileExt === '.pdf' && detectedMime !== 'application/pdf') {
        throw new BadRequestError(`Mismatched file type: file extension '.pdf' does not match content detected as '${detectedMime}'`);
      }
      if (fileExt === '.png' && detectedMime !== 'image/png') {
        throw new BadRequestError(`Mismatched file type: file extension '.png' does not match content detected as '${detectedMime}'`);
      }
      if ((fileExt === '.jpg' || fileExt === '.jpeg') && detectedMime !== 'image/jpeg') {
        throw new BadRequestError(`Mismatched file type: file extension '${fileExt}' does not match content detected as '${detectedMime}'`);
      }
    }

    return {
      file_name: cleanFileName,
      file_type: detectedMime,
      file_size: buffer.length,
      file_url: validatedUrl,
      file_data: `data:${detectedMime};base64,${base64Payload.replace(/\s+/g, '')}`,
    };
  }

  // URL-only document upload
  let urlMime: AllowedDocumentMimeType | null = null;
  if (input.file_type && typeof input.file_type === 'string' && input.file_type.trim().length > 0) {
    let norm = input.file_type.trim().toLowerCase();
    if (norm === 'image/jpg' || norm === 'image/pjpeg') norm = 'image/jpeg';
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(norm as any)) {
      throw new BadRequestError(`Unsupported file type '${input.file_type}': only PDF, PNG, and JPEG documents are allowed`);
    }
    urlMime = norm as AllowedDocumentMimeType;
  }

  return {
    file_name: cleanFileName,
    file_type: urlMime,
    file_size: input.file_size || null,
    file_url: validatedUrl,
    file_data: null,
  };
}
