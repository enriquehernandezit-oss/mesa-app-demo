import { vars } from 'nativewind'

// The two Mesa themes as NativeWind variable maps, ported from
// apps/app/src/styles/tokens.css. ThemeProvider applies one of these to a root
// View via style={themeVars[active]}, so every `bg-bg`/`text-accent` class in the
// tree resolves to the active theme. Keep these in lockstep with the web tokens.
//
// Only color changes per theme (type/spacing/radius are theme-invariant and live
// in tailwind.config.js). Names match the tailwind `colors` keys exactly.

export type ThemeName = 'afternoon' | 'candlelit'

const afternoon = {
  '--bg': '#f5efe4',
  '--bg-sunk': '#e7dccb',
  '--surface': '#fffdf8',
  '--surface-raised': '#fffdf8',
  '--text': '#2a1512',
  '--text-2': '#4a3b32',
  '--text-muted': '#746253',
  '--text-faint': '#b0a08e',
  '--accent': '#8a5f24',
  '--accent-strong': '#8a5a2a',
  '--accent-fill': '#8a5f24',
  '--on-accent': '#fdf7ec',
  '--tab-inactive': '#786a5b',
  '--line': 'rgba(120, 80, 60, 0.12)',
  '--line-strong': 'rgba(120, 80, 60, 0.16)',
  '--status-packed': '#b0512e',
  '--status-good': '#9a6a28',
  '--status-building': '#97794f',
  '--status-slow': '#8a7b6c',
  '--on-photo': '#ebe4d6',
  '--on-photo-2': '#dcccbb',
  '--on-photo-accent': '#e2c179',
  '--btn-primary-bg': '#2a1512',
  '--btn-primary-fg': '#fdf7ec',
} as const

const candlelit = {
  '--bg': '#210104',
  '--bg-sunk': '#180b0b',
  '--surface': '#2c1516',
  '--surface-raised': '#391c1d',
  '--text': '#ebe4d6',
  '--text-2': '#dcccbb',
  '--text-muted': '#a3867a',
  '--text-faint': '#7d6459',
  '--accent': '#c09050',
  '--accent-strong': '#e2c179',
  '--accent-fill': '#c09050',
  '--on-accent': '#210104',
  '--tab-inactive': '#9a8175',
  '--line': 'rgba(235, 228, 214, 0.1)',
  '--line-strong': 'rgba(235, 228, 214, 0.16)',
  '--status-packed': '#e0865a',
  '--status-good': '#c09050',
  '--status-building': '#a98a63',
  '--status-slow': '#7a6258',
  '--on-photo': '#ebe4d6',
  '--on-photo-2': '#dcccbb',
  '--on-photo-accent': '#e2c179',
  '--btn-primary-bg': '#c09050',
  '--btn-primary-fg': '#210104',
} as const

export const themeVars: Record<ThemeName, ReturnType<typeof vars>> = {
  afternoon: vars(afternoon),
  candlelit: vars(candlelit),
}

// The literal grounds, for surfaces that must paint before the provider mounts
// (native splash background, status bar) — mirrors --swatch-* in the web tokens.
export const GROUND: Record<ThemeName, string> = {
  afternoon: '#f5efe4',
  candlelit: '#210104',
}
