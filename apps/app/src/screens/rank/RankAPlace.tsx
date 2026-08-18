import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Body, Button, Caption, Chip, ChipRail, Eyebrow, Title } from '../../components/ui'
import { CompareCard } from '../../components/ui/CompareCard'
import { Characteristics } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { displayScore, scoreForPosition } from '../../lib/display'
import { cloudinaryUrl } from '../../lib/media'
import {
  type PairwiseState,
  type Sentiment,
  choose,
  comparisonsLeft,
  initInsertBounded,
  isDone,
  nextComparison,
  tie,
} from '../../lib/pairwise'
import type { MeResponse, NewRestaurant, Ranking } from '../../lib/types'
import '../onboarding/rank.css'
import '../tabs/rankings.css'
import '../../styles/screens.css'
import './rank.css'

// Rank-a-place (Phase 6 mocks B1–B4): find the spot (merged ranked + unranked
// rows, or add one that isn't on Mesa), place it with photo-backed compare cards
// + "About the same", reveal the score, then add a note / occasion tags / a dish.

type Item = {
  id: string
  name: string
  cuisine: string | null
  coverImageId?: string | null
  neighborhood: string | null
  priceTier?: number | null
  closesAt?: string | null
  phone?: string | null
  score?: number // present when it's already on your list
}

// The five occasion tags from the mocks (B4). Title-case, matching the seed vocab.
const RANK_TAGS = ['Date Night', 'Special Occasion', 'Group Dinner', 'Outdoor', 'Solo']

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
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
    staleTime: 300_000,
  })
  const myHood = me.data?.profile.neighborhood?.name ?? null

  const [pickedId, setPickedId] = useState<string | null>(search.restaurant ?? null)
  const [addedPlace, setAddedPlace] = useState<Item | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [priceFilter, setPriceFilter] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [reserveOnly, setReserveOnly] = useState(false)
  const [nearby, setNearby] = useState(false)
  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [position, setPosition] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [chainDish, setChainDish] = useState(false)

  // My already-ranked places → Items carrying their score (for merged rows + re-rank).
  const existing: Item[] = useMemo(
    () =>
      (mine.data?.rankings ?? []).map((r) => ({
        id: r.restaurant.id,
        name: r.restaurant.name,
        cuisine: r.restaurant.cuisine,
        coverImageId: r.restaurant.coverImageId,
        neighborhood: r.neighborhood,
        priceTier: r.restaurant.priceTier,
        closesAt: r.restaurant.closesAt,
        phone: r.restaurant.phone,
        score: r.score,
      })),
    [mine.data],
  )
  const candList = candidates.data?.restaurants ?? []

  // Resolve the picked spot from candidates, my list, or a just-added place.
  const picked = useMemo<Item | null>(() => {
    if (!pickedId) return null
    return (
      candList.find((r) => r.id === pickedId) ??
      existing.find((r) => r.id === pickedId) ??
      (addedPlace?.id === pickedId ? addedPlace : null)
    )
  }, [pickedId, candList, existing, addedPlace])
  const isRerank = Boolean(pickedId && existing.some((r) => r.id === pickedId))
  // When re-ranking, place against the REST of the list (drop the spot itself).
  const existingForCompare = useMemo(
    () => (isRerank ? existing.filter((r) => r.id !== pickedId) : existing),
    [isRerank, existing, pickedId],
  )

  const save = useMutation({
    mutationFn: (pos: number) =>
      api.post('/rankings', {
        restaurantId: pickedId,
        position: pos,
        vibeNote: note.trim() || undefined,
        tags: tags.length ? tags : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      // If they attached a dish, chain into the composer; else stamp + passport.
      if (chainDish && pickedId) {
        navigate({ to: '/dish', search: { restaurant: pickedId } })
      } else {
        setPlacedStamp(true)
        setTimeout(() => navigate({ to: '/rankings' }), 1300)
      }
    },
  })
  const [placedStamp, setPlacedStamp] = useState(false)

  const addPlace = useMutation({
    mutationFn: (body: { name: string; neighborhoodSlug: string }) =>
      api.post<{ restaurant: NewRestaurant }>('/restaurants', body),
    onSuccess: ({ restaurant }) => {
      const item: Item = {
        id: restaurant.id,
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        coverImageId: restaurant.coverImageId,
        neighborhood: restaurant.neighborhood,
        priceTier: restaurant.priceTier,
      }
      setAddedPlace(item)
      setPickedId(item.id)
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

  // B1 — Find the place: search + filter chips over merged rows (ranked + not).
  if (!picked) {
    return (
      <FindStep
        candList={candList}
        existing={existing}
        query={pickQuery}
        setQuery={setPickQuery}
        priceFilter={priceFilter}
        setPriceFilter={setPriceFilter}
        openNow={openNow}
        setOpenNow={setOpenNow}
        reserveOnly={reserveOnly}
        setReserveOnly={setReserveOnly}
        nearby={nearby}
        setNearby={setNearby}
        myHood={myHood}
        onPick={setPickedId}
        addPlace={addPlace}
        onBack={() => navigate({ to: '/rankings' })}
      />
    )
  }

  // B3 — the score reveal: where it landed, with its neighbours.
  if (position !== null && !revealed) {
    // Best-first list of the other spots, to show the new spot's neighbours.
    const orderedByPos = [...existingForCompare].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const total = orderedByPos.length + 1
    const score = scoreForPosition(position - 1, total)
    const around: { pos: number; name: string; score: number; isNew: boolean }[] = []
    for (const pos of [position - 1, position, position + 1]) {
      if (pos < 1 || pos > total) continue
      if (pos === position) {
        around.push({ pos, name: picked.name, score, isNew: true })
      } else {
        const r = orderedByPos[pos < position ? pos - 1 : pos - 2]
        if (r)
          around.push({ pos, name: r.name, score: scoreForPosition(pos - 1, total), isNew: false })
      }
    }
    return (
      <div className="screen">
        <BackBar label="‹ Back" onBack={() => setPosition(null)} />
        <div className="rank-reveal">
          <Eyebrow>Your score</Eyebrow>
          <div className="rank-reveal__score">{displayScore(score)}</div>
          <Title style={{ marginTop: 'var(--space-1)' }}>{picked.name}</Title>
          <Characteristics
            className="rank-reveal__chars"
            priceTier={picked.priceTier}
            cuisine={picked.cuisine}
            neighborhood={picked.neighborhood}
          />
          <Chip size="sm" state="selected" style={{ marginTop: 'var(--space-3)' }}>
            #{position} of {total} on your list
          </Chip>
        </div>
        <div className="rank-neighbors">
          {around.map((n) => (
            <div key={n.pos} className={`rank-neighbor${n.isNew ? ' rank-neighbor--new' : ''}`}>
              <span className="rank-neighbor__pos">{n.pos}</span>
              <span className="rank-neighbor__name">{n.name}</span>
              <span className="rank-neighbor__score">{displayScore(n.score)}</span>
            </div>
          ))}
        </div>
        <div className="spacer" />
        <Body style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Your answer moved {picked.name}, not the place's rating.
        </Body>
        <Button onClick={() => setRevealed(true)}>Add a note</Button>
      </div>
    )
  }

  // B4 — note + occasion tags + a dish (reached once the score is revealed).
  if (position !== null) {
    return (
      <div className="screen">
        <div className="rank-note-head">
          <button type="button" className="link-action" onClick={() => setRevealed(false)}>
            ‹ Add a note
          </button>
          <button type="button" className="rank-skip" onClick={() => save.mutate(position)}>
            Skip
          </button>
        </div>

        <div className="rank-summary">
          {(() => {
            const thumb = cloudinaryUrl(picked.coverImageId, { w: 120, h: 120 })
            return thumb ? (
              <img className="rank-summary__thumb" src={thumb} alt="" />
            ) : (
              <div className="rank-summary__thumb" />
            )
          })()}
          <div className="rank-summary__main">
            <div className="rank-summary__name">{picked.name}</div>
            <Characteristics
              priceTier={picked.priceTier}
              cuisine={picked.cuisine}
              neighborhood={picked.neighborhood}
            />
          </div>
          <div className="cmp-card__score">
            {displayScore(scoreForPosition(position - 1, existingForCompare.length + 1))}
          </div>
        </div>

        <textarea
          className="note-editor"
          style={{ marginTop: 'var(--space-4)', minHeight: 84 }}
          maxLength={140}
          placeholder="candlelit, natural wine, go for the branzino…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Eyebrow style={{ fontFamily: 'var(--font-mono)', marginTop: 'var(--space-4)' }}>
          Occasion
        </Eyebrow>
        <div className="tag-row">
          {RANK_TAGS.map((t) => {
            const on = tags.includes(t)
            return (
              <Chip
                key={t}
                size="sm"
                state={on ? 'selected' : 'default'}
                onClick={() =>
                  setTags((cur) =>
                    on ? cur.filter((x) => x !== t) : cur.length < 4 ? [...cur, t] : cur,
                  )
                }
              >
                {t}
              </Chip>
            )
          })}
        </div>

        <Eyebrow style={{ fontFamily: 'var(--font-mono)', marginTop: 'var(--space-4)' }}>
          Add a dish
        </Eyebrow>
        <button
          type="button"
          className={`rank-dish-tile${chainDish ? ' rank-dish-tile--on' : ''}`}
          onClick={() => setChainDish((v) => !v)}
        >
          <span className="rank-dish-tile__plus">+</span>
          <span className="rank-dish-tile__label">
            {chainDish ? 'Photo after posting' : 'Add a photo'}
          </span>
        </button>

        <div className="spacer" />
        <Button disabled={save.isPending} onClick={() => save.mutate(position)}>
          {save.isPending ? 'Posting…' : 'Post ranking'}
        </Button>
      </div>
    )
  }

  // Sentiment — how did it feel? Narrows the comparison band.
  if (!sentiment) {
    return (
      <div className="screen">
        <BackBar
          label="‹ Back"
          onBack={() => {
            if (search.restaurant || addedPlace) navigate({ to: '/rankings' })
            else setPickedId(null)
          }}
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

  // B2 — pairwise placement, the compare-card battle, banded by sentiment.
  return (
    <div className="screen">
      <BackBar label="‹ Back" onBack={() => setSentiment(null)} />
      <PlaceStep
        existing={existingForCompare}
        item={picked}
        sentiment={sentiment}
        onPlaced={setPosition}
      />
    </div>
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
  const initial = useMemo(
    () => initInsertBounded(existing, item, sentiment),
    [existing, item, sentiment],
  )
  const [state, setState] = useState<PairwiseState<Item>>(initial)
  const total = useMemo(() => comparisonsLeft(initial), [initial])
  const comparison = nextComparison(state)

  if (comparison === null) {
    if (isDone(state)) {
      const pos = state.ordered.findIndex((x) => x.id === item.id) + 1
      onPlaced(pos > 0 ? pos : 1)
    }
    return <Body style={{ marginTop: 'var(--space-6)' }}>Placing…</Body>
  }

  const step = Math.min(total - comparisonsLeft(state) + 1, total)
  const pivotPos = state.ordered.findIndex((x) => x.id === comparison.pivot.id) + 1

  return (
    <div className="stack stack--loose" style={{ marginTop: 'var(--space-4)' }}>
      <div className="rank-progress">
        {step} of {total}
      </div>
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Title>Which was better?</Title>
        <div className="rank-progress rank-progress--sub">
          Your answer moves {item.name}, not the place's rating.
        </div>
      </div>
      <div className="compare compare--battle" key={comparison.pivot.id}>
        <CompareCard
          item={comparison.current}
          subline="new to your list"
          onClick={() => setState((s) => choose(s, true))}
        />
        <button type="button" className="compare__same" onClick={() => setState((s) => tie(s))}>
          About the same
        </button>
        <CompareCard
          item={comparison.pivot}
          subline={`#${pivotPos} on your list`}
          score={comparison.pivot.score ?? null}
          onClick={() => setState((s) => choose(s, false))}
        />
      </div>
    </div>
  )
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      className="link-action"
      style={{ alignSelf: 'flex-start' }}
      onClick={onBack}
    >
      {label}
    </button>
  )
}

// B1 — Find the place. Merged rows (ranked show their score, unranked "not
// ranked"), four filter chips, and an "Add a new restaurant" footer.
function FindStep({
  candList,
  existing,
  query,
  setQuery,
  priceFilter,
  setPriceFilter,
  openNow,
  setOpenNow,
  reserveOnly,
  setReserveOnly,
  nearby,
  setNearby,
  myHood,
  onPick,
  addPlace,
  onBack,
}: {
  candList: Item[]
  existing: Item[]
  query: string
  setQuery: (v: string) => void
  priceFilter: number | null
  setPriceFilter: (v: number | null) => void
  openNow: boolean
  setOpenNow: (v: (p: boolean) => boolean) => void
  reserveOnly: boolean
  setReserveOnly: (v: (p: boolean) => boolean) => void
  nearby: boolean
  setNearby: (v: (p: boolean) => boolean) => void
  myHood: string | null
  onPick: (id: string) => void
  addPlace: ReturnType<
    typeof useMutation<
      { restaurant: NewRestaurant },
      Error,
      { name: string; neighborhoodSlug: string }
    >
  >
  onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const q = query.trim().toLowerCase()
  const merged: Item[] = [...candList, ...existing]
  let results = merged.filter((r) => {
    if (priceFilter && r.priceTier !== priceFilter) return false
    if (openNow && !r.closesAt) return false
    if (reserveOnly && !r.phone) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      (r.cuisine ?? '').toLowerCase().includes(q) ||
      (r.neighborhood ?? '').toLowerCase().includes(q)
    )
  })
  if (nearby && myHood) {
    results = [...results].sort((a, b) => {
      const am = a.neighborhood === myHood ? 0 : 1
      const bm = b.neighborhood === myHood ? 0 : 1
      return am - bm || a.name.localeCompare(b.name)
    })
  } else {
    results = [...results].sort((a, b) => a.name.localeCompare(b.name))
  }

  return (
    <div className="screen">
      <BackBar label="✕ Rank a place" onBack={onBack} />
      <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
        <Title>Find the place</Title>
      </div>
      <input
        className="field"
        style={{ marginTop: 'var(--space-4)' }}
        type="search"
        placeholder="Search a spot you've been…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ChipRail style={{ marginTop: 'var(--space-3)' }}>
        <Chip
          size="sm"
          state={nearby ? 'selected' : 'default'}
          onClick={() => setNearby((v) => !v)}
        >
          Nearby
        </Chip>
        <Chip
          size="sm"
          state={openNow ? 'selected' : 'default'}
          onClick={() => setOpenNow((v) => !v)}
        >
          Open now
        </Chip>
        <Chip
          size="sm"
          state={reserveOnly ? 'selected' : 'default'}
          onClick={() => setReserveOnly((v) => !v)}
        >
          Reserve
        </Chip>
        {[1, 2, 3, 4].map((pt) => (
          <Chip
            key={pt}
            size="sm"
            state={priceFilter === pt ? 'selected' : 'default'}
            onClick={() => setPriceFilter(priceFilter === pt ? null : pt)}
          >
            {'$'.repeat(pt)}
          </Chip>
        ))}
      </ChipRail>

      <div className="rank-results" style={{ marginTop: 'var(--space-4)' }}>
        {results.length === 0 && !q ? (
          <Body>You've ranked everything on Mesa. 👏</Body>
        ) : results.length === 0 ? (
          <Body>Nothing matches. Try another name.</Body>
        ) : (
          results.map((r) => {
            const thumb = cloudinaryUrl(r.coverImageId, { w: 160, h: 160 })
            return (
              <button key={r.id} type="button" className="rank-row" onClick={() => onPick(r.id)}>
                {thumb ? (
                  <img className="rank-row__thumb" src={thumb} alt="" loading="lazy" />
                ) : (
                  <div className="rank-row__thumb" />
                )}
                <div className="rank-row__main">
                  <div className="rank-row__name">{r.name}</div>
                  <Characteristics
                    priceTier={r.priceTier}
                    cuisine={r.cuisine}
                    neighborhood={r.neighborhood}
                    hours={r.closesAt ? `till ${r.closesAt}` : null}
                  />
                </div>
                {r.score != null ? (
                  <div className="rank-row__score">{displayScore(r.score)}</div>
                ) : (
                  <span className="rank-row__badge">not ranked</span>
                )}
              </button>
            )
          })
        )}
        {adding ? (
          <AddPlaceForm addPlace={addPlace} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" className="rank-addnew" onClick={() => setAdding(true)}>
            + Can't find it? Add a new restaurant
          </button>
        )}
      </div>
    </div>
  )
}

// Minimal "add a place that isn't on Mesa" form (name + neighbourhood).
function AddPlaceForm({
  addPlace,
  onCancel,
}: {
  addPlace: ReturnType<
    typeof useMutation<
      { restaurant: NewRestaurant },
      Error,
      { name: string; neighborhoodSlug: string }
    >
  >
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () =>
      api.get<{ neighborhoods: { slug: string; name: string }[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const [slug, setSlug] = useState('')
  const canAdd = name.trim().length > 0 && slug.length > 0 && !addPlace.isPending
  return (
    <div className="rank-addform">
      <input
        className="field"
        placeholder="Restaurant name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
      />
      <select className="field" value={slug} onChange={(e) => setSlug(e.target.value)}>
        <option value="" disabled>
          Neighbourhood
        </option>
        {neighborhoods.data?.neighborhoods.map((n) => (
          <option key={n.slug} value={n.slug}>
            {n.name}
          </option>
        ))}
      </select>
      <div className="rank-addform__actions">
        <Button
          variant="secondary"
          style={{ width: 'auto', minHeight: 44, padding: '0 var(--space-4)' }}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          disabled={!canAdd}
          style={{ width: 'auto', minHeight: 44, padding: '0 var(--space-5)' }}
          onClick={() => addPlace.mutate({ name: name.trim(), neighborhoodSlug: slug })}
        >
          {addPlace.isPending ? 'Adding…' : 'Add & rank'}
        </Button>
      </div>
    </div>
  )
}
