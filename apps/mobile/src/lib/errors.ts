import { getClient } from '@/lib/analytics'

// Crash + error reporting, on the same PostHog client analytics.ts already
// owns (M22 — Sentry purged in favor of one vendor for both). Env-gated like
// the rest: no EXPO_PUBLIC_POSTHOG_KEY, no client, no network calls. Dev
// crashes stay in the terminal where they belong.
//
// The client is lazy (built on first use, in analytics.ts's getClient()), so
// unlike the old Sentry.init() this file has no module-scope side effect to
// import early — call sites work the moment they're reached, in whatever
// order.

/**
 * Report a caught error. Use where a failure is already handled for the member
 * (a toast) but we still want to know it happened — the toast tells them, this
 * tells us. `where` is a short, non-PII tag: 'rank.save', 'dish.upload'.
 */
export function captureError(error: unknown, where?: string): void {
  getClient()?.captureException(error, where ? { where } : undefined)
}

/**
 * Attach the signed-in user id to subsequent reports so a crash can be traced to
 * an account when someone tells us "it broke". Id only — no name, email or
 * handle. A no-op here: PostHog ties every capture (exceptions included) to
 * whatever id `identifyUser`/`resetAnalytics` (lib/analytics.ts) last set, so
 * there's no separate error-user identity to manage.
 */
export function setErrorUser(_userId: string | null): void {}
