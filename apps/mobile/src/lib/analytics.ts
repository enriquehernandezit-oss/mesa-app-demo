import PostHog from 'posthog-react-native'

// Product analytics — the instrument that makes Mesa's loops measurable. Without
// it none of the growth work can be judged: k-factor, D30 by cohort, whether the
// rank flow is being abandoned mid-comparison.
//
// Env-gated like every other external service here (MapBox, Cloudinary, Google):
// with no key the whole module is a no-op, so the app runs identically and dev
// sessions never pollute production numbers.
//
// WHAT WE DO NOT SEND: names, handles, emails, phone numbers, vibe-note text,
// restaurant notes — nothing a person wrote and nothing that identifies them off
// this device. Events carry ids, counts and enums. `identify` sends the user id
// alone. If you find yourself adding a `name` property, stop.

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

export const analyticsEnabled = Boolean(KEY)

// The event vocabulary. A closed union so a typo is a compile error rather than
// a silently orphaned event nobody notices until the funnel looks wrong.
export type MesaEvent =
  // account
  | 'signed_up'
  | 'signed_in'
  | 'signed_out'
  | 'onboarding_completed'
  // the core loop
  | 'rank_started'
  | 'rank_placed'
  | 'rank_saved'
  | 'rank_abandoned'
  | 'place_saved'
  | 'place_unsaved'
  | 'dish_posted'
  // social
  | 'follow_added'
  | 'cheers_given'
  // discovery
  | 'search_performed'
  | 'trending_opened'
  // growth
  | 'share_opened'
  | 'share_card_created'

// No `undefined` — PostHog serializes to JSON, and an absent property is the
// honest way to say "not applicable" rather than sending a hole.
type Props = Record<string, string | number | boolean | null>

let client: PostHog | null = null

function getClient(): PostHog | null {
  if (!KEY) return null
  if (!client) {
    client = new PostHog(KEY, {
      host: HOST,
      // App open/close/update come for free and anchor every session.
      captureAppLifecycleEvents: true,
    })
  }
  return client
}

/** Warm the client at startup so the first real event isn't the one paying for init. */
export function initAnalytics(): void {
  getClient()
}

export function track(event: MesaEvent, props?: Props): void {
  getClient()?.capture(event, props)
}

/** Ties events to a stable id once a session exists. Id only — never a name. */
export function identifyUser(userId: string): void {
  getClient()?.identify(userId)
}

/** On sign-out: stop attributing this device's events to that person. */
export function resetAnalytics(): void {
  getClient()?.reset()
}

/** Screen views, driven by the router — see `useScreenTracking` in _layout. */
export function trackScreen(name: string): void {
  getClient()?.screen(name)
}
