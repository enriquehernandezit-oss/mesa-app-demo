import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Caption, Eyebrow, SerifItalic } from '../../components/ui'
import { api } from '../../lib/api'
import { cloudinaryUrl, mapboxStaticUrl } from '../../lib/media'
import type { RestaurantProfileResponse } from '../../lib/types'
import { ReserveSheet } from './ReserveSheet'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../tabs/feed.css'
import './restaurant.css'
import './reserve.css'

// Restaurant profile (M4): the place, which friends ranked it (+ their vibe
// notes), and your own state — saved or ranked. The MapBox map and a Cloudinary
// cover photo land in M5; this ships the social substance.
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
      <div className="tab-shell">
        <div className="tab-body">
          <Body>Loading…</Body>
        </div>
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="tab-shell">
        <div className="tab-body">
          <BackLink onBack={() => navigate({ to: '/discover' })} />
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Place not found.</SerifItalic>
          </div>
        </div>
      </div>
    )
  }

  const { restaurant, friendsRankings, myRanking, saved } = q.data
  const cover = cloudinaryUrl(restaurant.coverImageId, { w: 800, h: 360 })
  const mapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng)

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <BackLink onBack={() => navigate({ to: '/discover' })} />

        {/* Cover photo (Cloudinary) — a branded fallback when none is set. */}
        {cover ? (
          <img className="resto-cover" src={cover} alt={restaurant.name} />
        ) : (
          <div className="resto-cover resto-cover--fallback">{restaurant.name}</div>
        )}

        <div className="resto-hero">
          <Eyebrow>{restaurant.neighborhood?.name ?? 'Santo Domingo'}</Eyebrow>
          <h1 className="resto-name">{restaurant.name}</h1>
          {restaurant.cuisine && <Caption>{restaurant.cuisine}</Caption>}
          {myRanking && (
            <div className="resto-mine">
              You ranked this <b>#{myRanking.position}</b> · {Math.round(myRanking.score)}
            </div>
          )}
        </div>

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

        {/* Reserve = handoff. Only when the restaurant has a number on file. */}
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

        {/* Map (MapBox static) — a branded fallback with no token configured. */}
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
            const initial = (fr.user.name || fr.user.handle || 'm').trim().charAt(0).toLowerCase()
            return (
              <Link
                key={fr.user.id}
                to="/u/$userId"
                params={{ userId: fr.user.id }}
                className="resto-friend"
              >
                <div className="feed-avatar">{initial}</div>
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
