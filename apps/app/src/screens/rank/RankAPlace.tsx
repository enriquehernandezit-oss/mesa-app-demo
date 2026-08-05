import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Body, Button, Caption, Eyebrow, Title } from '../../components/ui'
import { api } from '../../lib/api'
import { cloudinaryUrl } from '../../lib/media'
import {
  type Sentiment,
  choose,
  initInsertBounded,
  isDone,
  nextComparison,
} from '../../lib/pairwise'
import type { Ranking } from '../../lib/types'
import '../onboarding/rank.css'
import '../tabs/rankings.css'
import '../../styles/screens.css'

// Rank-a-place (M3, rebuilt as a card battle in the viral pass): pick a spot,
// place it against your list with photo-backed "this or that?" cards, add a
// vibe note, and celebrate the placement with a stamp before returning.

type Item = {
  id: string
  name: string
  cuisine: string | null
  coverImageId?: string | null
  neighborhood: string | null
}

export function RankAPlace() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { restaurant?: string }

  const candidates = useQuery({
    queryKey: ['rankings', 'candidates'],
    queryFn: () => api.get<{ restaurants: Item[] }>('/rankings/candidates'),
  })
  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })

  const [pickedId, setPickedId] = useState<string | null>(search.restaurant ?? null)
  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [position, setPosition] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [dish, setDish] = useState('')
  const [placedStamp, setPlacedStamp] = useState(false)

  const existing: Item[] = useMemo(
    () =>
      (mine.data?.rankings ?? []).map((r) => ({
        id: r.restaurant.id,
        name: r.restaurant.name,
        cuisine: r.restaurant.cuisine,
        coverImageId: r.restaurant.coverImageId,
        neighborhood: r.neighborhood,
      })),
    [mine.data],
  )

  const candList = candidates.data?.restaurants ?? []
  const picked = useMemo<Item | null>(
    () => (pickedId ? (candList.find((r) => r.id === pickedId) ?? null) : null),
    [pickedId, candList],
  )

  const save = useMutation({
    mutationFn: (pos: number) =>
      api.post('/rankings', {
        restaurantId: pickedId,
        position: pos,
        vibeNote: note.trim() || undefined,
        tags: tags.length ? tags : undefined,
        favoriteDish: dish.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      // Celebrate the placement, then return to the passport.
      setPlacedStamp(true)
      setTimeout(() => navigate({ to: '/rankings' }), 1300)
    },
  })

  // The celebration stamp — "#3 · Mijas" punches in over the screen.
  if (placedStamp && picked && position !== null) {
    return (
      <div className="screen stamp-screen">
        <div className="stamp">
          <div className="stamp__ring">
            <span className="stamp__numeral">#{position}</span>
          </div>
          <div className="stamp__name">{picked.name}</div>
          <Caption>added to your passport</Caption>
        </div>
      </div>
    )
  }

  if (candidates.isPending || mine.isPending) {
    return (
      <div className="screen">
        <Body>Loading…</Body>
      </div>
    )
  }

  // Step: pick a place (skipped when arriving with a preselected restaurant).
  if (!picked) {
    return (
      <div className="screen">
        <BackBar onBack={() => navigate({ to: '/rankings' })} />
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          <Eyebrow>Rank a place</Eyebrow>
          <Title>Which spot?</Title>
          <Body>Pick somewhere you've been. You'll place it next.</Body>
        </div>
        <div className="rank-grid" style={{ marginTop: 'var(--space-5)' }}>
          {candList.length === 0 && <Body>You've ranked everything on Mesa. 👏</Body>}
          {candList.map((r) => (
            <PickCard key={r.id} item={r} onClick={() => setPickedId(r.id)} />
          ))}
        </div>
      </div>
    )
  }

  // Step: note + tags + dish (reached once the position is settled).
  if (position !== null) {
    return (
      <div className="screen">
        <BackBar onBack={() => setPosition(null)} />
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          <Eyebrow>Placed #{position}</Eyebrow>
          <Title>{picked.name}</Title>
          <Body>Add the vibe — one line on why. Optional, but it's the point.</Body>
        </div>
        <textarea
          className="note-editor"
          style={{ marginTop: 'var(--space-4)', minHeight: 84 }}
          maxLength={140}
          placeholder="candlelit, natural wine, go for the branzino…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Eyebrow style={{ marginTop: 'var(--space-4)' }}>Tags</Eyebrow>
        <div className="tag-row">
          {RANK_TAGS.map((t) => {
            const on = tags.includes(t)
            return (
              <button
                type="button"
                key={t}
                className={`tag-chip${on ? ' tag-chip--on' : ''}`}
                onClick={() =>
                  setTags((cur) =>
                    on ? cur.filter((x) => x !== t) : cur.length < 3 ? [...cur, t] : cur,
                  )
                }
              >
                {t}
              </button>
            )
          })}
        </div>
        <Eyebrow style={{ marginTop: 'var(--space-4)' }}>The dish to order</Eyebrow>
        <input
          className="field"
          style={{ marginTop: 'var(--space-2)' }}
          maxLength={60}
          placeholder="el risotto de hongos…"
          value={dish}
          onChange={(e) => setDish(e.target.value)}
        />
        <div className="spacer" />
        <Button disabled={save.isPending} onClick={() => save.mutate(position)}>
          {save.isPending ? 'Saving…' : 'Save ranking'}
        </Button>
      </div>
    )
  }

  // Step: how did it feel? Narrows the comparison band (Beli-style).
  if (!sentiment) {
    return (
      <div className="screen">
        <BackBar
          onBack={() => (search.restaurant ? navigate({ to: '/rankings' }) : setPickedId(null))}
        />
        <div
          className="stack stack--tight"
          style={{ marginTop: 'var(--space-4)', textAlign: 'center', alignItems: 'center' }}
        >
          <Eyebrow>{picked.name}</Eyebrow>
          <Title>¿Cómo estuvo?</Title>
        </div>
        <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
          <button
            type="button"
            className="sentiment sentiment--loved"
            onClick={() => setSentiment('loved')}
          >
            Me encantó
          </button>
          <button type="button" className="sentiment" onClick={() => setSentiment('fine')}>
            Estuvo bien
          </button>
          <button
            type="button"
            className="sentiment sentiment--low"
            onClick={() => setSentiment('disliked')}
          >
            No me convenció
          </button>
        </div>
      </div>
    )
  }

  // Step: pairwise placement — the card battle, banded by sentiment.
  return (
    <div className="screen">
      <BackBar onBack={() => setSentiment(null)} />
      <PlaceStep
        existing={existing}
        item={picked}
        sentiment={sentiment}
        onPlaced={(pos) => setPosition(pos)}
      />
    </div>
  )
}

const RANK_TAGS = [
  'date night',
  'en grupo',
  'terraza',
  'brunch',
  'chichi',
  'casual',
  'buena música',
  'vinos',
  'hasta tarde',
]

function PickCard({ item, onClick }: { item: Item; onClick: () => void }) {
  const cover = cloudinaryUrl(item.coverImageId, { w: 400, h: 300 })
  return (
    <button
      type="button"
      className="rank-pick rank-pick--photo"
      style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      onClick={onClick}
    >
      <span className="rank-pick__name">{item.name}</span>
      <span className="rank-pick__meta">
        {[item.cuisine, item.neighborhood].filter(Boolean).join(' · ')}
      </span>
    </button>
  )
}

function PlaceStep({
  existing,
  item,
  sentiment,
  onPlaced,
}: {
  existing: Item[]
  item: Item
  sentiment: Sentiment
  onPlaced: (position: number) => void
}) {
  const [state, setState] = useState(() => initInsertBounded(existing, item, sentiment))
  const comparison = nextComparison(state)

  // Empty list or search settled: no comparison left → item is placed.
  if (comparison === null) {
    if (isDone(state)) {
      const pos = state.ordered.findIndex((x) => x.id === item.id) + 1
      onPlaced(pos > 0 ? pos : 1)
    }
    return <Body style={{ marginTop: 'var(--space-6)' }}>Placing…</Body>
  }

  return (
    <div className="stack stack--loose" style={{ marginTop: 'var(--space-4)' }}>
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Eyebrow>Placing {item.name}</Eyebrow>
        <Title>Which do you like more?</Title>
      </div>
      {/* key = the pivot: each new round slides in fresh. */}
      <div className="compare compare--battle" key={comparison.pivot.id}>
        <Versus item={comparison.current} onClick={() => setState((s) => choose(s, true))} />
        <div className="compare__or">or</div>
        <Versus item={comparison.pivot} onClick={() => setState((s) => choose(s, false))} />
      </div>
    </div>
  )
}

function Versus({ item, onClick }: { item: Item; onClick: () => void }) {
  const cover = cloudinaryUrl(item.coverImageId, { w: 700, h: 340 })
  return (
    <button
      type="button"
      className="versus versus--photo"
      style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      onClick={onClick}
    >
      <span className="versus__name">{item.name}</span>
      <Caption>{[item.cuisine, item.neighborhood].filter(Boolean).join(' · ')}</Caption>
    </button>
  )
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      className="link-action"
      style={{ alignSelf: 'flex-start' }}
      onClick={onBack}
    >
      ← Back
    </button>
  )
}
