/** @type {import('tailwindcss').Config} */
// Mesa's semantic token layer: screen JSX reads `className="bg-bg text-text"`.
// The actual values are CSS variables resolved per theme at runtime by
// ThemeProvider (src/theme/vars.ts), which is what lets Mesa's clock-based Auto
// work where NativeWind's OS `dark:` variant can't.
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
        serif: ['CormorantGaramond_500Medium'],
        'serif-semibold': ['CormorantGaramond_600SemiBold'],
        'serif-italic': ['CormorantGaramond_400Regular_Italic'],
        ui: ['PlusJakartaSans_400Regular'],
        'ui-medium': ['PlusJakartaSans_500Medium'],
        'ui-semibold': ['PlusJakartaSans_600SemiBold'],
      },
      fontSize: {
        display: 38,
        title: 25,
        rank: 40,
        body: 16,
        label: 13,
        eyebrow: 11,
        // Smallest sans content size: small chip labels, photo pills, badge
        // attribution, caption metadata. (HIG Caption 1.)
        micro: 12,
        // The dense-row sentence size for flat feed/activity rows (HIG Subheadline).
        subhead: 15,
        'serif-sm': 18,
        'serif-md': 22,
        'serif-lg': 30,
      },
      borderRadius: {
        DEFAULT: 14,
        sm: 10,
        // The white content cards on the cream ground (feed posts, ranking
        // rows, profile stats, featured lists) — softer than DEFAULT's 14.
        card: 20,
        pill: 999,
      },
      lineHeight: {
        // The serif title's measured leading (paired with text-title = 25).
        // Explicit px unit: RN lineHeight is absolute points, and a unitless
        // value would read as a font-size multiplier, not 28pt.
        title: '28px',
      },
      letterSpacing: {
        eyebrow: '1.76px',
      },
    },
  },
  plugins: [],
}
