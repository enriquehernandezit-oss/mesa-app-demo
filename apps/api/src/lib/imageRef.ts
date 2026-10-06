import { z } from 'zod'

import { R2_PUBLIC_BASE_URL } from './r2'

// The one rule for a user-supplied image value (dish photos, avatars,
// collection covers). Must be a URL under this project's own R2 public base —
// the only way to get one is POST /uploads' presigned PUT (see routes/uploads.ts),
// so this is a value-shape gate against a client sending an arbitrary URL
// (a tracking pixel, a javascript: href), not real authorization.
//
// No data: URL branch, on purpose: with no production users yet, there is no
// legacy row to keep accepting, and a second write path is exactly the kind
// of accidental complexity CLAUDE.md rules out. Root-relative seed paths and
// any URL already stored keep RENDERING fine client-side (media.ts) — this
// only gates what a NEW write accepts.
//
// `base` defaults to the real env value but is overridable so the test file
// can exercise both the accept and reject paths without depending on
// R2_PUBLIC_BASE_URL actually being set in the test environment.
export function isAllowedImageRef(s: string, base = R2_PUBLIC_BASE_URL): boolean {
  return Boolean(base) && s.startsWith(`${base}/`)
}

// Stronger than the shape gate above: the photo must be one THIS member uploaded. presignUpload keys
// every object under `u/<userId>/`, so a URL under anyone else's prefix (or under no member's, like
// `seed/` or a bucket path nobody issued) is refused — otherwise a member could attach another member's
// photo to their own dish, avatar or collection by guessing or scraping its URL.
export function isOwnImageRef(s: string, userId: string, base = R2_PUBLIC_BASE_URL): boolean {
  if (!base) return false
  const prefix = `${base}/u/${userId}/`
  if (!s.startsWith(prefix)) return false
  // Exactly what presignUpload mints — `<uuid>.jpg` — so a `..` segment, a nested path or a query
  // cannot walk out of the member's own folder once a client normalizes the URL.
  return /^[0-9a-f-]{36}\.jpg$/i.test(s.slice(prefix.length))
}

export const imageRefSchema = z.string().refine(isAllowedImageRef, 'image must be an uploaded URL')
