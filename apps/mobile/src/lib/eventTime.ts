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
