import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Body, Button, Eyebrow, SectionHeader, SerifItalic } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics, ScoreBadge, UtilityPill } from '../../components/ui/patterns'
import { api, apiOrigin } from '../../lib/api'
import { displayScore, priceLabel } from '../../lib/display'
import { filterForGrain } from '../../lib/image'
import { cloudinaryUrl, mapboxStaticUrl } from '../../lib/media'
import { getFriendsOnlyScores } from '../../lib/prefs'
import { renderSpotCard, shareCard } from '../../lib/shareCard'
import type { Dish, RestaurantProfileResponse } from '../../lib/types'
import '../dish/dish.css'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../tabs/feed.css'
import './restaurant.css'

// Reserve time slots (mock D2). Inert-by-design — Mesa has no booking supply, so
// these render live but do nothing, like the feed's Reserve pill.
const RESERVE_SLOTS = ['7:00p', '7:15p', '9:30p', 'more']

// Restaurant profile (Phase 6 mocks D1/D2): film-photo hero, identity with the
// aggregate score + list pills, the attributed score trio, an inert reserve
// strip, popular dishes, and friends' scores. One ink CTA ("Rank this place")
// stays fixed at the bottom — it never leaves.
export function RestaurantProfile() {
  const { restaurantId } = useParams({ from: '/r/$restaurantId' })
  const navigate = useNavigate()
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
          <Body>Loading…</Body>
        </div>
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="resto-screen">
        <div className="resto-content">
          <button
            type="button"
            className="link-action"
            onClick={() => navigate({ to: '/discover' })}
          >
            ← Back
          </button>
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Place not found.</SerifItalic>
          </div>
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
  const cover = cloudinaryUrl(restaurant.coverImageId, { w: 1000, h: 750 })
  const mapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`
  const meta = [restaurant.cuisine, restaurant.neighborhood?.name, priceLabel(restaurant.priceTier)]
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
      <CondensedHeader
        name={restaurant.name}
        score={allMesa.avg}
        onBack={() => navigate({ to: '/discover' })}
      />

      {/* Film-photo hero — clean image, floating controls; identity sits below. */}
      <div className={`resto-photo${cover ? '' : ' resto-photo--empty'}`}>
        {cover && <img src={cover} alt={restaurant.name} />}
        <button
          type="button"
          className="resto-back"
          onClick={() => navigate({ to: '/discover' })}
          aria-label="Back"
        >
          ←
        </button>
        <button
          type="button"
          className="resto-back resto-share"
          onClick={shareSpot}
          aria-label="Share"
        >
          ↗
        </button>
        <span className="resto-photo__tag">film · candlelit</span>
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
            {myRanking && (
              <button type="button" className="resto-rankagain" onClick={() => navigate(rankHref)}>
                Rank again
              </button>
            )}
            <button
              type="button"
              className={`resto-savecheck${saved ? ' resto-savecheck--on' : ''}`}
              aria-label={saved ? 'Saved — tap to remove' : 'Want to try'}
              aria-pressed={saved}
              onClick={() => toggleSave.mutate(!saved)}
              disabled={toggleSave.isPending}
            >
              ✓
            </button>
          </div>
          {allMesa.avg != null && showMesa && (
            <div className="resto-agg">
              <span className="resto-agg__score">{displayScore(allMesa.avg)}</span>
              <span className="resto-agg__count">{allMesa.count} rankings</span>
            </div>
          )}
          {lists.length > 0 && (
            <div className="resto-lists">
              {lists.map((l) => (
                <UtilityPill
                  key={l.slug}
                  icon="▤"
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
            hours={restaurant.closesAt ? `till ${restaurant.closesAt}` : null}
            social={
              friendsWantToTry.count > 0
                ? {
                    people: friendsWantToTry.people,
                    label: `${friendsWantToTry.count} friend${friendsWantToTry.count > 1 ? 's' : ''} want to try`,
                  }
                : null
            }
          />
        </div>

        {/* Utility pills — Website · Call · Directions (mock order). */}
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
            Directions
          </UtilityPill>
        </div>

        {/* The badged score trio — every score is attributed, never the place's own. */}
        {(myRanking || friendAvg != null || allMesa.avg != null) && (
          <>
            <SectionHeader>Scores</SectionHeader>
            <div className="resto-scores">
              {myRanking && (
                <ScoreBadge
                  score={myRanking.score}
                  attribution={{ kind: 'you' }}
                  caption="Your score"
                  sub={`#${myRanking.position} on your list`}
                />
              )}
              {friendAvg != null && (
                <ScoreBadge
                  score={friendAvg}
                  attribution={{ kind: 'friends', count: friendsRankings.length }}
                  caption="Friends"
                  sub="what they think"
                />
              )}
              {allMesa.avg != null && showMesa && (
                <ScoreBadge
                  score={allMesa.avg}
                  attribution={{ kind: 'mesa', count: allMesa.count }}
                  caption="All of Mesa"
                  sub={`${allMesa.count} ranked`}
                />
              )}
            </div>
          </>
        )}

        {/* Reserve a table — inert-by-design (no booking supply). */}
        <SectionHeader action={<span className="resto-reserve__meta">2 · tonight ✎</span>}>
          Reserve a table
        </SectionHeader>
        <div className="resto-reserve">
          {RESERVE_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              className={`resto-time${slot === 'more' ? ' resto-time--more' : ''}`}
              data-stale
              aria-disabled
            >
              {slot}
            </button>
          ))}
        </div>

        <PopularDishes restaurantId={restaurantId} canAdd={Boolean(myRanking)} />

        <TheirScores rankings={friendsRankings} />

        {mapUrl ? (
          <img className="resto-map" src={mapUrl} alt={`Map of ${restaurant.name}`} />
        ) : (
          <div className="resto-map resto-map--fallback">
            {restaurant.neighborhood?.name ?? 'Santo Domingo'} · map
          </div>
        )}

        {/* Similar spots rail. */}
        {similar.length > 0 && (
          <>
            <SectionHeader>Similar spots</SectionHeader>
            <div className="rail__scroll">
              {similar.map((s) => {
                const sc = cloudinaryUrl(s.coverImageId, { w: 320, h: 400 })
                return (
                  <Link
                    key={s.id}
                    to="/r/$restaurantId"
                    params={{ restaurantId: s.id }}
                    className="rail-card"
                    style={sc ? { backgroundImage: `url(${sc})` } : undefined}
                  >
                    <span className="rail-card__name">{s.name}</span>
                    <span className="rail-card__meta">
                      {[s.cuisine, s.neighborhood].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* The one ink CTA — fixed, never leaves (mock D2). */}
      <div className="resto-cta-bar">
        <Button variant="primary" onClick={() => navigate(rankHref)}>
          Rank this place
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
      <button type="button" className="resto-condensed__back" onClick={onBack} aria-label="Back">
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
        <SectionHeader>Their scores</SectionHeader>
        <Body>When people you follow rank this, they'll show up here.</Body>
      </>
    )
  }
  const shown = expanded ? rankings : rankings.slice(0, 3)
  return (
    <>
      <SectionHeader>Their scores</SectionHeader>
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
          {expanded ? 'Show fewer' : `See all ${rankings.length} rankings ›`}
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
              + Add a dish
            </button>
          ) : undefined
        }
      >
        Popular dishes
      </SectionHeader>
      {dishes.length === 0 ? (
        <Body>No dishes yet — be the first.</Body>
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
                by {(d.user.name || d.user.handle || '').split(' ')[0]}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
