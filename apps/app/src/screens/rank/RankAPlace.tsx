import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  ChipRail,
  Eyebrow,
  SerifItalic,
  Title,
} from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { CompareCard } from '../../components/ui/CompareCard'
import { PlaceCover } from '../../components/ui/PlaceCover'
import { Characteristics } from '../../components/ui/patterns'
import { toast } from '../../components/ui/toast-store'
import { api } from '../../lib/api'
import { displayScore, scoreForPosition } from '../../lib/display'
import { formatDistance, haversineM } from '../../lib/geo'
import { tapSuccess } from '../../lib/haptics'
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
import { markRankExplainerSeen, rankExplainerSeen } from '../../lib/rankExplainer'
import type {
  MeResponse,
  NewRestaurant,
  Ranking,
  RestaurantProfileResponse,
  SavedPlace,
} from '../../lib/types'
import { useMyLocation } from '../../lib/useMyLocation'
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
  lat?: number
  lng?: number
  score?: number // present when it's already on your list
}

// The five occasion tags from the mocks (B4). Title-case, matching the seed vocab.
const RANK_TAGS = ['Cena romántica', 'Ocasión especial', 'Cena en grupo', 'Al aire libre', 'Solo']

export function RankAPlace() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { restaurant?: string }

  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  // Want-to-try order — the honest "recency" signal for the find-step's lead
  // group (there's no visit-history to draw on, but a saved place is a real
  // signal the user meant to come back and rank it).
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
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
  const [openNow, setOpenNow] = useState(false)
  const [reserveOnly, setReserveOnly] = useState(false)
  const [nearby, setNearby] = useState(false)

  // Query-driven, mirroring Explore: the server now searches (mesa_norm +
  // trigram) and bounds the result instead of returning the whole unranked
  // catalog for the client to filter with String.includes. No debounce, same
  // as Explore's search — every keystroke past 2 chars is a fresh request.
  const candidates = useQuery({
    queryKey: ['rankings', 'candidates', pickQuery.trim(), openNow, reserveOnly],
    queryFn: () => {
      const params = new URLSearchParams()
      if (pickQuery.trim().length >= 2) params.set('q', pickQuery.trim())
      if (openNow) params.set('open', '1')
      if (reserveOnly) params.set('reserve', '1')
      return api.get<{ restaurants: Item[] }>(`/rankings/candidates?${params}`)
    },
  })
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
        lat: r.restaurant.lat,
        lng: r.restaurant.lng,
        score: r.score,
      })),
    [mine.data],
  )
  const candList = candidates.data?.restaurants ?? []
  // Most-recently-saved first — the find-step's "Quiero probar" lead group.
  const wantToTryIds = useMemo(
    () =>
      [...(saved.data?.saved ?? [])]
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((s) => s.restaurant.id),
    [saved.data],
  )

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

  // Commits the ranking the moment its score is revealed — not three screens
  // later at "Post ranking" — so an interrupted or abandoned flow never loses
  // the ranking itself (only the optional note/tags/dish, which are cheap to
  // redo). The note step's final save re-POSTs the same (userId, restaurantId)
  // pair, which the API upserts, so this is safe to fire again from there.
  const commitInitial = useMutation({
    mutationFn: (pos: number) => api.post('/rankings', { restaurantId: pickedId, position: pos }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant', pickedId] })
    },
  })
  const committedForId = useRef<string | null>(null)
  useEffect(() => {
    if (pickedId && position !== null && committedForId.current !== pickedId) {
      committedForId.current = pickedId
      commitInitial.mutate(position)
    }
    // committedForId is the real guard against a duplicate POST — it's fine
    // for this effect to also re-run on a commitInitial.mutate identity change.
  }, [pickedId, position, commitInitial.mutate])

  // The friend signal for the reveal screen — the same profile data the
  // restaurant page shows, fetched once the score is on screen.
  const friendsQuery = useQuery({
    queryKey: ['restaurant', pickedId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${pickedId}`),
    enabled: Boolean(pickedId) && position !== null,
    staleTime: 30_000,
  })

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
      queryClient.invalidateQueries({ queryKey: ['restaurant', pickedId] })
      // If they attached a dish, chain into the composer; else stamp + passport.
      // replace: true — the ranking is already saved, so cancelling the composer
      // must not pop back into this (now-finished) rank flow, whose own
      // useBlocker below would otherwise re-arm and intercept that back press.
      if (chainDish && pickedId) {
        navigate({ to: '/dish', search: { restaurant: pickedId }, replace: true })
      } else {
        setPlacedStamp(true)
        tapSuccess()
        setTimeout(() => navigate({ to: '/rankings' }), 1300)
      }
    },
    // The ranking itself already committed at reveal (commitInitial), so a
    // failure here only risks the optional note/tags — but silently dropping a
    // note the user just wrote is the worst outcome in this step. Surface a
    // retry, matching the reveal screen's own commitInitial retry pattern.
    onError: (_err, pos) => {
      toast({
        variant: 'error',
        message: 'No se pudo guardar tu nota',
        action: { label: 'Intentar de nuevo', onClick: () => save.mutate(pos) },
      })
    },
  })
  const [placedStamp, setPlacedStamp] = useState(false)

  // Guard the multi-step flow against the platform back-gesture and reload/close.
  // The whole flow lives at one route on local state, so without this a single
  // iOS edge-swipe / Android back / accidental reload would unwind straight to
  // the Feed and silently lose an in-progress ranking. Instead we intercept the
  // BACK action and step backward through the flow's own state — mirroring what
  // the in-app "‹ Atrás" controls already do — and only let navigation leave the
  // route once there's nothing left to unwind. `placedStamp` (the save landed,
  // celebration is showing) turns the guard off so the success navigation and
  // the dish-chain both pass through. beforeUnload covers reload/tab-close.
  // A spot is picked → we're in the flow (the sentiment step onward), so a spot
  // arrived-at via deep link (?restaurant=) counts too.
  const inFlow = pickedId !== null && !placedStamp
  const deepLinked = Boolean(search.restaurant || addedPlace)
  const blocker = useBlocker({
    shouldBlockFn: ({ action }) => action === 'BACK' && inFlow,
    enableBeforeUnload: () => inFlow,
    withResolver: true,
  })
  useEffect(() => {
    if (blocker.status !== 'blocked') return
    // Consume the back press as one in-flow step (mirroring the in-app "‹ Atrás"
    // controls), unwinding note → reveal → compare → sentiment → find; once
    // there's nothing left to unwind, let it through so a second back leaves.
    if (revealed) {
      setRevealed(false)
      blocker.reset()
    } else if (position !== null) {
      // Re-arm the auto-commit so redoing the comparisons re-saves at the new slot.
      committedForId.current = null
      setPosition(null)
      blocker.reset()
    } else if (sentiment !== null) {
      setSentiment(null)
      blocker.reset()
    } else if (!deepLinked) {
      // At the sentiment step with a real find-step behind us → return to it.
      setPickedId(null)
      blocker.reset()
    } else {
      // Arrived straight into this spot (deep link / just-added) — no find step
      // to fall back to, so let back leave the flow.
      blocker.proceed()
    }
  }, [blocker, revealed, position, sentiment, deepLinked])

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
      // The new place is only in this screen's local `addedPlace` state
      // without this — backing out and re-entering the find step, or
      // visiting Explore, wouldn't show it until an unrelated cache miss.
      queryClient.invalidateQueries({ queryKey: ['rankings', 'candidates'] })
      queryClient.invalidateQueries({ queryKey: ['explore'] })
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
          <Caption>añadido a tu pasaporte</Caption>
        </div>
      </div>
    )
  }

  if (candidates.isPending || mine.isPending) {
    return (
      <div className="screen">
        <Body>Cargando…</Body>
      </div>
    )
  }

  // B1 — Find the place: search + filter chips over merged rows (ranked + not).
  if (!picked) {
    return (
      <FindStep
        candList={candList}
        existing={existing}
        wantToTryIds={wantToTryIds}
        query={pickQuery}
        setQuery={setPickQuery}
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
        <BackBar
          label="‹ Atrás"
          onBack={() => {
            // Re-arm the auto-commit: if they redo the comparisons and land on
            // a different spot, the next reveal must re-save at that position.
            committedForId.current = null
            setPosition(null)
          }}
        />
        <div className="rank-reveal">
          <Eyebrow>Tu puntuación</Eyebrow>
          <div className="rank-reveal__score">{displayScore(score)}</div>
          <Title style={{ marginTop: 'var(--space-1)' }}>{picked.name}</Title>
          <Characteristics
            className="rank-reveal__chars"
            priceTier={picked.priceTier}
            cuisine={picked.cuisine}
            neighborhood={picked.neighborhood}
          />
          <Chip size="sm" state="selected" style={{ marginTop: 'var(--space-3)' }}>
            #{position} de {total} en tu lista
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

        {/* The other half of the core loop: where friends put this same place.
            Fetched off the restaurant profile once the score is on screen. */}
        <div className="rank-reveal__friends">
          <Eyebrow>Tus amigos</Eyebrow>
          {friendsQuery.isPending ? (
            <Caption>Buscando…</Caption>
          ) : (friendsQuery.data?.friendsRankings.length ?? 0) > 0 ? (
            <>
              <Caption className="rank-reveal__friends-meta">
                {friendsQuery.data?.friendsRankings.length === 1
                  ? '1 amigo rankeó esto'
                  : `${friendsQuery.data?.friendsRankings.length} amigos rankearon esto`}{' '}
                · prom. {displayScore(friendsQuery.data?.friendAvg ?? 0)}
              </Caption>
              {friendsQuery.data?.friendsRankings.slice(0, 3).map((f) => (
                <Link
                  key={f.user.id}
                  to="/u/$userId"
                  params={{ userId: f.user.id }}
                  className="rank-reveal__friend-row"
                >
                  <Avatar name={f.user.name || f.user.handle || 'm'} src={f.user.image} size={28} />
                  <span className="rank-reveal__friend-name">{f.user.name || f.user.handle}</span>
                  <span className="rank-reveal__friend-pos">#{f.position}</span>
                  <span className="rank-reveal__friend-score">{displayScore(f.score)}</span>
                </Link>
              ))}
            </>
          ) : (
            <SerifItalic className="rank-reveal__friends-empty">
              Ninguno de tus amigos ha rankeado esto todavía — vas primero.
            </SerifItalic>
          )}
        </div>

        <div className="spacer" />
        {commitInitial.isError && (
          <div className="rank-reveal__save-error">
            <Caption>No se pudo guardar este ranking.</Caption>
            <button
              type="button"
              className="link-action"
              onClick={() => position !== null && commitInitial.mutate(position)}
            >
              Reintentar
            </button>
          </div>
        )}
        <Body style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Tu respuesta movió a {picked.name}, no la puntuación del spot.
        </Body>
        <Button onClick={() => setRevealed(true)}>Agregar una nota</Button>
      </div>
    )
  }

  // B4 — note + occasion tags + a dish (reached once the score is revealed).
  if (position !== null) {
    return (
      <div className="screen">
        <div className="rank-note-head">
          <button type="button" className="link-action" onClick={() => setRevealed(false)}>
            ‹ Agregar nota
          </button>
          <button
            type="button"
            className="rank-skip"
            disabled={save.isPending}
            onClick={() => save.mutate(position)}
          >
            {/* The ranking itself already saved on reveal; this just finalizes
                without a note/tags/dish, so "Listo" ("Done", not "Skip") is
                accurate. */}
            Listo
          </button>
        </div>

        <div className="rank-summary">
          <PlaceCover
            seed={picked.id}
            name={picked.name}
            coverImageId={picked.coverImageId}
            size={{ w: 120, h: 120 }}
            className="rank-summary__thumb"
          />
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
          placeholder="con velas, vino natural, pide el branzino…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Eyebrow style={{ fontFamily: 'var(--font-mono)', marginTop: 'var(--space-4)' }}>
          Ocasión
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
          Agregar un plato
        </Eyebrow>
        <button
          type="button"
          className={`rank-dish-tile${chainDish ? ' rank-dish-tile--on' : ''}`}
          onClick={() => setChainDish((v) => !v)}
        >
          <span className="rank-dish-tile__plus">+</span>
          <span className="rank-dish-tile__label">
            {chainDish ? 'Foto después de publicar' : 'Agregar una foto'}
          </span>
        </button>

        <div className="spacer" />
        <Button disabled={save.isPending} onClick={() => save.mutate(position)}>
          {save.isPending ? 'Guardando…' : 'Guardar nota'}
        </Button>
      </div>
    )
  }

  // Sentiment — how did it feel? Narrows the comparison band.
  if (!sentiment) {
    return (
      <div className="screen">
        <BackBar
          label="‹ Atrás"
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
      <BackBar label="‹ Atrás" onBack={() => setSentiment(null)} />
      <PlaceStep
        existing={existingForCompare}
        item={picked}
        sentiment={sentiment}
        isRerank={isRerank}
        onPlaced={setPosition}
      />
    </div>
  )
}

function PlaceStep({
  existing,
  item,
  sentiment,
  isRerank,
  onPlaced,
}: {
  existing: Item[]
  item: Item
  sentiment: Sentiment
  isRerank: boolean
  onPlaced: (position: number) => void
}) {
  const initial = useMemo(
    () => initInsertBounded(existing, item, sentiment),
    [existing, item, sentiment],
  )
  const [state, setState] = useState<PairwiseState<Item>>(initial)
  // Comparisons already answered for this spot — the live remaining count is
  // recomputed from `state` each render (not a fixed initial estimate), so
  // the displayed total always matches the path actually being taken instead
  // of stalling at a stale "N de M" once the real count runs past it.
  const [answered, setAnswered] = useState(0)
  // First-run "how it works" coachmark — reads localStorage only on mount
  // (StrictMode-safe: the write happens on explicit dismiss, not here).
  const [showCoach, setShowCoach] = useState(() => !rankExplainerSeen())
  const comparison = nextComparison(state)
  const done = comparison === null && isDone(state)

  useEffect(() => {
    if (!done) return
    const pos = state.ordered.findIndex((x) => x.id === item.id) + 1
    onPlaced(pos > 0 ? pos : 1)
    // Once `done` is true the comparisons have stopped, so `state` no longer
    // changes — this can't re-fire on a later render.
  }, [done, state.ordered, item.id, onPlaced])

  if (comparison === null) {
    return <Body style={{ marginTop: 'var(--space-6)' }}>Ubicando…</Body>
  }

  const step = answered + 1
  const total = answered + comparisonsLeft(state)
  const pivotPos = state.ordered.findIndex((x) => x.id === comparison.pivot.id) + 1

  return (
    <div className="stack stack--loose" style={{ marginTop: 'var(--space-4)' }}>
      <div className="rank-progress">
        {step} de {total}
      </div>
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Title>¿Cuál estuvo mejor?</Title>
        <div className="rank-progress rank-progress--sub">
          Tu respuesta mueve a {item.name}, no la puntuación del spot.
        </div>
      </div>
      <div className="compare compare--battle" key={comparison.pivot.id}>
        <CompareCard
          item={comparison.current}
          subline={isRerank ? 'ya en tu lista' : 'nuevo en tu lista'}
          onClick={() => {
            setAnswered((a) => a + 1)
            setState((s) => choose(s, true))
          }}
        />
        <button
          type="button"
          className="compare__same"
          onClick={() => {
            setAnswered((a) => a + 1)
            setState((s) => tie(s))
          }}
        >
          Más o menos igual
        </button>
        <CompareCard
          item={comparison.pivot}
          subline={`#${pivotPos} en tu lista`}
          score={comparison.pivot.score ?? null}
          onClick={() => {
            setAnswered((a) => a + 1)
            setState((s) => choose(s, false))
          }}
        />
      </div>
      {showCoach && (
        <RankCoachmark
          onDismiss={() => {
            markRankExplainerSeen()
            setShowCoach(false)
          }}
        />
      )}
    </div>
  )
}

// First-run explainer for the pairwise mechanic — the one non-self-evident
// step in an otherwise clear flow. Never blocks: tapping the scrim or the CTA
// both dismiss, and answering the comparison underneath is never gated.
function RankCoachmark({ onDismiss }: { onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  // Keyboard users dismiss via Escape or the "Entendido" button — the scrim's
  // click-to-dismiss is a mouse-only convenience layered on top, same as any
  // modal backdrop, so it isn't itself a focusable/keyboard target.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only backdrop convenience; Escape (above) and the CTA button are the real keyboard paths
    <div className="rank-coach-scrim" data-mounted={mounted} onClick={onDismiss}>
      <Card className="rank-coach" onClick={(e) => e.stopPropagation()}>
        <Eyebrow>Cómo funciona</Eyebrow>
        <Title style={{ marginTop: 'var(--space-2)' }}>Sin estrellas. Solo comparas.</Title>
        {/* Purely illustrative — the Body text below carries the real
            explanation, so these are hidden from assistive tech rather than
            announced as buttons that do nothing. */}
        <div className="rank-coach__demo" aria-hidden="true">
          <Chip size="sm" state="selected" tabIndex={-1}>
            Este
          </Chip>
          <Chip size="sm" tabIndex={-1}>
            O este
          </Chip>
        </div>
        <Body className="rank-coach__body">
          Te mostramos dos spots a la vez. Eliges el que estuvo mejor, unas cuantas veces, y con eso
          encontramos el orden exacto de tu lista — la puntuación sale de ahí.
        </Body>
        <Button onClick={onDismiss}>Entendido</Button>
      </Card>
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
// ranked"), filter chips, a "Quiero probar" lead group when browsing
// unfiltered (the fast path for "rank last night's dinner" — see
// docs/UX_NEXT_STEPS.md §3), and an "Add a new restaurant" footer.
function FindStep({
  candList,
  existing,
  wantToTryIds,
  query,
  setQuery,
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
  wantToTryIds: string[]
  query: string
  setQuery: (v: string) => void
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
  const { position: myPosition, request: requestLocation } = useMyLocation()
  const q = query.trim().toLowerCase()
  // Hide "Abierto ahora" once the candidate list is catalog-heavy: it filters on
  // closesAt, which is null for every imported row (Foursquare has no hours), so
  // the filter would wipe almost everything. Keep it while active so it can be
  // turned back off. (M7)
  const hoursCoverage = candList.length
    ? candList.filter((r) => r.closesAt).length / candList.length
    : 1
  const showOpenChip = openNow || hoursCoverage >= 0.4
  // candList already comes from the server pre-filtered by q/openNow/
  // reserveOnly (mesa_norm + trigram — see the candidates query above);
  // re-running a naive client substring filter over it would wrongly EXCLUDE
  // an accent-insensitive server match ("meson" matching "Mesón" only
  // server-side, not by plain .includes()). `existing` (my own already-
  // ranked list, for re-rank) is always fetched in full and never filtered
  // server-side, so it still needs this.
  const existingFiltered = existing.filter((r) => {
    if (openNow && !r.closesAt) return false
    if (reserveOnly && !r.phone) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      (r.cuisine ?? '').toLowerCase().includes(q) ||
      (r.neighborhood ?? '').toLowerCase().includes(q)
    )
  })
  let filtered: Item[] = [...candList, ...existingFiltered]
  const distanceOf = (r: Item) =>
    myPosition && r.lat != null && r.lng != null
      ? haversineM(myPosition, { lat: r.lat, lng: r.lng })
      : null
  if (nearby && myPosition) {
    // Real distance, once we have one. Rows with no coordinates (a member-
    // added place before it has a geocode) sort to the end rather than being
    // dropped — they're still real candidates, just an unknown distance.
    filtered = [...filtered].sort((a, b) => {
      const da = distanceOf(a)
      const db = distanceOf(b)
      if (da == null && db == null) return a.name.localeCompare(b.name)
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
  } else if (nearby && myHood) {
    // No position yet (denied, or the request is still in flight) — degrade
    // to the self-declared-sector match rather than blocking the sort.
    filtered = [...filtered].sort((a, b) => {
      const am = a.neighborhood === myHood ? 0 : 1
      const bm = b.neighborhood === myHood ? 0 : 1
      return am - bm || a.name.localeCompare(b.name)
    })
  } else if (!q) {
    // No active search — alphabetical browse, mirroring the server's own
    // no-query default for candList.
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }
  // else: an active search with nearby off — keep candList's server-side
  // relevance order (prefix match → trigram similarity → name); re-sorting
  // it alphabetically here would throw away the whole point of that ranking.
  // existingFiltered's few matches just trail after, in the user's own
  // rank-position order.

  // Once actively searching by name, a flat list is enough — the lead group
  // only earns its place on the unfiltered "just browsing" screen.
  const leadGroup = q
    ? []
    : wantToTryIds
        .map((id) => filtered.find((r) => r.id === id))
        .filter((r): r is Item => Boolean(r))
  const leadIds = new Set(leadGroup.map((r) => r.id))
  const results = leadIds.size ? filtered.filter((r) => !leadIds.has(r.id)) : filtered

  const renderRow = (r: Item) => {
    const dist = distanceOf(r)
    return (
      <button key={r.id} type="button" className="rank-row" onClick={() => onPick(r.id)}>
        <PlaceCover
          seed={r.id}
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 160, h: 160 }}
          className="rank-row__thumb"
        />
        <div className="rank-row__main">
          <div className="rank-row__name">{r.name}</div>
          <Characteristics
            priceTier={r.priceTier}
            cuisine={r.cuisine}
            neighborhood={r.neighborhood}
            hours={r.closesAt ? `hasta ${r.closesAt}` : null}
            distance={dist != null ? formatDistance(dist) : null}
          />
        </div>
        {r.score != null ? (
          <div className="rank-row__score">{displayScore(r.score)}</div>
        ) : (
          <span className="rank-row__badge">sin rankear</span>
        )}
      </button>
    )
  }

  return (
    <div className="screen">
      <BackBar label="✕ Rankear un spot" onBack={onBack} />
      <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
        <Title>Encuentra el spot</Title>
      </div>
      <input
        className="field"
        style={{ marginTop: 'var(--space-4)' }}
        type="search"
        placeholder="Busca un spot donde hayas estado…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ChipRail style={{ marginTop: 'var(--space-3)' }}>
        <Chip
          size="sm"
          state={nearby ? 'selected' : 'default'}
          onClick={() => {
            setNearby((v) => !v)
            requestLocation()
          }}
        >
          Cerca
        </Chip>
        {showOpenChip && (
          <Chip
            size="sm"
            state={openNow ? 'selected' : 'default'}
            onClick={() => setOpenNow((v) => !v)}
          >
            Abierto ahora
          </Chip>
        )}
        <Chip
          size="sm"
          state={reserveOnly ? 'selected' : 'default'}
          onClick={() => setReserveOnly((v) => !v)}
        >
          Reservar
        </Chip>
      </ChipRail>

      <div className="rank-results" style={{ marginTop: 'var(--space-4)' }}>
        {leadGroup.length === 0 && results.length === 0 && !q ? (
          <Body>Ya rankeaste todo en Mesa.</Body>
        ) : leadGroup.length === 0 && results.length === 0 ? (
          <Body>Nada coincide. Prueba con otro nombre.</Body>
        ) : (
          <>
            {leadGroup.length > 0 && (
              <>
                <Eyebrow style={{ fontFamily: 'var(--font-mono)' }}>Quiero probar</Eyebrow>
                {leadGroup.map(renderRow)}
                <Eyebrow style={{ fontFamily: 'var(--font-mono)', marginTop: 'var(--space-3)' }}>
                  Todos
                </Eyebrow>
              </>
            )}
            {results.map(renderRow)}
          </>
        )}
        {adding ? (
          <AddPlaceForm addPlace={addPlace} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" className="rank-addnew" onClick={() => setAdding(true)}>
            + ¿No lo encuentras? Agrega un restaurante
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
        placeholder="Nombre del restaurante"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
      />
      <select className="field" value={slug} onChange={(e) => setSlug(e.target.value)}>
        <option value="" disabled>
          Sector
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
          Cancelar
        </Button>
        <Button
          disabled={!canAdd}
          style={{ width: 'auto', minHeight: 44, padding: '0 var(--space-5)' }}
          onClick={() => addPlace.mutate({ name: name.trim(), neighborhoodSlug: slug })}
        >
          {addPlace.isPending ? 'Agregando…' : 'Agregar y rankear'}
        </Button>
      </div>
    </div>
  )
}
