// Calendar math for Eventos, in Santo Domingo time. The DR is UTC-4 with no
// DST, so a fixed offset is exact — the same approach the API uses
// (apps/api/src/routes/events.ts). Pure, so it's unit-tested.

const SD_OFFSET_MS = 4 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// "2026-09-20" — the Santo Domingo calendar day an instant falls on.
export function sdDayKey(at: Date | string | number): string {
  const ms = new Date(at).getTime() - SD_OFFSET_MS
  return new Date(ms).toISOString().slice(0, 10)
}

// The next `n` SD calendar days starting today, as day keys.
export function nextDays(n: number, now: Date = new Date()): string[] {
  const today = sdDayKey(now)
  const base = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(base + i * DAY_MS).toISOString().slice(0, 10))
}

export type Countdown =
  | { kind: 'live' }
  | { kind: 'ended' }
  | { kind: 'minutes'; n: number }
  | { kind: 'hours'; h: number; m: number }
  | { kind: 'tomorrow' }
  | { kind: 'days'; n: number }

// What the countdown chip says. "live" between start and end (or the first
// 3h when there's no end); within 12h it counts hours/minutes; otherwise it
// speaks in calendar days — "mañana", "en 3 días" — by SD day, not 24h blocks.
export function countdown(
  startsAt: string,
  endsAt: string | null,
  now: Date = new Date(),
): Countdown {
  const start = Date.parse(startsAt)
  const end = endsAt ? Date.parse(endsAt) : start + 3 * 60 * 60 * 1000
  const t = now.getTime()
  if (t >= end) return { kind: 'ended' }
  if (t >= start) return { kind: 'live' }
  const diff = start - t
  if (diff < 60 * 60 * 1000) return { kind: 'minutes', n: Math.max(1, Math.round(diff / 60000)) }
  if (diff < 12 * 60 * 60 * 1000) {
    const mins = Math.round(diff / 60000)
    return { kind: 'hours', h: Math.floor(mins / 60), m: mins % 60 }
  }
  const days = Math.round(
    (Date.parse(`${sdDayKey(start)}T00:00:00Z`) - Date.parse(`${sdDayKey(t)}T00:00:00Z`)) / DAY_MS,
  )
  if (days <= 0) return { kind: 'hours', h: Math.floor(diff / 3600000), m: 0 }
  if (days === 1) return { kind: 'tomorrow' }
  return { kind: 'days', n: days }
}

// Is this countdown "soon" enough to earn the pulsing dot?
export function isImminent(c: Countdown): boolean {
  return c.kind === 'live' || c.kind === 'minutes' || c.kind === 'hours'
}

// ── The Eventos date selection (the day strip + the calendar picker) ────────
// One value, so the strip and the calendar can never disagree: `null` is
// "every upcoming day", `start === end` is one day, `start !== end` is an
// inclusive range.
export type DayRange = { start: string; end: string } | null

// WHY string comparison is safe — and why everything below is UTC math:
// a day key is a LABEL ("2026-09-22", the Santo Domingo calendar date), not
// an instant. Keys are zero-padded ISO, so lexical order IS chronological.
// The ONE place a real instant becomes a label is sdDayKey() above, which
// subtracts the fixed UTC-4 offset; nothing here ever turns a label back into
// an instant, which is exactly why a date picked in the calendar cannot land
// on the neighbouring day. Any Date built from a key below is constructed and
// read with the UTC getters, so it spells the key literally, whatever
// timezone the phone happens to be in.
export function inDayRange(dayKey: string, r: DayRange): boolean {
  return r === null || (dayKey >= r.start && dayKey <= r.end)
}

// Whole SD days from `from` to `to` (both day keys) — negative when `to` is
// the earlier one.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

// The day key `n` SD days after this one.
export function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

// "2026-09" — the month a day key falls in.
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7)
}

// The month `delta` months from this one, e.g. shiftMonth('2026-12', 1) →
// '2027-01'. Date.UTC normalises the overflow, so no wrap-around arithmetic.
export function shiftMonth(month: string, delta: number): string {
  const ms = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1)
  return new Date(ms).toISOString().slice(0, 7)
}

// One month as the calendar grid draws it, Monday-first: leading/trailing
// `null`s pad the first and last weeks so the result is a whole number of
// rows of 7.
export function monthCells(month: string): (string | null)[] {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= length; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
