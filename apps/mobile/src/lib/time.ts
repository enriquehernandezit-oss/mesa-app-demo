import { dateLocale, getLanguage, t } from './i18n'

// Compact relative time for feed items: "ahora"/"now", "12m", "3h", "2d", "5w".
// Ported verbatim from apps/app/src/lib/time.ts.
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return t(getLanguage(), 'time.now')
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)}d`
  return `${Math.floor(d / 7)}w`
}

// Planes (M3): display formatting for a plan's date/time.

// Santo Domingo has no DST, so a fixed offset TZ is safe to hardcode — every
// plan date renders pinned to it rather than the reader's own device, since
// "8:00 pm" in a WhatsApp share should mean Santo Domingo time regardless of
// who's reading it. Mirrors apps/api/src/routes/share-pages.ts's formatter.
// The *locale* (weekday/month names), unlike the timezone, does follow the
// app's language — built per call via dateLocale() rather than cached at
// module scope, so it reflects the current language on every call.
function planDateFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(dateLocale(), {
    timeZone: 'America/Santo_Domingo',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "sáb 20 sep, 8:00 pm" — the formatter emits the date and time as two runs
// with no separator between them; a comma reads better than the bare space.
export function formatPlanDate(iso: string): string {
  const parts = planDateFormatter().formatToParts(new Date(iso))
  const day = parts
    .filter((p) => p.type === 'weekday' || p.type === 'day' || p.type === 'month')
    .map((p) => p.value)
    .join(' ')
  const time = parts
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .replace(/([ap])\.?\s?m\.?/i, (_m, ap) => `${ap}m`)
  return `${day}, ${time}`
}

// Day-chip label for the "when" step's chooser (14 chips: today .. +13 days).
// Compares calendar dates in the device's own timezone — this is a person
// picking a day off their own calendar, not reading a stored instant, so
// (unlike formatPlanDate) there is no Santo Domingo pin here.
export function dayChipLabel(d: Date, today: Date): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / 86_400_000)
  const lang = getLanguage()
  if (diffDays === 0) return t(lang, 'plans.today')
  if (diffDays === 1) return t(lang, 'plans.tomorrow')
  const label = new Intl.DateTimeFormat(dateLocale(lang), {
    weekday: 'short',
    day: 'numeric',
  }).format(d)
  return label.replace('.', '')
}

// Time-chip label, e.g. timeChipLabel(20, 0) -> "8:00 pm".
export function timeChipLabel(hour: number, minute: number): string {
  const period = hour < 12 ? 'am' : 'pm'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`
}
