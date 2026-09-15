import { getLanguage, t } from './i18n'

// Better Auth's errors, translated. Keyed on the stable `code`, never the
// message: the messages are English prose written by the library, and they
// were being rendered raw on screens that read otherwise. Codes are part of
// its API and survive wording changes; an unmapped one falls back to a plain
// sentence rather than leaking English (or, now, the wrong language).
//
// Codes verified against better-auth 1.6.25 (@better-auth/core error/codes and
// the phone-number plugin) — not guessed. The dictionaries themselves live in
// src/locales/{es,en}.ts under the `auth.*` namespace.

const KNOWN_CODES = new Set([
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_EMAIL',
  'INVALID_PASSWORD',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'USER_NOT_FOUND',
  'USER_EMAIL_NOT_FOUND',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_COMPROMISED',
  'EMAIL_NOT_VERIFIED',
  'CREDENTIAL_ACCOUNT_NOT_FOUND',
  'SESSION_EXPIRED',
  'SESSION_NOT_FRESH',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'EMAIL_ALREADY_VERIFIED',
  'PROVIDER_NOT_FOUND',
  'SOCIAL_ACCOUNT_ALREADY_LINKED',
  'ACCOUNT_NOT_FOUND',
  'INVALID_OTP',
  'OTP_EXPIRED',
  'OTP_NOT_FOUND',
  'TOO_MANY_ATTEMPTS',
  'INVALID_PHONE_NUMBER',
  'PHONE_NUMBER_EXIST',
])

// HTTP statuses worth naming on their own, when there is no code to key on.
// 429 is the one members will actually meet: the auth surface is rate limited
// per IP and per account (apps/api/src/lib/authThrottle.ts).
const KNOWN_STATUSES = new Set([429, 500, 502, 503])

// Better Auth's client returns { error: { code?, message?, status? } } rather
// than throwing, so callers pass that object straight in.
export function authErrorMessage(
  error: { code?: string; message?: string; status?: number } | null | undefined,
  fallback?: string,
): string {
  const lang = getLanguage()
  if (!error) return fallback ?? t(lang, 'auth.fallback')
  if (error.code && KNOWN_CODES.has(error.code)) {
    return t(lang, `auth.${error.code}` as Parameters<typeof t>[1])
  }
  if (error.status && KNOWN_STATUSES.has(error.status)) {
    return t(lang, `auth.status_${error.status}` as Parameters<typeof t>[1])
  }
  return fallback ?? t(lang, 'auth.fallback')
}
