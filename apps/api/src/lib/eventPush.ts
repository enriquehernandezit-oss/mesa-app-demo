// The rules for "a friend of yours is going" pushes. Pure (no database), so they are
// unit-tested in lib/eventPush.test.ts; routes/events.ts and lib/notify.ts use them.

// A follower hears about a given event at most once per window, however many of the people
// they follow sign up in it: the first friend to say "going" pushes, the next few hours of
// sign-ups stay quiet, and a later one can push again. Everything is still in Activity.
export const GOING_PUSH_WINDOW_MS = 6 * 60 * 60 * 1000

// push_log's throttle key for the follower's push: one per event per window. Claimed by
// lib/push.ts's buildEntries, which drops a message whose (user, key) it has already sent.
export function goingPushKey(eventId: string, now: Date): string {
  return `event-going:${eventId}:${Math.floor(now.getTime() / GOING_PUSH_WINDOW_MS)}`
}

// Activity's "friends going" rows, one per EVENT: the friend who signed up most recently, and
// how many others of the people you follow are going too — "Ana and 42 others are going to X".
// Without this, one popular event fills the whole list with a row per friend. `rows` are newest
// first, as the query returns them; the first row of each event stays, the rest are counted.
export function collapseEventGoing<R extends { eventId: string }>(
  rows: R[],
): (R & { others: number })[] {
  const byEvent = new Map<string, R & { others: number }>()
  for (const r of rows) {
    const seen = byEvent.get(r.eventId)
    if (seen) seen.others += 1
    else byEvent.set(r.eventId, { ...r, others: 0 })
  }
  return [...byEvent.values()]
}

const ASSUMED_LENGTH_MS = 3 * 60 * 60 * 1000

// Not over yet — the same rule as routes/events.ts's `notEnded` and the app's countdown:
// over once endsAt has passed or, with no endsAt, 3 hours after it started.
export function isUpcoming(e: { startsAt: Date; endsAt: Date | null }, now: Date): boolean {
  const end = e.endsAt ? e.endsAt.getTime() : e.startsAt.getTime() + ASSUMED_LENGTH_MS
  return end > now.getTime()
}
