import type { ReactNode } from 'react'
import './screen-header.css'

// Shared header for the full-screen routes that live outside TabsLayout (no
// TopBar, no TabBar). It supplies the iOS status-bar inset (--safe-top) so the
// back control is never buried under the notch in standalone/PWA mode, and it
// gives that control a ≥44×44 tap target. An optional right slot carries a
// per-screen action (Activity's "Mark read", a user's ⋯ menu).
interface ScreenHeaderProps {
  onBack: () => void
  /** Text after the back chevron (e.g. "Settings", "Back", a member's name). */
  backLabel: string
  right?: ReactNode
}

export function ScreenHeader({ onBack, backLabel, right }: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <button type="button" className="screen-header__back" onClick={onBack}>
        <span className="screen-header__chev" aria-hidden="true">
          ‹
        </span>
        <span className="screen-header__label">{backLabel}</span>
      </button>
      {right && <div className="screen-header__right">{right}</div>}
    </header>
  )
}
