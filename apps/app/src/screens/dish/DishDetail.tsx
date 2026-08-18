import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { Body, SerifItalic } from '../../components/ui'
import { Characteristics, ScoreBadge, UtilityPill } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { filterForGrain } from '../../lib/image'
import type { DishDetail as DishDetailData } from '../../lib/types'
import '../tabs/tabs.css'
import '../restaurant/restaurant.css'
import './dish.css'

// Dish detail (Phase 6 mock C3) — a posted dish, standing on its own: the hero
// photo, its caption, and the linked ranking (the place card carries the poster's
// attributed score). A dish is never free-floating; the place card is the anchor.
export function DishDetail() {
  const { dishId } = useParams({ from: '/dish/$dishId' })
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => api.get<{ dish: DishDetailData }>(`/dishes/${dishId}`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <div className="screen">
        <Body>Loading…</Body>
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="screen">
        <button type="button" className="link-action" onClick={() => navigate({ to: '/discover' })}>
          ‹ Back
        </button>
        <div className="tab-empty">
          <SerifItalic style={{ fontSize: '1.15rem' }}>Dish not found.</SerifItalic>
        </div>
      </div>
    )
  }

  const { dish } = q.data
  const { restaurant } = dish
  const firstName = (dish.user.name || dish.user.handle || '').split(' ')[0] || 'them'
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`

  return (
    <div className="dish-detail">
      <div className="resto-photo dish-hero">
        <img src={dish.imageId} alt={dish.name} style={{ filter: filterForGrain(dish.grain) }} />
        <button
          type="button"
          className="resto-back"
          onClick={() =>
            navigate({ to: '/r/$restaurantId', params: { restaurantId: restaurant.id } })
          }
          aria-label="Back"
        >
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
              hours={restaurant.closesAt ? `till ${restaurant.closesAt}` : null}
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
            <UtilityPill icon="◉" href={restaurant.website} target="_blank" rel="noreferrer">
              Website
            </UtilityPill>
          )}
          {restaurant.phone && (
            <UtilityPill icon="☏" href={`tel:${restaurant.phone}`}>
              Call
            </UtilityPill>
          )}
          <UtilityPill icon="▸" href={mapsUrl} target="_blank" rel="noreferrer">
            Route
          </UtilityPill>
        </div>
      </div>
    </div>
  )
}
