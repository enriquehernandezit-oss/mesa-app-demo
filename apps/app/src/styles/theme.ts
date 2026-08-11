// Theme resolution + persistence. Two themes — Afternoon (light paper) and
// Candlelit (dark oxblood) — plus Auto, which follows the OS. The user's choice
// is stored in localStorage and applied to <html data-theme>. The first paint is
// handled by the inline boot script in index.html (synchronous, so no FOUC);
// this module re-syncs at startup and applies changes from the theme picker.
//
// localStorage — not Capacitor Preferences — because the boot script must read
// the choice *synchronously* before first paint, which the Promise-based
// Preferences API structurally cannot do. See docs/DESIGN.md.

export type ThemeChoice = 'auto' | 'afternoon' | 'candlelit'
export type ResolvedTheme = 'afternoon' | 'candlelit'

export const THEME_STORAGE_KEY = 'mesa.theme'

// Kept in sync with --bg per theme; drives the mobile browser chrome color.
const THEME_COLOR: Record<ResolvedTheme, string> = {
  afternoon: '#f3efe6',
  candlelit: '#210104',
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readChoice(): ThemeChoice {
  const v = localStorage.getItem(THEME_STORAGE_KEY)
  return v === 'afternoon' || v === 'candlelit' ? v : 'auto'
}

export function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'afternoon' || choice === 'candlelit') return choice
  return darkQuery().matches ? 'candlelit' : 'afternoon'
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

// Call once at startup. The boot script already set data-theme for the first
// paint; this re-syncs (idempotent) and wires the OS listener so Auto tracks the
// system while — and only while — Auto is the active choice.
export function initTheme(): void {
  applyResolved(resolve(readChoice()))
  darkQuery().addEventListener('change', () => {
    if (readChoice() === 'auto') applyResolved(resolve('auto'))
  })
}
