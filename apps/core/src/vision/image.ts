const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageValidationOptions {
  maxBytes: number;
}

export function validateImage(
  buffer: Buffer,
  mimeType: string,
  options: ImageValidationOptions,
): { valid: true } | { valid: false; reason: string } {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, reason: `Unsupported image type: ${mimeType}. Allowed: JPEG, PNG, WebP` };
  }
  if (buffer.length === 0) {
    return { valid: false, reason: "Image is empty" };
  }
  if (buffer.length > options.maxBytes) {
    return {
      valid: false,
      reason: `Image too large (${(buffer.length / 1_048_576).toFixed(1)} MB). Max: ${(options.maxBytes / 1_048_576).toFixed(1)} MB`,
    };
  }
  return { valid: true };
}
