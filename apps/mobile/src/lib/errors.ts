import * as Sentry from '@sentry/react-native'

// Crash + error reporting. Today a failed mutation surfaces as a Spanish toast
// and the underlying error goes to console.error, which nobody sees once the app
// is on someone else's phone — so a crash in Piantini on a Friday night is
// invisible. This is the fix.
//
// Env-gated like the rest: no DSN, no init, no network calls. Dev crashes stay
// in the terminal where they belong.
//
// Init runs at module scope so it is in place before the first render — import
// this module early (see src/app/_layout.tsx). Nothing else should import
// @sentry/react-native directly.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN

export const errorTrackingEnabled = Boolean(DSN)

if (DSN) {
  Sentry.init({
    dsn: DSN,
    // Mesa's own analytics live in PostHog; Sentry is here for crashes only.
    // sendDefaultPii would attach IP and request headers — we don't need it and
    // this app is used by a small, identifiable community.
    sendDefaultPii: false,
    // Errors are rare and valuable; traces are neither, at this size.
    tracesSampleRate: 0,
    environment: __DEV__ ? 'development' : 'production',
  })
}

/**
 * Report a caught error. Use where a failure is already handled for the member
 * (a toast) but we still want to know it happened — the toast tells them, this
 * tells us. `where` is a short, non-PII tag: 'rank.save', 'dish.upload'.
 */
export function captureError(error: unknown, where?: string): void {
  if (!DSN) return
  Sentry.captureException(error, where ? { tags: { where } } : undefined)
}

/**
 * Attach the signed-in user id to subsequent reports so a crash can be traced to
 * an account when someone tells us "it broke". Id only — no name, email or handle.
 */
export function setErrorUser(userId: string | null): void {
  if (!DSN) return
  Sentry.setUser(userId ? { id: userId } : null)
}
