import { addDays, countdown, daysBetween, sdDayKey } from './eventTime'
import type { EventSummary } from './types'

// The Feed's Events view is about people: which events your friends are going to, which ones you
// are, and what the coming week looks like. (Explore's Events is the catalogue.) Pure, so it is
// unit-tested; the screen only draws what these return.

const notOver = (e: EventSummary, now: Date) =>
  countdown(e.startsAt, e.endsAt, now).kind !== 'ended'

// Events at least one person you follow is going to — the one with the most friends first, then
// the soonest. Not over yet.
export function friendsGoingEvents(events: EventSummary[], now: Date): EventSummary[] {
  return events
    .filter((e) => e.friendsGoingCount > 0 && notOver(e, now))
    .sort(
      (a, b) =>
        b.friendsGoingCount - a.friendsGoingCount ||
        Date.parse(a.startsAt) - Date.parse(b.startsAt),
    )
}

// The coming week as day sections: the next seven Santo Domingo days, today included, in order,
// each with its events soonest first. An event that began earlier and is still on belongs to today.
// Days with nothing on are left out.
export type EventDay = { dayKey: string; events: EventSummary[] }

export function eventDays(events: EventSummary[], now: Date, days = 7): EventDay[] {
  const today = sdDayKey(now)
  const last = addDays(today, days - 1)
  const byDay = new Map<string, EventSummary[]>()
  for (const e of events) {
    if (!notOver(e, now)) continue
    const key = sdDayKey(e.startsAt)
    const day = key < today ? today : key
    if (day > last) continue
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dayKey, list]) => ({
      dayKey,
      events: list.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    }))
}

// 0 = today, 1 = tomorrow … in Santo Domingo days.
export const dayOffset = (dayKey: string, now: Date) => daysBetween(sdDayKey(now), dayKey)
