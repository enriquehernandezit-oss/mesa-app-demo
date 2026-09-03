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
    // Override the spacing scale to Mesa's 8-step ramp (--space-1..8), so
    // `p-4` == 16px == --space-4, matching the web app's rhythm exactly.
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
    extend: {
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
      },
      fontFamily: {
        serif: ['CormorantGaramond_500Medium'],
        'serif-semibold': ['CormorantGaramond_600SemiBold'],
        'serif-italic': ['CormorantGaramond_400Regular_Italic'],
        ui: ['PlusJakartaSans_400Regular'],
        'ui-medium': ['PlusJakartaSans_500Medium'],
        'ui-semibold': ['PlusJakartaSans_600SemiBold'],
        mono: ['JetBrainsMono_400Regular'],
      },
      fontSize: {
        display: 38,
        title: 25,
        rank: 40,
        body: 16,
        label: 13,
        eyebrow: 11,
        // The smallest step, for mono metadata captions (timestamps, counts,
        // the "film" pill). Absorbs the text-[10px]/text-[9px] one-offs.
        micro: 10,
        'serif-sm': 18,
        'serif-md': 22,
        'serif-lg': 30,
      },
      borderRadius: {
        DEFAULT: 14,
        sm: 10,
        pill: 999,
      },
      lineHeight: {
        // The serif title's measured leading (paired with text-title = 25).
        title: 28,
      },
      letterSpacing: {
        eyebrow: '1.76px',
        // Tight tracking for the mono micro-caps label.
        micro: '0.8px',
      },
    },
  },
  plugins: [],
}
