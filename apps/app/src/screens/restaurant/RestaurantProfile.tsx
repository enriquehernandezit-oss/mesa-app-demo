import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Eyebrow, SerifItalic } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics, ScoreBadge, UtilityPill } from '../../components/ui/patterns'
import { api, apiOrigin } from '../../lib/api'
import { displayScore, priceLabel } from '../../lib/display'
import { filterForGrain } from '../../lib/image'
import { cloudinaryUrl, mapboxStaticUrl } from '../../lib/media'
import { renderSpotCard, shareCard } from '../../lib/shareCard'
import type { Dish, RestaurantProfileResponse } from '../../lib/types'
import '../dish/dish.css'
import { ReserveSheet } from './ReserveSheet'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../tabs/feed.css'
import './restaurant.css'
import './reserve.css'

// Restaurant profile (M4/M5): a film-photo hero, which friends ranked it (+ vibe
// notes), reserve-by-WhatsApp handoff, and a map. Cover + map are env-gated
// (seed photos ship locally; a real Cloudinary id / MapBox token drop in later).
export function RestaurantProfile() {
  const { restaurantId } = useParams({ from: '/r/$restaurantId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [reserving, setReserving] = useState(false)

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
          <BackLink onBack={() => navigate({ to: '/discover' })} />
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
    myRanking,
    saved,
  } = q.data
  const cover = cloudinaryUrl(restaurant.coverImageId, { w: 1000, h: 750 })
  const mapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`
  const meta = [restaurant.cuisine, restaurant.neighborhood?.name, priceLabel(restaurant.priceTier)]
    .filter(Boolean)
    .join(' · ')

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

      <div className="resto-content">
        {/* Identity, on the paper ground below the photo. */}
        <div className="resto-head">
          <Eyebrow style={{ color: 'var(--accent)' }}>
            {restaurant.neighborhood?.name ?? 'Santo Domingo'}
          </Eyebrow>
          <h1 className="resto-title">{restaurant.name}</h1>
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
          />
        </div>

        {/* Utility pills. */}
        <div className="resto-pills">
          {restaurant.phone && (
            <UtilityPill icon="☏" href={`tel:${restaurant.phone}`}>
              Llamar
            </UtilityPill>
          )}
          <UtilityPill icon="▸" href={mapsUrl} target="_blank" rel="noreferrer">
            Cómo llegar
          </UtilityPill>
        </div>

        {/* The badged score trio — every score is attributed, never the place's own. */}
        {(myRanking || friendAvg != null || allMesa.avg != null) && (
          <>
            <Eyebrow style={{ color: 'var(--accent-strong)', marginBottom: 'var(--space-3)' }}>
              Scores
            </Eyebrow>
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
              {allMesa.avg != null && (
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

        <div className="resto-actions">
          <Button
            variant="primary"
            onClick={() => navigate({ to: '/rank', search: { restaurant: restaurantId } })}
          >
            {myRanking ? 'Re-rank' : 'Rank it'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => toggleSave.mutate(!saved)}
            disabled={toggleSave.isPending}
          >
            {saved ? 'Saved ✓' : 'Want to try'}
          </Button>
        </div>

        <PopularDishes restaurantId={restaurantId} canAdd={Boolean(myRanking)} />

        {restaurant.phone &&
          (reserving ? (
            <ReserveSheet
              restaurantName={restaurant.name}
              phone={restaurant.phone}
              onClose={() => setReserving(false)}
            />
          ) : (
            <Button
              variant="secondary"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => setReserving(true)}
            >
              Request a table
            </Button>
          ))}

        {mapUrl ? (
          <img className="resto-map" src={mapUrl} alt={`Map of ${restaurant.name}`} />
        ) : (
          <div className="resto-map resto-map--fallback">
            {restaurant.neighborhood?.name ?? 'Santo Domingo'} · map
          </div>
        )}

        <Eyebrow style={{ margin: 'var(--space-6) 0 var(--space-3)' }}>
          {friendsRankings.length > 0 ? 'Ranked by friends' : 'No friends here yet'}
        </Eyebrow>

        {friendsRankings.length === 0 ? (
          <Body>When people you follow rank this, they'll show up here.</Body>
        ) : (
          friendsRankings.map((fr) => {
            return (
              <Link
                key={fr.user.id}
                to="/u/$userId"
                params={{ userId: fr.user.id }}
                className="resto-friend"
              >
                <Avatar
                  name={fr.user.name || fr.user.handle || 'm'}
                  src={fr.user.image}
                  size={34}
                />
                <div className="resto-friend__main">
                  <div className="feed-who__name">{fr.user.name || fr.user.handle}</div>
                  {fr.note && (
                    <div className="feed-note" style={{ fontSize: '1.05rem' }}>
                      “{fr.note}”
                    </div>
                  )}
                </div>
                <div className="feed-place__score">{displayScore(fr.score)}</div>
              </Link>
            )
          })
        )}

        {/* Similar spots rail. */}
        {similar.length > 0 && (
          <>
            <Eyebrow style={{ margin: 'var(--space-6) 0 var(--space-3)' }}>Similares</Eyebrow>
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
    </div>
  )
}

// Popular dishes — a photo rail of dishes friends posted here, with an entry to
// post your own (only if you've ranked the place).
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
      <div className="resto-dishes-head">
        <Eyebrow style={{ margin: 'var(--space-6) 0 var(--space-3)' }}>Popular dishes</Eyebrow>
        {canAdd && (
          <button
            type="button"
            className="link-action"
            onClick={() => navigate({ to: '/dish', search: { restaurant: restaurantId } })}
          >
            + Add a dish
          </button>
        )}
      </div>
      {dishes.length === 0 ? (
        <Body>No dishes yet — be the first.</Body>
      ) : (
        <div className="dish-rail">
          {dishes.map((d) => (
            <div key={d.id} className="dish-card">
              <img
                className="dish-card__photo"
                src={d.imageId}
                alt={d.name}
                style={{ filter: filterForGrain(d.grain) }}
                loading="lazy"
              />
              <div className="dish-card__name">{d.name}</div>
              <div className="dish-card__by">{d.user.name || d.user.handle}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="link-action" onClick={onBack}>
      ← Back
    </button>
  )
}
