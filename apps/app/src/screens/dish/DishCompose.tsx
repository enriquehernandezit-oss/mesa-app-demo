import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Body, Button, Chip, Eyebrow, SectionHeader, Title, Toggle } from '../../components/ui'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { ApiError, api } from '../../lib/api'
import { filterForGrain, resizeToJpeg } from '../../lib/image'
import type { RestaurantProfileResponse } from '../../lib/types'
import '../tabs/tabs.css'
import '../../styles/screens.css'
import './dish.css'

type Grain = 'candlelit' | 'daylight' | 'none'
const GRAINS: { value: Grain; label: string }[] = [
  { value: 'candlelit', label: 'Candlelit' },
  { value: 'daylight', label: 'Daylight' },
  { value: 'none', label: 'None' },
]

// Post a dish (Phase 6 mocks C1–C2) — a photo attached to a place you've ranked.
// Two steps: C1 choose the shot + treatment, C2 name/caption/toggles + link. The
// linked ranking is required and carries the score, so it's never re-entered.
export function DishCompose() {
  const { restaurant: restaurantId } = useSearch({ from: '/dish' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })

  const [step, setStep] = useState<'photo' | 'details'>('photo')
  const [image, setImage] = useState<string | null>(null)
  const [grain, setGrain] = useState<Grain>('candlelit')
  const [name, setName] = useState('')
  const [caption, setCaption] = useState('')
  const [wantToTry, setWantToTry] = useState(false)
  const [friendsOnly, setFriendsOnly] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)

  const post = useMutation({
    mutationFn: async () => {
      await api.post('/dishes', {
        restaurantId,
        name: name.trim(),
        caption: caption.trim() || undefined,
        image,
        grain,
        visibility: friendsOnly ? 'friends' : 'public',
      })
      if (wantToTry) await api.post('/saved', { restaurantId }).catch(() => {})
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dishes', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      navigate({ to: '/r/$restaurantId', params: { restaurantId } })
    },
  })

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setImage(await resizeToJpeg(file, { maxEdge: 1280, quality: 0.72 }))
    e.target.value = ''
  }

  const restaurant = q.data?.restaurant
  const myRanking = q.data?.myRanking ?? null
  const hasRanked = Boolean(myRanking)

  // Gate: a dish must attach to a ranking.
  if (q.isSuccess && !hasRanked) {
    return (
      <div className="screen">
        <button
          type="button"
          className="link-action"
          onClick={() => navigate({ to: '/r/$restaurantId', params: { restaurantId } })}
        >
          ‹ Back
        </button>
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
          <Eyebrow>Post a dish</Eyebrow>
          <Title>{restaurant?.name ?? 'A dish'}</Title>
        </div>
        <div className="tab-empty">
          <Body>Rank this place first — a dish attaches to your ranking.</Body>
          <Button
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => navigate({ to: '/rank', search: { restaurant: restaurantId } })}
          >
            Rank it
          </Button>
        </div>
      </div>
    )
  }

  const hiddenFile = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      capture="environment"
      style={{ display: 'none' }}
      onChange={onPick}
    />
  )

  // C1 — choose the shot + treatment.
  if (step === 'photo') {
    return (
      <div className="screen">
        <div className="dish-head">
          <button
            type="button"
            className="link-action"
            onClick={() => navigate({ to: '/r/$restaurantId', params: { restaurantId } })}
          >
            ✕ Recents
          </button>
          <button
            type="button"
            className="dish-head__camera"
            onClick={() => fileInput.current?.click()}
          >
            Camera
          </button>
        </div>
        {hiddenFile}

        <button
          type="button"
          className={`dish-photo${image ? ' dish-photo--set' : ''}`}
          onClick={() => fileInput.current?.click()}
          style={
            image ? { backgroundImage: `url(${image})`, filter: filterForGrain(grain) } : undefined
          }
        >
          {!image && <span className="dish-photo__hint">＋ Add a photo</span>}
          {image && <span className="ph-tag dish-photo__tag">film · {grain}</span>}
        </button>

        {image && (
          <div className="dish-grain">
            {GRAINS.map((g) => (
              <Chip
                key={g.value}
                size="sm"
                state={grain === g.value ? 'selected' : 'default'}
                onClick={() => setGrain(g.value)}
              >
                {g.label}
              </Chip>
            ))}
          </div>
        )}

        <div className="spacer" />
        <Button disabled={!image} onClick={() => setStep('details')}>
          Next
        </Button>
      </div>
    )
  }

  // C2 — name, caption, linked ranking, and the two toggles.
  const canPost = name.trim().length > 0 && !post.isPending
  return (
    <div className="screen">
      <button type="button" className="link-action" onClick={() => setStep('photo')}>
        ‹ New dish
      </button>

      <div className="dish-compose-head">
        {image && (
          <div
            className="dish-compose-head__thumb"
            style={{ backgroundImage: `url(${image})`, filter: filterForGrain(grain) }}
          />
        )}
        <div className="dish-compose-head__fields">
          <input
            className="dish-name-input"
            placeholder="Short rib, 14 hours…"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="dish-name-input__label">Dish name</div>
          <input
            className="dish-caption-input"
            placeholder="Falls apart under the fork."
            maxLength={140}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
      </div>

      {myRanking && restaurant && (
        <>
          <SectionHeader>Linked ranking</SectionHeader>
          <div className="dish-linked">
            <div className="dish-linked__main">
              <div className="dish-linked__name">{restaurant.name}</div>
              <Characteristics
                priceTier={restaurant.priceTier}
                cuisine={restaurant.cuisine}
                neighborhood={restaurant.neighborhood?.name}
              />
            </div>
            <ScoreBadge size="sm" score={myRanking.score} attribution={{ kind: 'you' }} />
          </div>
        </>
      )}

      <div className="dish-toggle-row">
        <span>Also add to Want to try</span>
        <Toggle checked={wantToTry} onChange={setWantToTry} label="Also add to Want to try" />
      </div>
      <div className="dish-toggle-row">
        <span>Share to friends only</span>
        <Toggle checked={friendsOnly} onChange={setFriendsOnly} label="Share to friends only" />
      </div>

      {post.error instanceof ApiError && post.error.code === 'rank_it_first' && (
        <div className="error-text">Rank this place first.</div>
      )}

      <div className="spacer" />
      <Button disabled={!canPost} onClick={() => post.mutate()}>
        {post.isPending ? 'Posting…' : 'Post dish'}
      </Button>
    </div>
  )
}
