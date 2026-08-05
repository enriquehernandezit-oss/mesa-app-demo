import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Body, Button, Caption, Eyebrow, Title } from '../../components/ui'
import { api } from '../../lib/api'
import { choose, initInsert, isDone, nextComparison } from '../../lib/pairwise'
import type { Ranking, Restaurant } from '../../lib/types'
import '../onboarding/rank.css'
import '../tabs/rankings.css'
import '../../styles/screens.css'

// Rank-a-place (M3): pick a spot you've been to, place it against your existing
// list with the same "this or that?" pairwise comparisons, add an optional vibe
// note, and it takes its slot in your passport. Reuses the pairwise engine via
// initInsert — inserting one item into an already-ordered list.

type Item = { id: string; name: string; cuisine: string | null; neighborhood: string | null }

export function RankAPlace() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { restaurant?: string }

  const candidates = useQuery({
    queryKey: ['rankings', 'candidates'],
    queryFn: () =>
      api.get<{ restaurants: (Restaurant & { neighborhood: string | null })[] }>(
        '/rankings/candidates',
      ),
  })
  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })

  const [pickedId, setPickedId] = useState<string | null>(search.restaurant ?? null)
  const [position, setPosition] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const existing: Item[] = useMemo(
    () =>
      (mine.data?.rankings ?? []).map((r) => ({
        id: r.restaurant.id,
        name: r.restaurant.name,
        cuisine: r.restaurant.cuisine,
        neighborhood: r.neighborhood,
      })),
    [mine.data],
  )

  const candList = candidates.data?.restaurants ?? []
  const picked = useMemo<Item | null>(() => {
    if (!pickedId) return null
    const c = candList.find((r) => r.id === pickedId)
    return c
      ? { id: c.id, name: c.name, cuisine: c.cuisine, neighborhood: c.neighborhood ?? null }
      : null
  }, [pickedId, candList])

  const save = useMutation({
    mutationFn: (pos: number) =>
      api.post('/rankings', {
        restaurantId: pickedId,
        position: pos,
        vibeNote: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      navigate({ to: '/rankings' })
    },
  })

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
            <button
              type="button"
              key={r.id}
              className="rank-pick"
              onClick={() => setPickedId(r.id)}
            >
              <span className="rank-pick__name">{r.name}</span>
              <span className="rank-pick__meta">
                {[r.cuisine, r.neighborhood].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Step: note (reached once the position is settled).
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
          style={{ marginTop: 'var(--space-4)', minHeight: 96 }}
          maxLength={140}
          placeholder="candlelit, natural wine, go for the branzino…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="spacer" />
        <Button disabled={save.isPending} onClick={() => save.mutate(position)}>
          {save.isPending ? 'Saving…' : 'Save ranking'}
        </Button>
      </div>
    )
  }

  // Step: pairwise placement.
  return (
    <div className="screen">
      <BackBar
        onBack={() => (search.restaurant ? navigate({ to: '/rankings' }) : setPickedId(null))}
      />
      <PlaceStep existing={existing} item={picked} onPlaced={(pos) => setPosition(pos)} />
    </div>
  )
}

function PlaceStep({
  existing,
  item,
  onPlaced,
}: {
  existing: Item[]
  item: Item
  onPlaced: (position: number) => void
}) {
  const [state, setState] = useState(() => initInsert(existing, item))
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
        {/* Binary search: the number of comparisons isn't fixed, so we name what
            we're placing rather than show a misleading "x of y". */}
        <Eyebrow>Placing {item.name}</Eyebrow>
        <Title>Which do you like more?</Title>
      </div>
      <div className="compare">
        <Versus item={comparison.current} onClick={() => setState((s) => choose(s, true))} />
        <div className="compare__or">or</div>
        <Versus item={comparison.pivot} onClick={() => setState((s) => choose(s, false))} />
      </div>
    </div>
  )
}

function Versus({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <button type="button" className="versus" onClick={onClick}>
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
