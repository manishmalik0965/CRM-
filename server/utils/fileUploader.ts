import path from 'path';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf'
];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export function validateFileUpload(
  filename: string,
  mimeType: string,
  sizeBytes: number
): { valid: boolean; reason?: string } {
  // Check size limit
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, reason: `File size exceeds the 50MB limit.` };
  }

  // Check anti-path-traversal
  const baseName = path.basename(filename);
  if (baseName !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, reason: `Invalid filename or path traversal detected.` };
  }

  // Check extension whitelist
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.pdf'];
  const ext = path.extname(filename).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, reason: `Unsupported file extension: ${ext}` };
  }

  // Check MIME type
  if (mimeType && !ALLOWED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return { valid: false, reason: `Invalid or untrusted MIME type: ${mimeType}` };
  }

  return { valid: true };
}
