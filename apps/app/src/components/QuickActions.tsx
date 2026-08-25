import { Link } from '@tanstack/react-router'
import { comingSoon } from '../lib/comingSoon'
import { requestMyLocation } from '../lib/useMyLocation'
import { ActionRail } from './ui'
import { OrderIcon, PinIcon, ReserveIcon } from './ui/icons'

// The quick-action rail shared by the feed (A1–A3) and Explore (F1): Reserve ·
// Order · Nearby. Reserve + Order are inert-by-design — they render live (pill,
// pointer, hover) but do nothing, since Mesa has no reservation/ordering supply
// yet. Nearby is a real link to the map. One source of truth for both screens.
export function QuickActions() {
  return (
    <ActionRail>
      <button
        type="button"
        className="upill"
        data-stale
        aria-disabled
        onClick={() => comingSoon('Reservar llega pronto a Mesa.')}
      >
        <span className="upill__icon">
          <ReserveIcon size={13} />
        </span>{' '}
        Reservar
      </button>
      <button
        type="button"
        className="upill"
        data-stale
        aria-disabled
        onClick={() => comingSoon('Pedir a domicilio llega pronto a Mesa.')}
      >
        <span className="upill__icon">
          <OrderIcon size={13} />
        </span>{' '}
        Pedir
      </button>
      <Link to="/map" className="upill" onClick={() => requestMyLocation()}>
        <span className="upill__icon">
          <PinIcon size={13} />
        </span>{' '}
        Cerca
      </Link>
    </ActionRail>
  )
}
