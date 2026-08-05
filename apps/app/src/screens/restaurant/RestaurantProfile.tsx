import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Eyebrow, SerifItalic } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { api } from '../../lib/api'
import { cloudinaryUrl, mapboxStaticUrl } from '../../lib/media'
import { renderSpotCard, shareCard } from '../../lib/shareCard'
import type { RestaurantProfileResponse } from '../../lib/types'
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

  const { restaurant, friendsRankings, myRanking, saved } = q.data
  const cover = cloudinaryUrl(restaurant.coverImageId, { w: 1000, h: 750 })
  const mapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng)
  const meta = [restaurant.cuisine, restaurant.neighborhood?.name].filter(Boolean).join(' · ')

  async function shareSpot() {
    const blob = await renderSpotCard({
      name: restaurant.name,
      meta,
      position: myRanking?.position ?? null,
      score: myRanking?.score ?? friendsRankings[0]?.score ?? null,
      note: friendsRankings.find((f) => f.note)?.note ?? null,
      coverUrl: cloudinaryUrl(restaurant.coverImageId, { w: 1080, h: 1150 }),
    })
    await shareCard(blob, 'mesa-spot.jpg', `${restaurant.name} en Mesa 🥂`)
  }

  return (
    <div className="resto-screen">
      {/* Full-bleed film-photo hero. */}
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
        <div className="resto-photo__caption">
          <Eyebrow style={{ color: 'var(--brass-2)' }}>
            {restaurant.neighborhood?.name ?? 'Santo Domingo'}
          </Eyebrow>
          <h1 className="resto-name">{restaurant.name}</h1>
          {restaurant.cuisine && <div className="resto-cuisine">{restaurant.cuisine}</div>}
        </div>
      </div>

      <div className="resto-content">
        {myRanking && (
          <div className="resto-mine">
            You ranked this <b>#{myRanking.position}</b> · {Math.round(myRanking.score)}
          </div>
        )}

        <div className="resto-actions">
          <Button
            variant={saved ? 'secondary' : 'primary'}
            onClick={() => toggleSave.mutate(!saved)}
            disabled={toggleSave.isPending}
          >
            {saved ? 'Saved ✓' : 'Want to try'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate({ to: '/rank', search: { restaurant: restaurantId } })}
          >
            {myRanking ? 'Re-rank' : 'Rank it'}
          </Button>
        </div>

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
                <div className="feed-place__score">{Math.round(fr.score)}</div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="link-action" onClick={onBack}>
      ← Back
    </button>
  )
}
