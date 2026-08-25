import { useNavigate, useParams } from '@tanstack/react-router'
import { Body, Button, EmptyState } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { DirectionsIcon, PhoneIcon, WebIcon } from '../../components/ui/icons'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { seatsLeft, tonightTable } from '../../fixtures/tonight'
import { comingSoon } from '../../lib/comingSoon'
import { openNavChooser } from '../../lib/navChooser'
import { useBack } from '../../lib/useBack'
import '../tabs/tabs.css'
import '../restaurant/restaurant.css'
import './tonight.css'

// Table detail (mock I2) — the host's score is badged with their name (it's why
// this table exists). When / Table / Host key-values, who's in, and an inert
// "Take a seat" CTA. Fixture-backed; Website/Call are inert, Directions is real.
export function TonightDetail() {
  const { tableId } = useParams({ from: '/tonight/$tableId' })
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/tonight' }))
  const t = tonightTable(tableId)

  if (!t) {
    return (
      <div className="screen">
        <button type="button" className="link-action" onClick={goBack}>
          ‹ Atrás
        </button>
        <EmptyState>Mesa no encontrada.</EmptyState>
      </div>
    )
  }

  const left = seatsLeft(t)
  const hostFirst = t.host.name.split(' ')[0] ?? t.host.name
  // Fixture data has no lat/lng — a text query, not coordinates (Waze can't
  // take one, so the sheet omits it for a 'query' request; see navChooser.ts).
  const restaurantQuery = `${t.restaurant.name} ${t.restaurant.neighborhood} Santo Domingo`

  return (
    <div className="dish-detail">
      <div className="resto-photo dish-hero">
        <div
          className="tonight-card__img"
          style={{ backgroundImage: `url(/restaurants/${t.restaurant.photo}.jpg)` }}
        />
        <button type="button" className="resto-back" onClick={goBack} aria-label="Atrás">
          ‹
        </button>
        <span className="resto-photo__tag">film · con velas</span>
      </div>

      <div className="dish-detail__body">
        <div className="tonight-detail__head">
          <h1 className="dish-detail__title">{t.restaurant.name}</h1>
          <ScoreBadge
            size="sm"
            score={t.hostScore}
            attribution={{ kind: 'user', label: hostFirst }}
          />
        </div>
        <Characteristics
          cuisine={t.restaurant.cuisine}
          neighborhood={t.restaurant.neighborhood}
          city="Santo Domingo"
        />

        <div className="resto-pills" style={{ marginTop: 'var(--space-4)' }}>
          <button
            type="button"
            className="upill"
            data-stale
            aria-disabled
            onClick={() => comingSoon('El sitio web llega pronto a Mesa.')}
          >
            <span className="upill__icon">
              <WebIcon size={13} />
            </span>{' '}
            Sitio web
          </button>
          <button
            type="button"
            className="upill"
            data-stale
            aria-disabled
            onClick={() => comingSoon('Llamar llega pronto a Mesa.')}
          >
            <span className="upill__icon">
              <PhoneIcon size={13} />
            </span>{' '}
            Llamar
          </button>
          <button
            type="button"
            className="upill"
            onClick={() =>
              openNavChooser({ kind: 'query', query: restaurantQuery, label: t.restaurant.name })
            }
          >
            <span className="upill__icon">
              <DirectionsIcon size={13} />
            </span>{' '}
            Cómo llegar
          </button>
        </div>

        <div className="tonight-kv">
          <div className="tonight-kv__row">
            <span className="tonight-kv__k">Cuándo</span>
            <span className="tonight-kv__v">Esta noche · {t.time}</span>
          </div>
          <div className="tonight-kv__row">
            <span className="tonight-kv__k">Mesa</span>
            <span className="tonight-kv__v">
              {t.seatsTaken} de {t.seatsTotal} cupos ocupados
            </span>
          </div>
          <div className="tonight-kv__row">
            <span className="tonight-kv__k">Organiza</span>
            <span className="tonight-kv__v tonight-kv__host">
              <Avatar name={t.host.name} src={t.host.image} size={24} />
              {t.host.name}
            </span>
          </div>
        </div>

        <div className="section-head">
          <span className="section-head__title">Quién está</span>
        </div>
        <div className="tonight-whos">
          <div className="tonight-whos__person">
            <Avatar name={t.host.name} src={t.host.image} size={44} />
            <span className="tonight-whos__name">{hostFirst}</span>
          </div>
          {t.whoIn.map((p) => (
            <div key={p.name} className="tonight-whos__person">
              <Avatar name={p.name} src={p.image} size={44} />
              <span className="tonight-whos__name">{p.name.split(' ')[0]}</span>
            </div>
          ))}
          <div className="tonight-whos__person">
            <div className="tonight-whos__open">+</div>
            <span className="tonight-whos__name">{left} libres</span>
          </div>
        </div>

        {left === 0 && (
          <Body style={{ marginTop: 'var(--space-4)', color: 'var(--text-muted)' }}>
            Esta mesa está llena.
          </Body>
        )}
      </div>

      <div className="resto-cta-bar">
        <Button
          variant="primary"
          data-stale
          aria-disabled
          disabled={left === 0}
          onClick={() => comingSoon('Unirte a una mesa llega pronto a Mesa.')}
        >
          {left === 0 ? 'Mesa llena' : 'Tomar un puesto'}
        </Button>
      </div>
    </div>
  )
}
