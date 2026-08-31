import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Caption, Chip, EmptyState } from '../../components/ui'
import { DirectionsIcon, PhoneIcon, WebIcon } from '../../components/ui/icons'
import { Characteristics, ScoreBadge, UtilityPill } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { filterForGrain } from '../../lib/image'
import { openNavChooser } from '../../lib/navChooser'
import type { DishDetail as DishDetailData } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import '../tabs/tabs.css'
import '../restaurant/restaurant.css'
import '../user/moderation.css'
import './dish.css'

// UGC report reasons (App Store 1.2) — same set as the user/note reports.
const REASONS = ['Spam', 'Acoso', 'Inapropiado', 'Otro'] as const

// Dish detail (Phase 6 mock C3) — a posted dish, standing on its own: the hero
// photo, its caption, and the linked ranking (the place card carries the poster's
// attributed score). A dish is never free-floating; the place card is the anchor.
export function DishDetail() {
  const { dishId } = useParams({ from: '/dish/$dishId' })
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const q = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => api.get<{ dish: DishDetailData }>(`/dishes/${dishId}`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <div className="screen">
        <Body>Cargando…</Body>
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="screen">
        <button type="button" className="link-action" onClick={goBack}>
          ‹ Atrás
        </button>
        <EmptyState>Plato no encontrado.</EmptyState>
      </div>
    )
  }

  const { dish } = q.data
  const { restaurant } = dish
  const firstName = (dish.user.name || dish.user.handle || '').split(' ')[0] || 'alguien'

  return (
    <div className="dish-detail">
      <div className="resto-photo dish-hero">
        <img src={dish.imageId} alt={dish.name} style={{ filter: filterForGrain(dish.grain) }} />
        <button type="button" className="resto-back" onClick={goBack} aria-label="Atrás">
          ‹
        </button>
        <span className="resto-photo__tag">film · {dish.grain}</span>
      </div>

      <div className="dish-detail__body">
        <h1 className="dish-detail__title">{dish.name}</h1>
        {dish.caption && <div className="dish-detail__caption">“{dish.caption}”</div>}

        <Link
          to="/r/$restaurantId"
          params={{ restaurantId: restaurant.id }}
          className="dish-place-card"
        >
          <div className="dish-place-card__main">
            <div className="dish-place-card__name">{restaurant.name}</div>
            <Characteristics
              priceTier={restaurant.priceTier}
              cuisine={restaurant.cuisine}
              neighborhood={dish.neighborhood}
              hours={restaurant.closesAt ? `hasta ${restaurant.closesAt}` : null}
            />
          </div>
          <ScoreBadge
            size="sm"
            score={dish.score}
            attribution={dish.posterIsMe ? { kind: 'you' } : { kind: 'user', label: firstName }}
          />
        </Link>

        <div className="resto-pills">
          {restaurant.website && (
            <UtilityPill
              icon={<WebIcon size={13} />}
              href={restaurant.website}
              target="_blank"
              rel="noreferrer"
            >
              Sitio web
            </UtilityPill>
          )}
          {restaurant.phone && (
            <UtilityPill icon={<PhoneIcon size={13} />} href={`tel:${restaurant.phone}`}>
              Llamar
            </UtilityPill>
          )}
          <UtilityPill
            icon={<DirectionsIcon size={13} />}
            onClick={() =>
              openNavChooser({
                kind: 'coords',
                lat: restaurant.lat,
                lng: restaurant.lng,
                label: restaurant.name,
              })
            }
          >
            Cómo llegar
          </UtilityPill>
        </div>

        {/* A dish is UGC — someone else's photo/caption must be reportable
            (App Store 1.2). Hidden on your own post. */}
        {!dish.posterIsMe && <DishReport dishId={dishId} />}
      </div>
    </div>
  )
}

function DishReport({ dishId }: { dishId: string }) {
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'dish', targetId: dishId, reason }),
  })
  if (report.isSuccess) {
    return <div className="report-done">Reportado. Gracias — lo revisaremos.</div>
  }
  return (
    <div className="ranking-actions">
      {!open ? (
        <button
          type="button"
          className="link-action link-action--danger"
          onClick={() => setOpen(true)}
        >
          Reportar este plato
        </button>
      ) : (
        <div className="report-panel">
          <Caption>¿Por qué reportas este plato?</Caption>
          <div className="report-reasons">
            {REASONS.map((reason) => (
              <Chip
                key={reason}
                state="default"
                onClick={() => !report.isPending && report.mutate(reason)}
              >
                {reason}
              </Chip>
            ))}
          </div>
          <button type="button" className="link-action" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
