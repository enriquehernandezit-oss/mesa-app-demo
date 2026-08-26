import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Body, Button, Title } from '../../components/ui'
import { CompareCard } from '../../components/ui/CompareCard'
import { PlaceCover } from '../../components/ui/PlaceCover'
import { api } from '../../lib/api'
import { cuisineLabel } from '../../lib/display'
import {
  choose,
  initPairwise,
  isDone,
  nextComparison,
  progress,
  skip,
  tie,
} from '../../lib/pairwise'
import type { Restaurant } from '../../lib/types'
import './rank.css'
import '../rank/rank.css'

// Step 2: the atomic mechanic. First pick the spots you've actually been to
// (you can't rank a place you haven't visited), then place them by answering a
// few "this or that?" comparisons — the pairwise binary-search engine. The
// settled order is written as the user's starter ranking. No stars, anywhere.
const MIN_TO_RANK = 3
const MAX_TO_RANK = 8

export function RankStep({ onNext }: { onNext: () => void }) {
  const { data, isPending } = useQuery({
    queryKey: ['onboarding', 'candidates'],
    queryFn: () => api.get<{ restaurants: Restaurant[] }>('/onboarding/candidates'),
  })

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [phase, setPhase] = useState<'select' | 'compare'>('select')

  const byId = useMemo(() => {
    const m = new Map<string, Restaurant>()
    for (const r of data?.restaurants ?? []) m.set(r.id, r)
    return m
  }, [data])

  const save = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post('/onboarding/rankings', { restaurantIds: orderedIds }),
    onSuccess: onNext,
  })

  if (isPending) {
    return <Body style={{ marginTop: 'var(--space-6)' }}>Cargando spots…</Body>
  }

  // --- Phase A: which have you been to? ---
  if (phase === 'select') {
    const toggle = (id: string) =>
      setSelectedIds((cur) =>
        cur.includes(id)
          ? cur.filter((x) => x !== id)
          : cur.length >= MAX_TO_RANK
            ? cur
            : [...cur, id],
      )

    return (
      <div className="stack stack--loose" style={{ marginTop: 'var(--space-6)' }}>
        <div className="stack stack--tight">
          <Title>¿A cuáles de estos has ido?</Title>
          <Body>
            Elige {MIN_TO_RANK}–{MAX_TO_RANK}. Después los pondrás en orden.
          </Body>
        </div>

        <div className="rank-grid">
          {data?.restaurants.map((r) => {
            const on = selectedIds.includes(r.id)
            return (
              <button
                type="button"
                key={r.id}
                className={`rank-pick rank-pick--photo${on ? ' rank-pick--on' : ''}`}
                onClick={() => toggle(r.id)}
              >
                <PlaceCover
                  seed={r.id}
                  name={r.name}
                  coverImageId={r.coverImageId}
                  size={{ w: 400, h: 300 }}
                  className="rank-pick__cover"
                />
                <span className="rank-pick__name">{r.name}</span>
                <span className="rank-pick__meta">
                  {[cuisineLabel(r.cuisine), r.neighborhood?.name].filter(Boolean).join(' · ')}
                </span>
              </button>
            )
          })}
        </div>

        <div className="spacer" />
        <Button disabled={selectedIds.length < MIN_TO_RANK} onClick={() => setPhase('compare')}>
          {selectedIds.length < MIN_TO_RANK
            ? `Elige ${MIN_TO_RANK - selectedIds.length} más`
            : `Rankear estos ${selectedIds.length}`}
        </Button>
      </div>
    )
  }

  // --- Phase B: pairwise comparisons ---
  return (
    <ComparePhase
      restaurants={selectedIds.map((id) => byId.get(id)).filter(Boolean) as Restaurant[]}
      saving={save.isPending}
      onComplete={(ordered) => save.mutate(ordered.map((r) => r.id))}
    />
  )
}

function ComparePhase({
  restaurants,
  saving,
  onComplete,
}: {
  restaurants: Restaurant[]
  saving: boolean
  onComplete: (ordered: Restaurant[]) => void
}) {
  const [state, setState] = useState(() => initPairwise(restaurants))
  const comparison = nextComparison(state)
  const { placed, total } = progress(state)

  // No comparison left: the list is fully ordered. Persist it once.
  if (comparison === null) {
    if (isDone(state) && !saving) onComplete(state.ordered)
    return (
      <div className="stack" style={{ marginTop: 'var(--space-7)', alignItems: 'center' }}>
        <Body>Guardando tus rankings…</Body>
      </div>
    )
  }

  const pick = (currentWins: boolean) => setState((s) => choose(s, currentWins))
  const toItem = (r: Restaurant) => ({
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    neighborhood: r.neighborhood?.name ?? null,
    coverImageId: r.coverImageId,
  })

  return (
    <div className="stack stack--loose" style={{ marginTop: 'var(--space-5)' }}>
      <div className="rank-progress">
        {placed + 1} de {total}
      </div>
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Title>¿Cuál estuvo mejor?</Title>
      </div>

      <div className="compare">
        <CompareCard item={toItem(comparison.current)} onClick={() => pick(true)} />
        <button type="button" className="compare__same" onClick={() => setState((s) => tie(s))}>
          Más o menos igual
        </button>
        <CompareCard item={toItem(comparison.pivot)} onClick={() => pick(false)} />
      </div>

      <button type="button" className="onboard-swap" onClick={() => setState((s) => skip(s))}>
        ¿No has ido a uno? Cámbialo
      </button>
    </div>
  )
}
