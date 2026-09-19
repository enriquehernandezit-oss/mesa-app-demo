/** @type {import('tailwindcss').Config} */
// Mesa's semantic token layer, ported from apps/app/src/styles/tokens.css. Color
// names are identical to the web app (bg, text, accent, …) so screen JSX reads
// the same — `className="bg-bg text-text"`. The actual values are CSS variables
// resolved per theme at runtime by ThemeProvider (src/theme), which is what lets
// Mesa's clock-based Auto work where NativeWind's OS `dark:` variant can't.
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
        'overlay-scrim': 'var(--overlay-scrim)',
        'surface-raised': 'var(--surface-raised)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        'accent-fill': 'var(--accent-fill)',
        'on-accent': 'var(--on-accent)',
        'tab-inactive': 'var(--tab-inactive)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        'status-packed': 'var(--status-packed)',
        'status-good': 'var(--status-good)',
        'status-building': 'var(--status-building)',
        'status-slow': 'var(--status-slow)',
        'on-photo': 'var(--on-photo)',
        'on-photo-2': 'var(--on-photo-2)',
        'on-photo-accent': 'var(--on-photo-accent)',
        'btn-primary-bg': 'var(--btn-primary-bg)',
        'btn-primary-fg': 'var(--btn-primary-fg)',
        // Event categories — Eventos only (see vars.ts).
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
        'photo-scrim': 'var(--photo-scrim)',
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
