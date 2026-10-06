import type { schema } from '@mesa/db'

import { sdLocalNow } from './sdTime'

// A place's real weekly hours: whether it is open at a given moment, when it closes or opens next,
// and the minutes-of-week form the "open now" filter queries (restaurants.open_minutes). All in
// Santo Domingo wall time — Google's periods are local to the place, and Mesa's places are in Santo
// Domingo (a place elsewhere is judged by Santo Domingo's clock, an accepted approximation).
//
// Pure: no database, so the overnight and week-wrap cases are unit-tested.

export type OpeningPeriod = schema.OpeningPeriod

const DAY = 1440
const WEEK = 7 * DAY

const at = (p: { day: number; hour: number; minute: number }) =>
  p.day * DAY + p.hour * 60 + p.minute

// Google's raw periods, trimmed to the shape Mesa stores. A period Google sends without numbers is
// dropped rather than guessed.
type RawPeriod = {
  open?: { day?: number; hour?: number; minute?: number }
  close?: { day?: number; hour?: number; minute?: number }
}
const point = (p: RawPeriod['open']) =>
  p?.day == null ? null : { day: p.day, hour: p.hour ?? 0, minute: p.minute ?? 0 }

export function normalizePeriods(raw: RawPeriod[] | undefined): OpeningPeriod[] | null {
  if (!raw?.length) return null
  const out: OpeningPeriod[] = []
  for (const r of raw) {
    const open = point(r.open)
    if (!open) continue
    const close = point(r.close)
    out.push(close ? { open, close } : { open })
  }
  return out.length ? out : null
}

// Half-open [start, end) minute ranges within one week. A period that runs past Saturday midnight is
// split in two; a period with no close is open all week.
export function weekRanges(periods: OpeningPeriod[]): [number, number][] {
  const out: [number, number][] = []
  for (const p of periods) {
    if (!p.close) return [[0, WEEK]]
    const start = at(p.open)
    let end = at(p.close)
    if (end <= start) end += WEEK // closes "earlier" in the week: it runs past Saturday night
    if (end - start >= WEEK) return [[0, WEEK]]
    if (end <= WEEK) out.push([start, end])
    else out.push([start, WEEK], [0, end - WEEK])
  }
  return out.sort((a, b) => a[0] - b[0])
}

// The int4multirange literal Postgres stores, e.g. '{[1080,1440),[2520,2880)}'. Postgres merges
// adjacent or overlapping ranges itself.
export function toMultirange(ranges: [number, number][]): string {
  return `{${ranges.map(([a, b]) => `[${a},${b})`).join(',')}}`
}

// The columns a write sets from Google's hours — both together, so they can never disagree. Null
// hours clear both.
export function hoursColumns(periods: OpeningPeriod[] | null): {
  openingHours: OpeningPeriod[] | null
  openMinutes: string | null
} {
  if (!periods?.length) return { openingHours: null, openMinutes: null }
  return { openingHours: periods, openMinutes: toMultirange(weekRanges(periods)) }
}

// Santo Domingo's minute of the week right now (0 = Sunday 00:00).
export function sdMinuteOfWeek(now: Date = new Date()): number {
  const l = sdLocalNow(now)
  return l.getUTCDay() * DAY + l.getUTCHours() * 60 + l.getUTCMinutes()
}

// What the place page and Explore rows say. `time` is 24-hour "HH:MM" (the app formats it in the
// member's language); `day` is 0 = Sunday, so the app can say "mañana" or a weekday name.
export type OpenStatus =
  | { open: true; closesAt: { day: number; time: string } | null } // null: open around the clock
  | { open: false; opensAt: { day: number; time: string } | null } // null: no opening this week

const hhmm = (m: number) => {
  const min = ((m % DAY) + DAY) % DAY
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
const dayOf = (m: number) => Math.floor((((m % WEEK) + WEEK) % WEEK) / DAY)

export function openStatus(
  periods: OpeningPeriod[] | null,
  now: Date = new Date(),
): OpenStatus | null {
  if (!periods?.length) return null
  const ranges = weekRanges(periods)
  if (ranges.length === 1 && ranges[0]?.[0] === 0 && ranges[0]?.[1] === WEEK) {
    return { open: true, closesAt: null }
  }
  const m = sdMinuteOfWeek(now)
  // Merge ranges that touch across the week boundary so "closes" is the real end of tonight.
  const inside = ranges.find(([a, b]) => m >= a && m < b)
  if (inside) {
    let end = inside[1]
    if (end === WEEK) {
      const wrap = ranges.find(([a]) => a === 0)
      if (wrap) end = WEEK + wrap[1]
    }
    return { open: true, closesAt: { day: dayOf(end), time: hhmm(end) } }
  }
  const next = ranges.find(([a]) => a > m) ?? ranges[0]
  return {
    open: false,
    opensAt: next ? { day: dayOf(next[0]), time: hhmm(next[0]) } : null,
  }
}
