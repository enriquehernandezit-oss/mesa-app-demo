// Theme resolution + persistence. Two themes — Afternoon (light paper) and
// Candlelit (dark oxblood) — plus Auto, which follows the OS AND the clock:
// Mesa is a going-out app, so Auto should read as "after-9 energy" once it
// actually is evening, not just when the OS happens to be in dark mode. The
// user's choice is stored in localStorage and applied to <html data-theme>.
// The first paint is handled by the inline boot script in index.html
// (synchronous, so no FOUC, mirroring the same hour rule below); this module
// re-syncs at startup and applies changes from the theme picker.
//
// localStorage — not Capacitor Preferences — because the boot script must read
// the choice *synchronously* before first paint, which the Promise-based
// Preferences API structurally cannot do. See docs/DESIGN.md.

export type ThemeChoice = 'auto' | 'afternoon' | 'candlelit'
export type ResolvedTheme = 'afternoon' | 'candlelit'

export const THEME_STORAGE_KEY = 'mesa.theme'

// Candlelit hours for Auto — 6pm to 6am local time. Keep in sync with the
// boot script's copy in index.html.
const EVENING_START_HOUR = 18
const MORNING_END_HOUR = 6

// Kept in sync with --bg per theme; drives the mobile browser chrome color.
const THEME_COLOR: Record<ResolvedTheme, string> = {
  afternoon: '#f3efe6',
  candlelit: '#210104',
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function isEvening(): boolean {
  const h = new Date().getHours()
  return h >= EVENING_START_HOUR || h < MORNING_END_HOUR
}

export function readChoice(): ThemeChoice {
  const v = localStorage.getItem(THEME_STORAGE_KEY)
  return v === 'afternoon' || v === 'candlelit' ? v : 'auto'
}

export function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'afternoon' || choice === 'candlelit') return choice
  return darkQuery().matches || isEvening() ? 'candlelit' : 'afternoon'
}

function applyResolved(resolved: ResolvedTheme): void {
  const el = document.documentElement
  el.dataset.theme = resolved
  el.style.colorScheme = resolved === 'candlelit' ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}

// Set (or clear to Auto) the theme and apply it immediately.
export function setTheme(choice: ThemeChoice): void {
  localStorage.setItem(THEME_STORAGE_KEY, choice)
  applyResolved(resolve(choice))
}

function reapplyIfAuto(): void {
  if (readChoice() === 'auto') applyResolved(resolve('auto'))
}

// The next 6am or 6pm boundary strictly after `now` — whichever of today's
// two crossing points comes first, or tomorrow's 6am if both have passed.
function nextBoundary(now: Date): Date {
  const morning = new Date(now)
  morning.setHours(MORNING_END_HOUR, 0, 0, 0)
  if (now < morning) return morning
  const evening = new Date(now)
  evening.setHours(EVENING_START_HOUR, 0, 0, 0)
  if (now < evening) return evening
  const tomorrowMorning = new Date(morning)
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1)
  return tomorrowMorning
}

// Schedules one reapply at the next boundary, then re-arms itself — so an app
// left open across the evening switch-over actually switches, instead of
// waiting for the next OS dark-mode change or manual refresh.
function armBoundaryTimer(): void {
  const ms = nextBoundary(new Date()).getTime() - Date.now()
  window.setTimeout(() => {
    reapplyIfAuto()
    armBoundaryTimer()
  }, ms)
}

// Call once at startup. The boot script already set data-theme for the first
// paint; this re-syncs (idempotent) and wires the OS listener + the
// time-of-day boundary timer + a foreground re-check, so Auto tracks both the
// system and the clock while — and only while — Auto is the active choice.
export function initTheme(): void {
  applyResolved(resolve(readChoice()))
  darkQuery().addEventListener('change', reapplyIfAuto)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reapplyIfAuto()
  })
  armBoundaryTimer()
}
