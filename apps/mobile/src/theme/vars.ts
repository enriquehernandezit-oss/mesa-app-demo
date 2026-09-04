import { vars } from 'nativewind'
import type { TextStyle } from 'react-native'

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
  // A real 4-step depth ladder in light, mirroring what dark already has:
  // bg-sunk < bg < surface < surface-raised. `surface` sits just above `bg`;
  // `surface-raised` stays the near-white extreme DESIGN.md names, so "raised"
  // is only reachable by moving `surface` down off it.
  '--surface': '#faf4e9',
  '--surface-raised': '#fffdf8',
  '--text': '#2a1512',
  '--text-2': '#4a3b32',
  '--text-muted': '#746253',
  '--text-faint': '#b0a08e',
  '--accent': '#8a5f24',
  // In a light theme "strong" must be DARKER than accent (more contrast, ~8:1),
  // the inverse of dark themes where strong is brighter.
  '--accent-strong': '#6f4718',
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
  '--avatar-hue-1': '#b5773c',
  '--avatar-hue-2': '#c8703f',
  '--avatar-hue-3': '#a98a63',
  '--avatar-ink': '#2a1512',
  '--overlay-scrim': 'rgba(15, 1, 2, 0.4)',
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
  '--avatar-hue-1': '#b5773c',
  '--avatar-hue-2': '#c8703f',
  '--avatar-hue-3': '#a98a63',
  '--avatar-ink': '#fdf7ec',
  '--overlay-scrim': 'rgba(8, 0, 1, 0.55)',
} as const

export const themeVars: Record<ThemeName, ReturnType<typeof vars>> = {
  afternoon: vars(afternoon),
  candlelit: vars(candlelit),
}

// Raw hex/rgba by theme, for the few places that need a color as a VALUE rather
// than a class — react-native-svg strokes, imperative APIs — where NativeWind's
// className can't reach. Keyed without the leading '--'. See useColor.
export type ColorToken = keyof typeof afternoon extends `--${infer K}` ? K : never

const strip = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k.slice(2), v])) as Record<
    ColorToken,
    string
  >

// The warm shadow under Mesa's primary ink actions (the Button, the rank FAB).
// Theme-invariant by design — it reads as the same lamp-lit drop in both themes —
// which is why it's a constant rather than a per-theme token. Raw hex is legal
// here and only here (docs/DESIGN.md).
export const BRASS_SHADOW = '#6b4715'

// Cormorant ships OLDSTYLE figures by default: the digits sit at different
// heights and 3/4/5/7/9 hang well below the baseline (measured: cap height 625,
// but `nine` bottoms out at -275 while `one` sits flat at 0). That is correct
// and handsome inside a sentence — "Miembro desde agosto de 2026" — and wrong
// everywhere a number is DATA: a score wobbles inside its brass ring, and a
// column of positions never lines up.
//
// So numerals that are data get both features:
//   lining-nums  — one shared height, all on the baseline
//   tabular-nums — one shared width, so stacked scores and positions align
//
// Applied per-site with a style prop because NativeWind can't express
// fontVariant. Prose keeps the default oldstyle figures — don't spread this
// onto body copy.
export const DATA_FIGURES: TextStyle = { fontVariant: ['lining-nums', 'tabular-nums'] }

export const themeColors: Record<ThemeName, Record<ColorToken, string>> = {
  afternoon: strip(afternoon),
  candlelit: strip(candlelit),
}

// The literal grounds, for surfaces that must paint before the provider mounts
// (native splash background, status bar) — mirrors --swatch-* in the web tokens.
export const GROUND: Record<ThemeName, string> = {
  afternoon: '#f5efe4',
  candlelit: '#210104',
}
