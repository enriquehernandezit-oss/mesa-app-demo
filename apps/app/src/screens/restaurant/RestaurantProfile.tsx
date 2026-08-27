import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Body, Button, EmptyState, Eyebrow, SectionHeader } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { PlaceCover } from '../../components/ui/PlaceCover'
import {
  BackIcon,
  CheckIcon,
  DirectionsIcon,
  ListIcon,
  PencilIcon,
  PhoneIcon,
  ShareIcon,
  WebIcon,
} from '../../components/ui/icons'
import { Characteristics, ScoreBadge, UtilityPill } from '../../components/ui/patterns'
import { api, apiOrigin } from '../../lib/api'
import { comingSoon } from '../../lib/comingSoon'
import { cuisineLabel, displayScore, priceLabel } from '../../lib/display'
import { filterForGrain } from '../../lib/image'
import { cloudinaryUrl, mapboxStaticUrl } from '../../lib/media'
import { openNavChooser } from '../../lib/navChooser'
import { getFriendsOnlyScores } from '../../lib/prefs'
import { renderSpotCard, shareCard } from '../../lib/shareCard'
import type { Dish, RestaurantProfileResponse } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import '../dish/dish.css'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../tabs/feed.css'
import './restaurant.css'

// Reserve time slots (mock D2). Inert-by-design — Mesa has no booking supply, so
// these render live but do nothing, like the feed's Reserve pill.
const RESERVE_SLOTS = ['7:00p', '7:15p', '9:30p', 'más']

// Restaurant profile (Phase 6 mocks D1/D2): film-photo hero, identity with the
// aggregate score + list pills, the attributed score trio, an inert reserve
// strip, popular dishes, and friends' scores. One ink CTA ("Rank this place")
// stays fixed at the bottom — it never leaves.
export function RestaurantProfile() {
  const { restaurantId } = useParams({ from: '/r/$restaurantId' })
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })

  const toggleSave = useMutation({
    mutationFn: (save: boolean) =>
      save ? api.post('/saved', { restaurantId }) : api.del(`/saved/${restaurantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
    },
  })

  if (q.isPending) {
    return (
      <div className="resto-screen">
        <div className="resto-content">
          <Body>Cargando…</Body>
        </div>
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="resto-screen">
        <div className="resto-content">
          <button type="button" className="link-action" onClick={goBack}>
            ‹ Atrás
          </button>
          <EmptyState>Spot no encontrado.</EmptyState>
        </div>
      </div>
    )
  }

  const {
    restaurant,
    friendsRankings,
    friendAvg,
    occasionTags,
    allMesa,
    lists,
    similar,
    friendsWantToTry,
    myRanking,
    saved,
  } = q.data
  const mapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng)
  // M9: a Google-created (or Google-enriched) place with no photo and a real
  // geocode gets a tinted map as its hero instead of the generated editorial
  // mark — the picture "of" a place with no photo is where it is. The lower
  // locator map is then redundant (one map per profile), so it's hidden.
  // Gated on mapUrl (i.e. a MapBox token is actually configured) — without
  // one, PlaceCover's map attempt silently falls back to the generated mark
  // anyway, and this must fall back in lockstep or the locator map disappears
  // too, leaving the profile with no map at all.
  const mapCover =
    Boolean(mapUrl) &&
    !restaurant.coverImageId &&
    restaurant.geoPrecision === 'exact' &&
    restaurant.google
  const meta = [
    cuisineLabel(restaurant.cuisine),
    restaurant.neighborhood?.name,
    priceLabel(restaurant.priceTier),
  ]
    .filter(Boolean)
    .join(' · ')
  const rankHref = { to: '/rank', search: { restaurant: restaurantId } } as const
  // "Friends-only scores" pref (Settings H1) hides the all-of-Mesa aggregate.
  const showMesa = !getFriendsOnlyScores()

  async function shareSpot() {
    const blob = await renderSpotCard({
      name: restaurant.name,
      meta,
      position: myRanking?.position ?? null,
      score: myRanking?.score ?? friendsRankings[0]?.score ?? null,
      note: friendsRankings.find((f) => f.note)?.note ?? null,
      coverUrl: cloudinaryUrl(restaurant.coverImageId, { w: 1080, h: 1150 }),
    })
    await shareCard(
      blob,
      'mesa-spot.jpg',
      `${restaurant.name} en Mesa 🥂\n${apiOrigin}/p/spot/${restaurant.id}`,
    )
  }

  return (
    <div className="resto-screen">
      <CondensedHeader name={restaurant.name} score={allMesa.avg} onBack={goBack} />

      {/* Film-photo hero — clean image, floating controls; identity sits below.
          A Google-created place with no photo gets a tinted map hero instead
          (M9) — its own "Cómo llegar" tap target replaces the film tag. */}
      <div className="resto-photo">
        <PlaceCover
          seed={restaurant.id}
          name={restaurant.name}
          coverImageId={restaurant.coverImageId}
          map={mapCover ? { lat: restaurant.lat, lng: restaurant.lng } : null}
          size={{ w: 1000, h: 750 }}
          className="resto-photo__cover"
          alt={restaurant.name}
        />
        <button type="button" className="resto-back" onClick={goBack} aria-label="Atrás">
          <BackIcon size={20} />
        </button>
        <button
          type="button"
          className="resto-back resto-share"
          onClick={shareSpot}
          aria-label="Compartir"
        >
          <ShareIcon size={18} />
        </button>
        {mapCover ? (
          <button
            type="button"
            className="resto-photo__directions"
            onClick={() =>
              openNavChooser({
                kind: 'coords',
                lat: restaurant.lat,
                lng: restaurant.lng,
                label: restaurant.name,
              })
            }
          >
            Cómo llegar ›
          </button>
        ) : (
          <span className="resto-photo__tag">film · con velas</span>
        )}
      </div>
      <div id="resto-hero-end" />

      <div className="resto-content">
        {/* Identity, on the paper ground below the photo. */}
        <div className="resto-head">
          <Eyebrow style={{ color: 'var(--accent)' }}>
            {restaurant.neighborhood?.name ?? 'Santo Domingo'}
          </Eyebrow>
          <div className="resto-title-row">
            <h1 className="resto-title">{restaurant.name}</h1>
            {/* No inline "Rankear otra vez" here: the fixed bottom bar is the one
               CTA and adapts its label when you've already ranked, so this used
               to be a duplicate of it (same nav, one screen, two filled-ish
               calls to action). */}
            <button
              type="button"
              className={`resto-savecheck${saved ? ' resto-savecheck--on' : ''}`}
              aria-label={saved ? 'Guardado — toca para quitar' : 'Quiero probar'}
              aria-pressed={saved}
              onClick={() => toggleSave.mutate(!saved)}
              disabled={toggleSave.isPending}
            >
              <CheckIcon size={17} />
            </button>
          </div>
          {allMesa.avg != null && showMesa && (
            <div className="resto-agg">
              <span className="resto-agg__score">{displayScore(allMesa.avg)}</span>
              <span className="resto-agg__count">{allMesa.count} rankeados</span>
            </div>
          )}
          {restaurant.address && <div className="resto-address">{restaurant.address}</div>}
          {lists.length > 0 && (
            <div className="resto-lists">
              {lists.map((l) => (
                <UtilityPill
                  key={l.slug}
                  icon={<ListIcon size={13} />}
                  onClick={() => navigate({ to: '/lists/$slug', params: { slug: l.slug } })}
                >
                  {l.title}
                </UtilityPill>
              ))}
            </div>
          )}
          <Characteristics
            occasionTags={occasionTags}
            priceTier={restaurant.priceTier}
            cuisine={restaurant.cuisine}
            neighborhood={restaurant.neighborhood?.name}
            city="Santo Domingo"
            hours={restaurant.closesAt ? `hasta ${restaurant.closesAt}` : null}
            social={
              friendsWantToTry.count > 0
                ? {
                    people: friendsWantToTry.people,
                    label: `${friendsWantToTry.count} amigo${friendsWantToTry.count > 1 ? 's' : ''} quiere${friendsWantToTry.count > 1 ? 'n' : ''} probar`,
                  }
                : null
            }
          />
        </div>

        {/* Utility pills — Website · Call · Directions (mock order). */}
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

        {/* The badged score trio — every score is attributed, never the place's own. */}
        {(myRanking || friendAvg != null || allMesa.avg != null) && (
          <>
            <SectionHeader>Puntuaciones</SectionHeader>
            <div className="resto-scores">
              {myRanking && (
                <ScoreBadge
                  score={myRanking.score}
                  attribution={{ kind: 'you' }}
                  caption="Tu puntuación"
                  sub={`#${myRanking.position} en tu lista`}
                />
              )}
              {friendAvg != null && (
                <ScoreBadge
                  score={friendAvg}
                  attribution={{ kind: 'friends', count: friendsRankings.length }}
                  sub="lo que piensan"
                />
              )}
              {allMesa.avg != null && showMesa && (
                <ScoreBadge
                  score={allMesa.avg}
                  attribution={{ kind: 'mesa', count: allMesa.count }}
                  caption="Todo Mesa"
                  sub={`${allMesa.count} rankeados`}
                />
              )}
            </div>
          </>
        )}

        {/* Reserve a table — inert-by-design (no booking supply). */}
        <SectionHeader
          action={
            <span className="resto-reserve__meta">
              2 · esta noche <PencilIcon size={11} />
            </span>
          }
        >
          Reservar una mesa
        </SectionHeader>
        <div className="resto-reserve">
          {RESERVE_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              className={`resto-time${slot === 'more' ? ' resto-time--more' : ''}`}
              data-stale
              aria-disabled
              onClick={() => comingSoon('Reservar una mesa llega pronto a Mesa.')}
            >
              {slot}
            </button>
          ))}
        </div>

        <PopularDishes restaurantId={restaurantId} canAdd={Boolean(myRanking)} />

        <TheirScores rankings={friendsRankings} />

        {/* Tapping the map opens directions — same chooser as the "Cómo llegar"
            pill above. The whole region is the tap target, image or fallback.
            Hidden when the hero itself is the map (M9) — one map per profile. */}
        {!mapCover && (
          <button
            type="button"
            className="resto-map-btn"
            aria-label={`Cómo llegar a ${restaurant.name}`}
            onClick={() =>
              openNavChooser({
                kind: 'coords',
                lat: restaurant.lat,
                lng: restaurant.lng,
                label: restaurant.name,
              })
            }
          >
            {mapUrl ? (
              <img
                className="resto-map"
                src={mapUrl}
                alt={`Mapa de ${restaurant.name}`}
                loading="lazy"
              />
            ) : (
              <div className="resto-map resto-map--fallback">
                {restaurant.neighborhood?.name ?? 'Santo Domingo'} · mapa
              </div>
            )}
            <span className="resto-map__hint">Cómo llegar ›</span>
          </button>
        )}

        {/* Required Google attribution whenever this profile's data came from
            Google (M9) — off-map, so a text line is the compliant-enough
            interim; swap for the official logo asset before a real launch. */}
        {restaurant.google && <div className="resto-google-attr">Powered by Google</div>}

        {/* Similar spots rail. */}
        {similar.length > 0 && (
          <>
            <SectionHeader>Spots parecidos</SectionHeader>
            <div className="rail__scroll">
              {similar.map((s) => {
                return (
                  <Link
                    key={s.id}
                    to="/r/$restaurantId"
                    params={{ restaurantId: s.id }}
                    className="rail-card"
                  >
                    <PlaceCover
                      seed={s.id}
                      name={s.name}
                      coverImageId={s.coverImageId}
                      size={{ w: 320, h: 400 }}
                      className="rail-card__cover"
                    />
                    <span className="rail-card__name">{s.name}</span>
                    <span className="rail-card__meta">
                      {[cuisineLabel(s.cuisine), s.neighborhood].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* The one ink CTA — fixed, never leaves (mock D2). Adapts to whether you
          already have a ranking here, so it carries the re-rank action too and
          nothing else on the screen has to duplicate it. */}
      <div className="resto-cta-bar">
        <Button variant="primary" onClick={() => navigate(rankHref)}>
          {myRanking ? 'Rankear otra vez' : 'Rankear este spot'}
        </Button>
      </div>
    </div>
  )
}

// A sticky condensed header ("‹ Lumbre 8.8") that fades in once the hero photo
// scrolls out of view (mock D2). A rAF-throttled scroll listener keyed off the
// hero sentinel's position — robust across webviews.
function CondensedHeader({
  name,
  score,
  onBack,
}: {
  name: string
  score: number | null
  onBack: () => void
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = document.getElementById('resto-hero-end')
      // Show once the hero's bottom edge has scrolled above the top of the frame.
      setShown(el ? el.getBoundingClientRect().top < 8 : false)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div
      className={`resto-condensed${shown ? ' resto-condensed--shown' : ''}`}
      aria-hidden={!shown}
    >
      <button type="button" className="resto-condensed__back" onClick={onBack} aria-label="Atrás">
        ‹
      </button>
      <span className="resto-condensed__name">{name}</span>
      {score != null && <span className="resto-condensed__score">{displayScore(score)}</span>}
    </div>
  )
}

// Friends' scores (mock D2 "Their scores") — avatar + name + serif-italic quote +
// serif score. Capped at 3 with a "See all N rankings" expander.
function TheirScores({ rankings }: { rankings: RestaurantProfileResponse['friendsRankings'] }) {
  const [expanded, setExpanded] = useState(false)
  if (rankings.length === 0) {
    return (
      <>
        <SectionHeader>Sus puntuaciones</SectionHeader>
        <Body>Cuando alguien que sigues rankee esto, aparecerá aquí.</Body>
      </>
    )
  }
  const shown = expanded ? rankings : rankings.slice(0, 3)
  return (
    <>
      <SectionHeader>Sus puntuaciones</SectionHeader>
      {shown.map((fr) => (
        <Link
          key={fr.user.id}
          to="/u/$userId"
          params={{ userId: fr.user.id }}
          className="resto-friend"
        >
          <Avatar name={fr.user.name || fr.user.handle || 'm'} src={fr.user.image} size={34} />
          <div className="resto-friend__main">
            <div className="feed-who__name">{fr.user.name || fr.user.handle}</div>
            {fr.note && <div className="resto-friend__note">“{fr.note}”</div>}
          </div>
          <div className="feed-place__score">{displayScore(fr.score)}</div>
        </Link>
      ))}
      {rankings.length > 3 && (
        <button type="button" className="resto-seeall" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Mostrar menos' : `Ver los ${rankings.length} rankings ›`}
        </button>
      )}
    </>
  )
}

// Popular dishes — a photo rail of dishes friends posted here, with an entry to
// post your own (only if you've ranked the place). Dish detail arrives in M7.
function PopularDishes({ restaurantId, canAdd }: { restaurantId: string; canAdd: boolean }) {
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['dishes', restaurantId],
    queryFn: () => api.get<{ dishes: Dish[] }>(`/dishes/restaurant/${restaurantId}`),
  })
  const dishes = q.data?.dishes ?? []
  if (dishes.length === 0 && !canAdd) return null

  return (
    <>
      <SectionHeader
        action={
          canAdd ? (
            <button
              type="button"
              className="resto-adddish"
              onClick={() => navigate({ to: '/dish', search: { restaurant: restaurantId } })}
            >
              + Agregar un plato
            </button>
          ) : undefined
        }
      >
        Platos populares
      </SectionHeader>
      {dishes.length === 0 ? (
        <Body>Todavía no hay platos — sé el primero.</Body>
      ) : (
        <div className="dish-rail">
          {dishes.map((d) => (
            <Link key={d.id} to="/dish/$dishId" params={{ dishId: d.id }} className="dish-card">
              <img
                className="dish-card__photo"
                src={d.imageId}
                alt={d.name}
                style={{ filter: filterForGrain(d.grain) }}
                loading="lazy"
              />
              <div className="dish-card__name">{d.name}</div>
              <div className="dish-card__by">
                por {(d.user.name || d.user.handle || '').split(' ')[0]}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
