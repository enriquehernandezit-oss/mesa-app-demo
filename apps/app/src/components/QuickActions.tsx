import { Link } from '@tanstack/react-router'
import { ActionRail } from './ui'

// The quick-action rail shared by the feed (A1–A3) and Explore (F1): Reserve ·
// Order · Nearby. Reserve + Order are inert-by-design — they render live (pill,
// pointer, hover) but do nothing, since Mesa has no reservation/ordering supply
// yet. Nearby is a real link to the map. One source of truth for both screens.
export function QuickActions() {
  return (
    <ActionRail>
      <button type="button" className="upill" data-stale aria-disabled>
        <span className="upill__icon">◉</span> Reservar
      </button>
      <button type="button" className="upill" data-stale aria-disabled>
        <span className="upill__icon">▤</span> Pedir
      </button>
      <Link to="/map" className="upill">
        <span className="upill__icon">➤</span> Cerca
      </Link>
    </ActionRail>
  )
}
