import { createHmac, timingSafeEqual } from 'node:crypto'

// Phone normalization + matching for the contacts find-friends feature
// (M18). Pure functions, no DB — shared by PUT/DELETE /me/phone (hashes the
// opted-in member's own number) and POST /social/contacts/match (hashes each
// number a member's device contacts offer up, in-request, never stored).
//
// Mesa's audience is Santo Domingo, so a bare 10-digit local number is
// assumed Dominican (809/829/849 + NANP's +1) unless it already carries a
// country code — the one geography-specific rule here.
const DR_AREA_CODES = ['809', '829', '849']

// Normalizes any of the forms a phone might show up in (typed with spaces/
// dashes/parens, a device contact's E.164, a DR local 10-digit number, with
// or without a leading 1) to E.164. Returns null for anything that can't be
// confidently normalized — callers skip those rather than guessing.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  if (digits.length === 0) return null

  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.length === 10 && DR_AREA_CODES.includes(digits.slice(0, 3))) {
    return `+1${digits}`
  }
  if (digits.length === 11 && digits[0] === '1' && DR_AREA_CODES.includes(digits.slice(1, 4))) {
    return `+${digits}`
  }
  // No country code and not a recognizable DR local number — too ambiguous
  // to guess a country for (this app has no other geography signal per
  // number), so it's left unnormalized rather than silently misfiled under
  // the wrong country.
  return null
}

// HMAC-SHA256, hex-encoded. The secret (PHONE_MATCH_SECRET) never leaves the
// server — a phone number is only ever comparable to another phone number
// that went through this exact function with the same secret, so a stolen
// hash can't be reversed or matched against a purchased number list without
// also having the secret.
export function hashPhone(e164: string, secret: string): string {
  return createHmac('sha256', secret).update(e164).digest('hex')
}

// Constant-time compare for the rare direct-hash-comparison caller — DB
// equality lookups (inArray) don't need this, but it's here so nothing ever
// reaches for `===` on a secret-derived hash by habit.
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}
