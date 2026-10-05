import { db, schema } from '@mesa/db'
import { and, eq, gt, inArray, isNull, lt, lte, notExists, sql } from 'drizzle-orm'

import { notifyNow } from './notify'
import { reminderCopy } from './notifyCopy'
import { checkReceipts, pushEnabled, sendPush } from './push'
import { sdHour } from './sdTime'

const { dishLists, dishes, events, eventRsvps, notifications, pushLog, user } = schema

// The background sweeps behind the bell and the pushes that no write triggers — a timer
// crossing a threshold, or an event cancelled by a direct SQL update. Started once from
// index.ts. The two that write inbox rows (dish nudges, cancellations) run everywhere,
// with or without EXPO_ACCESS_TOKEN; only the pushes themselves need the token.

// 2 minutes, not 10 (M17's original interval) — event reminders (M22) include
// an "at start" offset, and a 10-minute tick could land it up to 9 minutes
// late. The sweeps are a handful of indexed queries, so the tighter interval costs
// nothing.
const SWEEP_INTERVAL_MS = 2 * 60 * 1000

// Every 2 minutes: check Expo receipts for dead tokens, notify any dish list that's crossed
// the ~20h due mark (sweepDishNudges gates its own 11:00–21:00 Santo Domingo send window,
// so most ticks in a day find nothing due there), and fire any due event reminder or
// cancellation notice.
export function startPushSweep(): void {
  setInterval(() => {
    checkReceipts().catch((err) => console.error('push sweep failed', err))
    sweepDishNudges().catch((err) => console.error('dish nudge sweep failed', err))
    sweepEventReminders().catch((err) => console.error('event reminder sweep failed', err))
    sweepEventCancellations().catch((err) => console.error('event cancellation sweep failed', err))
  }, SWEEP_INTERVAL_MS)
}

// M20's repeat-dish nudge: a dish_lists row created by routes/dishes.ts's
// POST handler (a member has posted the same dish at 3+ restaurants) that's
// still unranked and undismissed ~20h later gets ONE notification. Sent only in the
// 11:00–21:00 Santo Domingo window so a list that turns due overnight waits for morning
// instead of buzzing someone at 3am.
const DUE_AFTER_MS = 20 * 60 * 60 * 1000
const SEND_WINDOW = { start: 11, end: 21 }

export async function sweepDishNudges(): Promise<void> {
  const hour = sdHour()
  if (hour < SEND_WINDOW.start || hour >= SEND_WINDOW.end) return

  const due = await db
    .select({
      id: dishLists.id,
      userId: dishLists.userId,
      label: dishLists.label,
      restaurantCount: sql<number>`count(${dishes.id})::int`,
    })
    .from(dishLists)
    .innerJoin(
      dishes,
      and(
        eq(dishes.userId, dishLists.userId),
        eq(dishes.nameKey, dishLists.nameKey),
        isNull(dishes.removedAt),
      ),
    )
    .where(
      and(
        isNull(dishLists.rankedAt),
        isNull(dishLists.dismissedAt),
        isNull(dishLists.pushedAt),
        lt(dishLists.createdAt, new Date(Date.now() - DUE_AFTER_MS)),
      ),
    )
    .groupBy(dishLists.id)
    .limit(200)
  if (due.length === 0) return

  // Awaited (unlike a write path's notify): if the insert throws, pushedAt below is not set
  // and the next tick tries again.
  await notifyNow(
    due.map((d) => ({
      userId: d.userId,
      kind: 'dish_nudge' as const,
      dedupeKey: `dish_nudge:${d.id}:${d.restaurantCount}`,
      dishListId: d.id,
      data: { label: d.label, count: d.restaurantCount },
    })),
  )
  // pushedAt is this sweep's own "don't reconsider next tick" flag (the due query above
  // already filters on it), separate from the inbox row's own dedupe.
  await db
    .update(dishLists)
    .set({ pushedAt: new Date() })
    .where(
      inArray(
        dishLists.id,
        due.map((d) => d.id),
      ),
    )
}

// Reminders for an event you've RSVP'd 'going' to (M22): 24h, 3h, 2h and at
// start. Push-only — a reminder is not something to look back at, so it never becomes an
// inbox row. Each offset is its own push_log key (`event-reminder:{id}:{ms}`), so all four
// fire independently and none re-fires on a later tick.
//
// Deliberately NO quiet-hours window (contrast sweepDishNudges' 11:00–21:00):
// "at start" for a 10pm event has to mean 10pm.
//
// `startsAt` due within `offsetMs` of now, but not further than
// REMINDER_GRACE_MS past that threshold — the grace bound keeps a long sweep
// outage (a crash-looping deploy, say) from blasting out every stale offset
// at once when the sweep comes back, rather than requiring precise
// tick-to-tick window math tied to the sweep interval.
const REMINDER_OFFSETS_MS = [24 * 3600_000, 3 * 3600_000, 2 * 3600_000, 0]
const REMINDER_GRACE_MS = 30 * 60_000

// The people due a reminder at this offset: RSVP'd going, the event starting within `offsetMs` but
// not more than the grace period past it, and not already reminded (their push_log row is the
// record). Up to 500 per call; claimed people drop out, so the next tick takes the next 500.
export async function dueReminders(offsetMs: number, nowDate: Date) {
  const now = nowDate.getTime()
  const threshold = new Date(now + offsetMs)
  const graceFloor = new Date(now + offsetMs - REMINDER_GRACE_MS)
  return db
    .select({ eventId: events.id, userId: eventRsvps.userId, title: events.title })
    .from(eventRsvps)
    .innerJoin(events, eq(events.id, eventRsvps.eventId))
    .where(
      and(
        eq(eventRsvps.status, 'going'),
        isNull(events.cancelledAt),
        lte(events.startsAt, threshold),
        gt(events.startsAt, graceFloor),
        // Not people already reminded at this offset. Without this, every 2-minute tick re-read
        // the same first 500 rows (already pushed, no ORDER BY), so anyone past the 500th RSVP
        // to a popular event never got a reminder. A person who was claimed drops out here, so
        // the next tick moves on to the next 500 (the cancellation sweep below does the same).
        notExists(
          db
            .select({ one: sql`1` })
            .from(pushLog)
            .where(
              and(
                eq(pushLog.userId, eventRsvps.userId),
                eq(
                  pushLog.key,
                  sql`'event-reminder:' || ${events.id}::text || ':' || ${offsetMs}::text`,
                ),
              ),
            ),
        ),
      ),
    )
    .limit(500)
}

export async function sweepEventReminders(): Promise<void> {
  if (!pushEnabled()) return
  const now = Date.now()

  for (const offsetMs of REMINDER_OFFSETS_MS) {
    const due = await dueReminders(offsetMs, new Date(now))
    if (due.length === 0) continue

    sendPush(
      due.map((d) => ({
        userId: d.userId,
        key: `event-reminder:${d.eventId}:${offsetMs}`,
        category: 'events' as const,
        data: { type: 'event', eventId: d.eventId },
        copy: (locale) => reminderCopy(locale, d.title, offsetMs),
      })),
    )
  }
}

// A cancelled event you'd RSVP'd 'going' to, caught by polling rather than a
// write-time hook — cancelling is a direct SQL UPDATE per docs/EVENTS.md's
// runbook (there is no API endpoint for it), so this sweep is the only place
// that can ever notice cancelledAt getting set. One notification per (user, event) ever,
// through the inbox's unique key. The anti-join below skips anyone already told, so a
// tick with nothing new is a single cheap query — and only events cancelled in the last
// week are looked at, so the list of what to check can't grow without bound.
const CANCELLATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export async function sweepEventCancellations(): Promise<void> {
  const due = await db
    .select({ eventId: events.id, userId: eventRsvps.userId, restaurantId: events.restaurantId })
    .from(eventRsvps)
    .innerJoin(events, eq(events.id, eventRsvps.eventId))
    .innerJoin(user, eq(user.id, eventRsvps.userId))
    .where(
      and(
        eq(eventRsvps.status, 'going'),
        gt(events.cancelledAt, new Date(Date.now() - CANCELLATION_WINDOW_MS)),
        isNull(user.bannedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, eventRsvps.userId),
                eq(notifications.dedupeKey, sql`'event_cancelled:' || ${events.id}::text`),
              ),
            ),
        ),
      ),
    )
    .limit(500)
  if (due.length === 0) return

  await notifyNow(
    due.map((d) => ({
      userId: d.userId,
      kind: 'event_cancelled' as const,
      dedupeKey: `event_cancelled:${d.eventId}`,
      eventId: d.eventId,
      restaurantId: d.restaurantId,
    })),
  )
}
