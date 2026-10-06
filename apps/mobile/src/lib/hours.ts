// "12 AM", "9 PM": a restaurant's closing time as it is shown. `closesAt` is a display
// label in the database ("1a", "12a", "11p" — restaurants.closesAt), not a parsed time; this
// reads it and returns null for anything that isn't one (imported rows have none).
export function closesLabel(closesAt: string | null | undefined): string | null {
  const m = /^(\d{1,2})([ap])$/i.exec((closesAt ?? '').trim())
  if (!m) return null
  const hour = Number(m[1])
  if (hour < 1 || hour > 12) return null
  return `${hour} ${m[2]!.toLowerCase() === 'a' ? 'AM' : 'PM'}`
}

// "18:30" → "6:30 PM", "00:00" → "12 AM": a 24-hour time from the API as it is shown.
export function clockLabel(hhmm: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

// Santo Domingo's day of the week (0 = Sunday) — the API's hours are in its wall time (UTC-4, no DST),
// whatever the phone's own time zone.
export function sdWeekday(now: Date = new Date()): number {
  return new Date(now.getTime() - 4 * 3600_000).getUTCDay()
}

type OpenStatus =
  | { open: true; closesAt: { day: number; time: string } | null }
  | { open: false; opensAt: { day: number; time: string } | null }

// The words, so this stays pure: the place page passes its translations.
export interface OpenWords {
  openUntil: (time: string) => string
  open24h: string
  opensToday: (time: string) => string
  opensTomorrow: (time: string) => string
  opensOn: (day: number, time: string) => string
  closed: string
}

// "Abierto · cierra 12 AM", "Cerrado · abre mañana 12 PM" — or null when Mesa has no hours.
export function openStatusLine(
  s: OpenStatus | null | undefined,
  words: OpenWords,
  now: Date = new Date(),
): string | null {
  if (!s) return null
  if (s.open) {
    if (!s.closesAt) return words.open24h
    const time = clockLabel(s.closesAt.time)
    return time ? words.openUntil(time) : null
  }
  if (!s.opensAt) return words.closed
  const time = clockLabel(s.opensAt.time)
  if (!time) return words.closed
  const today = sdWeekday(now)
  if (s.opensAt.day === today) return words.opensToday(time)
  if (s.opensAt.day === (today + 1) % 7) return words.opensTomorrow(time)
  return words.opensOn(s.opensAt.day, time)
}
