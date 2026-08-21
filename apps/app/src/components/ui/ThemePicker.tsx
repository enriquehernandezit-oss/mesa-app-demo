import { useState } from 'react'
import { type ThemeChoice, readChoice, setTheme } from '../../styles/theme'
import './theme-picker.css'

// Three appearance swatches — Afternoon (paper) / Candlelit (oxblood) / Auto.
// Applies immediately and persists (see styles/theme.ts). Mounted in Profile for
// now; M6.6 moves it into the Settings screen.
const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'candlelit', label: 'Candlelit' },
  { value: 'auto', label: 'Auto' },
]

export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice())

  function pick(value: ThemeChoice) {
    setChoice(value)
    setTheme(value)
  }

  return (
    <div className="theme-picker" aria-label="Apariencia">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`theme-swatch${choice === o.value ? ' theme-swatch--on' : ''}`}
          onClick={() => pick(o.value)}
          aria-pressed={choice === o.value}
        >
          <span
            className={`theme-swatch__chip theme-swatch__chip--${o.value}`}
            aria-hidden="true"
          />
          {o.label}
        </button>
      ))}
    </div>
  )
}
