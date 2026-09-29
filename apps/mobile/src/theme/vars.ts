import { vars } from 'nativewind'
import type { TextStyle } from 'react-native'

// The two Mesa themes — Day (cream) and Night (black) — as NativeWind variable
// maps. ThemeProvider applies one of these to a root View via
// style={themeVars[active]}, so every `bg-bg`/`text-accent` class in the tree
// resolves to the active theme. The values come from docs/design/redesign2 (the
// `.Day` / `.Night` blocks, and docs/DESIGN.md).
//
// Only color changes per theme (type/spacing/radius are theme-invariant and live
// in tailwind.config.js). Names match the tailwind `colors` keys exactly.
//
// TWO ACCENTS, ON PURPOSE. Burgundy (#7a1a29) is the one brand accent, but it is
// unreadable as small text on black, so the accent splits by job:
//   accent       — text, icons, borders, "on" states. Burgundy by day, CREAM at night.
//   accent-fill  — surfaces: the +, Rank it, the slider, switches, badges. Burgundy
//                  in both themes, with on-accent (cream) drawn on it.
// Never set `text-accent` on an `accent-fill` surface (burgundy on burgundy by day).
// There is no pink anywhere: Night is black + burgundy, nothing in between.

export type ThemeName = 'day' | 'night'

const day = {
  '--bg': '#f3ede4',
  '--bg-sunk': '#e9e1d5',
  // Cards are pure white on the cream ground so content objects read as distinct
  // objects; surface-raised is the warmer step used by name cards and inset areas.
  '--surface': '#ffffff',
  '--surface-raised': '#faf7f2',
  '--text': '#16110f',
  '--text-2': '#3d332d',
  '--text-muted': '#8a7a6c',
  '--text-faint': '#b9ab9c',
  '--accent': '#7a1a29',
  '--accent-fill': '#7a1a29',
  '--on-accent': '#f4ede2',
  '--accent-soft': 'rgba(122, 26, 41, 0.08)',
  // The high-contrast "solid": ink by day, cream at night. Solid buttons, the
  // active tab circle, selected pills. (Not named `solid`: Tailwind's `border-solid`
  // would then also set a border color.)
  '--ink': '#16110f',
  '--on-ink': '#f4ede2',
  '--danger': '#b3261e',
  // The floating capsule fills: pills, icon buttons, the "Add a note" bar.
  '--chip': '#ffffff',
  // The wordmark. The app's original oxblood by day; cream at night, where oxblood
  // would vanish on black.
  '--logo': '#210104',
  '--tab-inactive': 'rgba(22, 17, 15, 0.5)',
  '--line': 'rgba(22, 17, 15, 0.09)',
  '--line-strong': 'rgba(22, 17, 15, 0.16)',
  // Translucent chrome. `glass*` is the tint laid over a real material (or over
  // content, on iOS < 26); `*-fallback` is the near-opaque stand-in when there is
  // no material. `hglass*` is the frosted panel that sits on a photograph.
  '--glass': 'rgba(255, 255, 255, 0.62)',
  '--glass-line': 'rgba(255, 255, 255, 0.85)',
  '--glass-fallback': 'rgba(255, 255, 255, 0.94)',
  '--hglass': 'rgba(255, 255, 255, 0.62)',
  '--hglass-line': 'rgba(255, 255, 255, 0.85)',
  '--hglass-fg': '#16110f',
  '--hglass-fallback': 'rgba(255, 255, 255, 0.86)',
  '--hchip': 'rgba(255, 255, 255, 0.8)',
  // Small controls and pills set on a photograph: a dark-tinted glass that reads the
  // same in both themes (a photo is its own dark island). `pglass-fallback` is the
  // stand-in where there is no material.
  '--pglass': 'rgba(20, 6, 6, 0.5)',
  '--pglass-line': 'rgba(255, 255, 255, 0.18)',
  '--pglass-fallback': 'rgba(20, 6, 6, 0.62)',
  // The floating rank bar on the place page: dark in both themes.
  '--bar': '#16110f',
  '--on-bar': '#f4ede2',
  '--bar-chip': 'rgba(244, 237, 226, 0.12)',
  // Text set on a photograph is theme-invariant (a photo is its own dark island).
  '--on-photo': '#f5efe4',
  '--on-photo-2': 'rgba(245, 239, 228, 0.75)',
  '--photo-scrim': 'rgba(20, 4, 4, 0.85)',
  '--overlay-scrim': 'rgba(22, 17, 15, 0.3)',
  '--avatar-hue-1': '#b5773c',
  '--avatar-hue-2': '#c8703f',
  '--avatar-hue-3': '#a98a63',
  '--avatar-ink': '#2a1512',
  '--avatar-light': '#e8d5bd',
  // INTERIM (deleted in the Explore milestone). Event categories used to be five
  // hues; they are now the accent, so an event reads as an event and its icon says
  // which kind. Kept as tokens only so existing classes keep resolving.
  '--cat-cata': '#7a1a29',
  '--cat-cata-soft': 'rgba(122, 26, 41, 0.08)',
  '--cat-musica': '#7a1a29',
  '--cat-musica-soft': 'rgba(122, 26, 41, 0.08)',
  '--cat-brunch': '#7a1a29',
  '--cat-brunch-soft': 'rgba(122, 26, 41, 0.08)',
  '--cat-food': '#7a1a29',
  '--cat-food-soft': 'rgba(122, 26, 41, 0.08)',
  '--cat-happy': '#7a1a29',
  '--cat-happy-soft': 'rgba(122, 26, 41, 0.08)',
  '--on-cat': '#f4ede2',
  '--live': '#7a1a29',
  '--live-soft': 'rgba(122, 26, 41, 0.08)',
  '--on-live': '#f4ede2',
} as const

const night = {
  '--bg': '#0b0809',
  '--bg-sunk': '#050404',
  '--surface': '#171213',
  '--surface-raised': '#1f191a',
  '--text': '#f4ede2',
  '--text-2': '#d9cfc2',
  '--text-muted': 'rgba(244, 237, 226, 0.55)',
  '--text-faint': 'rgba(244, 237, 226, 0.32)',
  '--accent': '#f4ede2',
  '--accent-fill': '#7a1a29',
  '--on-accent': '#f4ede2',
  '--accent-soft': 'rgba(122, 26, 41, 0.28)',
  '--ink': '#f4ede2',
  '--on-ink': '#0b0809',
  '--danger': '#ff6b5e',
  '--chip': 'rgba(255, 255, 255, 0.08)',
  '--logo': '#f4ede2',
  '--tab-inactive': 'rgba(244, 237, 226, 0.55)',
  '--line': 'rgba(255, 255, 255, 0.08)',
  '--line-strong': 'rgba(255, 255, 255, 0.14)',
  '--glass': 'rgba(255, 255, 255, 0.1)',
  '--glass-line': 'rgba(255, 255, 255, 0.14)',
  '--glass-fallback': 'rgba(27, 21, 22, 0.94)',
  // Light frost washes cream text out over a bright photo at night, so the panel
  // is smoked glass instead.
  '--hglass': 'rgba(16, 11, 11, 0.58)',
  '--hglass-line': 'rgba(255, 255, 255, 0.12)',
  '--hglass-fg': '#f4ede2',
  '--hglass-fallback': 'rgba(16, 11, 11, 0.84)',
  '--hchip': 'rgba(255, 255, 255, 0.1)',
  '--pglass': 'rgba(20, 6, 6, 0.5)',
  '--pglass-line': 'rgba(255, 255, 255, 0.18)',
  '--pglass-fallback': 'rgba(20, 6, 6, 0.62)',
  '--bar': '#1b1516',
  '--on-bar': '#f4ede2',
  '--bar-chip': 'rgba(244, 237, 226, 0.12)',
  '--on-photo': '#f5efe4',
  '--on-photo-2': 'rgba(245, 239, 228, 0.75)',
  '--photo-scrim': 'rgba(20, 4, 4, 0.85)',
  '--overlay-scrim': 'rgba(0, 0, 0, 0.55)',
  '--avatar-hue-1': '#b5773c',
  '--avatar-hue-2': '#c8703f',
  '--avatar-hue-3': '#a98a63',
  '--avatar-ink': '#2a1512',
  '--avatar-light': '#e8d5bd',
  // INTERIM (see above). At night the plain cat/live tokens are cream, because they
  // are also used as text and burgundy text on black is unreadable; on-cat is then
  // dark, for text set on a cream fill.
  '--cat-cata': '#f4ede2',
  '--cat-cata-soft': 'rgba(122, 26, 41, 0.28)',
  '--cat-musica': '#f4ede2',
  '--cat-musica-soft': 'rgba(122, 26, 41, 0.28)',
  '--cat-brunch': '#f4ede2',
  '--cat-brunch-soft': 'rgba(122, 26, 41, 0.28)',
  '--cat-food': '#f4ede2',
  '--cat-food-soft': 'rgba(122, 26, 41, 0.28)',
  '--cat-happy': '#f4ede2',
  '--cat-happy-soft': 'rgba(122, 26, 41, 0.28)',
  '--on-cat': '#0b0809',
  '--live': '#f4ede2',
  '--live-soft': 'rgba(122, 26, 41, 0.28)',
  '--on-live': '#0b0809',
} as const

export const themeVars: Record<ThemeName, ReturnType<typeof vars>> = {
  day: vars(day),
  night: vars(night),
}

// Raw hex/rgba by theme, for the few places that need a color as a VALUE rather
// than a class — react-native-svg strokes, imperative APIs — where NativeWind's
// className can't reach. Keyed without the leading '--'. See useColor.
export type ColorToken = keyof typeof day extends `--${infer K}` ? K : never

const strip = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k.slice(2), v])) as Record<
    ColorToken,
    string
  >

// The warm drop shadow under raised surfaces (buttons, sheets, toasts). Theme-
// invariant — it only shows on the light theme — so it is a constant rather than
// a per-theme token. Raw hex is legal here and only here (docs/DESIGN.md).
export const SHADOW = '#3c2814'

// The two-layer warm "lift" under raised content — cards, fields, chip buttons and
// pills. DAY ONLY: on black a shadow is invisible and a black one would be wrong, so
// Night has none (`useLift()` returns nothing there). Two layers, as the boards draw
// it: a tight contact shadow and a soft ambient one.
export const LIFT = '0 1px 2px rgba(60, 40, 20, 0.07), 0 6px 18px rgba(60, 40, 20, 0.05)'

// The deeper shadow under something that FLOATS over the page — the tab bar. Tinted
// with the oxblood rather than black. Day only, like LIFT.
export const FLOAT = '0 12px 30px rgba(33, 1, 4, 0.18)'

// The map's own "you are here" marker (components/MesaMap.tsx) — deliberately
// the same system blue Apple Maps/MapKit uses for a user-location dot, not a
// brand token. The map itself is already native-styled chrome (Mapbox's own
// light-v11/dark-v11 StyleURLs, not Mesa's token layer — see MesaMap.tsx's
// header comment), and this is the one universally-recognized "that's you"
// affordance on any map; recoloring it burgundy would read as a bug, not a
// choice. Theme-invariant for the same reason SHADOW is.
export const MAP_USER_LOCATION_BLUE = '#007AFF'

// Numerals that are DATA — a score, a position, a count — get both features:
//   lining-nums  — one shared height, all on the baseline
//   tabular-nums — one shared width, so stacked figures line up
//
// What each face does:
//   SF (the UI font)  proportional by default, with a tabular feature (Apple's
//                     documented behavior) — so `tabular-nums` is what makes a
//                     column of counts and positions align.
//   Instrument Serif  measured from its font file (400Regular.ttf): digits are
//                     already lining, but proportional ("1" is a narrow glyph),
//                     and the font has NO tnum/lnum feature, so `tabular-nums`
//                     is a no-op on serif numerals. Right-align a stacked serif
//                     figure (or set it in the system font) if columns must align;
//                     a lone score, or a count inside a stat tile, is unaffected.
//
// Applied per-site with a style prop because NativeWind can't express
// fontVariant. Prose doesn't need it — don't spread this onto body copy.
export const DATA_FIGURES: TextStyle = { fontVariant: ['lining-nums', 'tabular-nums'] }

export const themeColors: Record<ThemeName, Record<ColorToken, string>> = {
  day: strip(day),
  night: strip(night),
}

// The literal grounds, for surfaces that must paint before the provider mounts
// (native splash background, status bar).
export const GROUND: Record<ThemeName, string> = {
  day: '#f3ede4',
  night: '#0b0809',
}
