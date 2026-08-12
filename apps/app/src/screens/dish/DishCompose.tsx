import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Body, Button, Chip, Eyebrow, Title } from '../../components/ui'
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

// Post a dish (Phase 6) — a photo attached to a place you've ranked. Photo →
// grain → name/caption → post. Reached from a restaurant you've ranked.
export function DishCompose() {
  const { restaurant: restaurantId } = useSearch({ from: '/dish' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })

  const [image, setImage] = useState<string | null>(null)
  const [grain, setGrain] = useState<Grain>('candlelit')
  const [name, setName] = useState('')
  const [caption, setCaption] = useState('')
  const [alsoFavorite, setAlsoFavorite] = useState(false)
  const [friendsOnly, setFriendsOnly] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)

  const post = useMutation({
    mutationFn: () =>
      api.post('/dishes', {
        restaurantId,
        name: name.trim(),
        caption: caption.trim() || undefined,
        image,
        grain,
        visibility: friendsOnly ? 'friends' : 'public',
        alsoFavorite,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dishes', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      navigate({ to: '/r/$restaurantId', params: { restaurantId } })
    },
  })

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setImage(await resizeToJpeg(file, { maxEdge: 1280, quality: 0.72 }))
    e.target.value = ''
  }

  const restaurant = q.data?.restaurant
  const hasRanked = Boolean(q.data?.myRanking)
  const canPost = Boolean(image) && name.trim().length > 0 && !post.isPending

  return (
    <div className="screen">
      <button
        type="button"
        className="link-action"
        onClick={() => navigate({ to: '/r/$restaurantId', params: { restaurantId } })}
      >
        ← Back
      </button>

      <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
        <Eyebrow>Post a dish</Eyebrow>
        <Title>{restaurant?.name ?? 'A dish'}</Title>
      </div>

      {q.isSuccess && !hasRanked ? (
        <div className="tab-empty">
          <Body>Rank this place first — a dish attaches to your ranking.</Body>
          <Button
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => navigate({ to: '/rank', search: { restaurant: restaurantId } })}
          >
            Rank it
          </Button>
        </div>
      ) : (
        <>
          {/* Photo. */}
          <button
            type="button"
            className={`dish-photo${image ? ' dish-photo--set' : ''}`}
            onClick={() => fileInput.current?.click()}
            style={
              image
                ? { backgroundImage: `url(${image})`, filter: filterForGrain(grain) }
                : undefined
            }
          >
            {!image && <span className="dish-photo__hint">＋ Add a photo</span>}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={onPick}
          />

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

          <Eyebrow style={{ marginTop: 'var(--space-4)' }}>Dish name</Eyebrow>
          <input
            className="field"
            placeholder="Short rib, 14 hours…"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Eyebrow style={{ marginTop: 'var(--space-4)' }}>Caption</Eyebrow>
          <input
            className="field"
            placeholder="Falls apart under the fork."
            maxLength={140}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />

          <label className="dish-toggle">
            <input
              type="checkbox"
              checked={alsoFavorite}
              onChange={(e) => setAlsoFavorite(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span>Use as your favorite dish here</span>
          </label>
          <label className="dish-toggle">
            <input
              type="checkbox"
              checked={friendsOnly}
              onChange={(e) => setFriendsOnly(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span>Share to friends only</span>
          </label>

          {post.error instanceof ApiError && post.error.code === 'rank_it_first' && (
            <div className="error-text">Rank this place first.</div>
          )}

          <div className="spacer" />
          <Button disabled={!canPost} onClick={() => post.mutate()}>
            {post.isPending ? 'Posting…' : 'Post dish'}
          </Button>
        </>
      )}
    </div>
  )
}
