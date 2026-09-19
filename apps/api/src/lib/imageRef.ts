import { z } from 'zod'

// The one rule for a user-supplied image value (dish photos, list covers).
// There is no signed Cloudinary upload yet, so the app sends a client-resized
// data-image URL (dev) or an https URL (prod / Cloudinary). Plain http and any
// other scheme are rejected so a stored value can't smuggle a tracking pixel
// or a javascript: href into others' feeds. Tighten to a bare Cloudinary
// public id once signed uploads are wired.

// ~700 KB cap on the inline data URL (a resized ~1280px JPEG lands well under).
export const MAX_IMAGE_CHARS = 700_000

export function isAllowedImageRef(s: string): boolean {
  return s.length <= MAX_IMAGE_CHARS && (s.startsWith('data:image/') || s.startsWith('https://'))
}

export const imageRefSchema = z
  .string()
  .refine(isAllowedImageRef, 'image must be a data URL (≤700 KB) or https URL')
