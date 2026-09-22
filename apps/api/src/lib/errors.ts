import { PostHog } from 'posthog-node'

// Crash reporting for the API (M22 — replaces @sentry/bun). Env-gated and
// soft, same convention as GOOGLE_PLACES_API_KEY and every other optional
// integration here: unset POSTHOG_API_KEY means no reports, and the server
// boots and serves fine either way.
//
// Shares nothing with the mobile app's PostHog client (different process,
// different SDK) but reports into the same PostHog project, so a spike in
// API errors and a spike in app-side exceptions show up side by side.

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY

let client: PostHog | null = null

function getClient(): PostHog | null {
  if (!POSTHOG_API_KEY) return null
  // Same default region as the mobile client (src/lib/analytics.ts) — no
  // separate host override on the API side since nothing here has asked for
  // the EU region yet; add one the same way if that changes.
  if (!client) client = new PostHog(POSTHOG_API_KEY, { host: 'https://us.i.posthog.com' })
  return client
}

/**
 * Report a caught error. `props` is a short, non-PII context object — the
 * route and method are the whole diagnosis most of the time; a request URL
 * can carry ids but never credentials (auth goes through Better Auth's own
 * paths).
 */
export function captureApiError(err: unknown, props?: Record<string, string>): void {
  getClient()?.captureException(err, undefined, props)
}
