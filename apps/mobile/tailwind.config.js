/** @type {import('tailwindcss').Config} */
// Mesa's semantic token layer: screen JSX reads `className="bg-bg text-text"`.
// The actual values are CSS variables resolved per theme at runtime by
// ThemeProvider (src/theme/vars.ts), which is what lets Mesa's clock-based Auto
// work where NativeWind's OS `dark:` variant can't.
const plugin = require('tailwindcss/plugin')

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Mesa's 8-step ramp (--space-1..8), so `p-4` == 16px == --space-4,
      // matching the web app's rhythm exactly. `extend`, not a top-level
      // `spacing` override: a top-level override REPLACES Tailwind's entire
      // default spacing scale, silently breaking every w-*/h-*/p-*/m-*/gap-*
      // class outside these 9 keys (h-24, w-40, h-44, w-36, … — the sizes
      // this app's cards, avatars and rails actually use). `extend` only
      // overrides these specific keys and leaves the rest of the default
      // scale — the one those other classes resolve against — intact.
      spacing: {
        0: 0,
        px: 1,
        1: 4,
        2: 8,
        3: 12,
        4: 16,
        5: 24,
        6: 32,
        7: 48,
        8: 64,
      },
      colors: {
        bg: 'var(--bg)',
        'bg-sunk': 'var(--bg-sunk)',
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        // Two accents (see vars.ts): `accent` is text/icons/borders (cream at
        // night), `accent-fill` is the burgundy surface. Never text-accent on it.
        accent: 'var(--accent)',
        'accent-fill': 'var(--accent-fill)',
        'on-accent': 'var(--on-accent)',
        'accent-soft': 'var(--accent-soft)',
        ink: 'var(--ink)',
        'on-ink': 'var(--on-ink)',
        danger: 'var(--danger)',
        chip: 'var(--chip)',
        logo: 'var(--logo)',
        'tab-inactive': 'var(--tab-inactive)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        glass: 'var(--glass)',
        'glass-line': 'var(--glass-line)',
        'glass-fallback': 'var(--glass-fallback)',
        hglass: 'var(--hglass)',
        'hglass-line': 'var(--hglass-line)',
        'hglass-fg': 'var(--hglass-fg)',
        'hglass-fallback': 'var(--hglass-fallback)',
        hchip: 'var(--hchip)',
        pglass: 'var(--pglass)',
        'pglass-line': 'var(--pglass-line)',
        'pglass-fallback': 'var(--pglass-fallback)',
        bar: 'var(--bar)',
        'on-bar': 'var(--on-bar)',
        'bar-chip': 'var(--bar-chip)',
        'on-photo': 'var(--on-photo)',
        'on-photo-2': 'var(--on-photo-2)',
        'photo-scrim': 'var(--photo-scrim)',
        'overlay-scrim': 'var(--overlay-scrim)',
        'avatar-light': 'var(--avatar-light)',
        // INTERIM — event categories and "live" collapse to the accent (see
        // vars.ts) and are deleted with the Explore milestone.
        'cat-cata': 'var(--cat-cata)',
        'cat-cata-soft': 'var(--cat-cata-soft)',
        'cat-musica': 'var(--cat-musica)',
        'cat-musica-soft': 'var(--cat-musica-soft)',
        'cat-brunch': 'var(--cat-brunch)',
        'cat-brunch-soft': 'var(--cat-brunch-soft)',
        'cat-food': 'var(--cat-food)',
        'cat-food-soft': 'var(--cat-food-soft)',
        'cat-happy': 'var(--cat-happy)',
        'cat-happy-soft': 'var(--cat-happy-soft)',
        'on-cat': 'var(--on-cat)',
        live: 'var(--live)',
        'live-soft': 'var(--live-soft)',
        'on-live': 'var(--on-live)',
      },
      fontFamily: {
        // The one display face: Instrument Serif, weight 400, upright only. It has no
        // bold and no italic — never ask for either (`font-serif` is the only serif
        // class). The UI face is the iOS system font; see the `plugins` block below.
        serif: ['InstrumentSerif_400Regular'],
      },
      // Serif sizes carry their own line height (≈1.1×): Instrument Serif is set
      // tight and clips at a unitless-1 leading. Explicit px units, because RN
      // lineHeight is absolute points and a bare number would read as a multiplier.
      fontSize: {
        // The place page's name, on its frosted panel.
        hero: [46, '48px'],
        display: [40, '44px'],
        title: [28, '31px'],
        rank: [40, '44px'],
        section: 21,
        body: 16,
        pill: 14,
        meta: 12.5,
        label: 13,
        eyebrow: 11,
        // Smallest sans content size: small chip labels, photo pills, badge
        // attribution, caption metadata. (HIG Caption 1.)
        micro: 12,
        // The dense-row sentence size for flat feed/activity rows (HIG Subheadline).
        subhead: 15,
        'serif-xs': [16.5, '19px'],
        'serif-sm': [19, '22px'],
        'serif-md': [21, '24px'],
        'serif-xl': [26, '29px'],
        greeting: [33, '34px'],
        'serif-lg': [34, '37px'],
        headline: [36, '38px'],
      },
      // Big soft radii (docs/DESIGN.md "Shape"). DEFAULT is the field radius; the rest
      // are named for what wears them. Capsules (buttons, pills, bars) are `pill`.
      borderRadius: {
        DEFAULT: 18,
        sm: 14,
        // Content cards on the ground: feed posts, ranking rows, profile stats.
        card: 24,
        // Inset grouped lists and their rows (Settings).
        group: 22,
        // Photo heroes and frosted panels.
        hero: 30,
        // Bottom sheets (top corners).
        sheet: 34,
        pill: 999,
      },
      letterSpacing: {
        eyebrow: '1.76px',
      },
    },
  },
  plugins: [
    // The UI face is the iOS system font (SF Pro), in the weights the design uses.
    // These keep the class names the app already speaks (`font-ui`, `font-ui-medium`,
    // `font-ui-semibold`) but resolve to `System` + a weight instead of a font
    // FAMILY per weight — SF is one variable family, and asking for a family name
    // per weight is how a custom face works, not the system's. The design draws 650
    // in places; 600 is the nearest real weight.
    plugin(({ addUtilities }) =>
      addUtilities({
        '.font-ui': { fontFamily: 'System', fontWeight: '400' },
        '.font-ui-medium': { fontFamily: 'System', fontWeight: '500' },
        '.font-ui-semibold': { fontFamily: 'System', fontWeight: '600' },
      }),
    ),
  ],
}
