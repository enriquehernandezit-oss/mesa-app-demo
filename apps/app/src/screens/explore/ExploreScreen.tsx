import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { QuickActions } from '../../components/QuickActions'
import { ScreenHeader } from '../../components/ScreenHeader'
import {
  Body,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  Eyebrow,
  SectionHeader,
  Title,
} from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { PlaceCover } from '../../components/ui/PlaceCover'
import { SortIcon } from '../../components/ui/icons'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { toast } from '../../components/ui/toast-store'
import { ApiError, api } from '../../lib/api'
import { dedupeExternal } from '../../lib/dedupeExternal'
import { cuisineLabel } from '../../lib/display'
import type {
  ExploreMember,
  ExploreResponse,
  ExternalSuggestion,
  Neighborhood,
  NewRestaurant,
} from '../../lib/types'
import { useBack } from '../../lib/useBack'
import { useDebounced } from '../../lib/useDebounced'
import { useGoogleSession } from '../../lib/useGoogleSession'
import '../tabs/tabs.css'
import '../tabs/feed.css'
import './explore.css'

// Explore (Phase 6 mock F1) — searches your circle's rankings, not the open
// internet. Browses top spots by default; a query also returns members and
// dish-matched places ("place, dish, or member"). Two filter rails: attributes
// (score / open now / price) and, on its own line, barrio. The action rail
// matches the feed's.
const PRICES = [1, 2, 3, 4]

export function ExploreScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const googleSession = useGoogleSession()
  const [q, setQ] = useState('')
  const [hood, setHood] = useState<string | null>(null)
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [sort, setSort] = useState<'name' | 'score'>('score')

  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  // The cuisines actually in the catalog, for the filter rail — reflects real
  // data, so it stays right as the catalog grows.
  const cuisines = useQuery({
    queryKey: ['cuisines'],
    queryFn: () => api.get<{ cuisines: string[] }>('/restaurants/cuisines'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  // Default browse: with no query and no filters the API returns the top spots by
  // friends' score. So results always show — Explore is never a blank screen.
  const results = useQuery({
    queryKey: ['explore', q.trim(), hood, cuisine, price, openNow, sort],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim().length >= 2) params.set('q', q.trim())
      if (hood) params.set('neighborhood', hood)
      if (cuisine) params.set('cuisine', cuisine)
      if (price) params.set('price', String(price))
      if (openNow) params.set('open', '1')
      params.set('sort', sort)
      return api.get<ExploreResponse>(`/restaurants?${params}`)
    },
  })

  const hits = results.data?.restaurants ?? []
  const members = results.data?.members ?? []

  // "Abierto ahora" filters on closesAt, which is null for every imported
  // catalog row (Foursquare has no hours) — so once results are catalog-heavy
  // the filter would wipe ~all of them. Hide the chip when few current hits
  // have hours; keep it while it's active so it can be turned back off. (M7)
  const hoursCoverage = hits.length ? hits.filter((h) => h.closesAt).length / hits.length : 1
  const showOpenChip = openNow || hoursCoverage >= 0.4

  // Google gap-filler (M8, extended to Explore) — when Mesa's own catalog comes
  // up short for a real query, offer online matches. Debounced so the paid
  // request fires per pause; env-gated server-side (no key → [] → nothing
  // shows). A pick routes into the rank flow to add + rank it — the only way a
  // place enters Mesa's catalog.
  const debouncedQ = useDebounced(q.trim(), 300)
  const wantExternal = debouncedQ.length >= 3 && hits.length + members.length < 3
  const external = useQuery({
    queryKey: ['explore', 'search-external', debouncedQ],
    queryFn: () =>
      api.get<{ suggestions: ExternalSuggestion[] }>(
        `/restaurants/search-external?q=${encodeURIComponent(debouncedQ)}&s=${googleSession.token}`,
      ),
    enabled: wantExternal,
    staleTime: 300_000,
  })
  // Hide online matches for places the catalog already shows — a spot you
  // added (or ranked) shouldn't reappear under "En Google" as if it were new.
  // Compared against place hits only, never members (people ≠ places).
  const suggestions = wantExternal
    ? dedupeExternal(
        external.data?.suggestions ?? [],
        hits.map((h) => h.name),
      )
    : []

  // Tapping a Google result creates a real, populated profile immediately
  // (M9) and lands on it — Google search is how a place enters Mesa's
  // catalog, not a form the member fills in by hand.
  const fromGoogle = useMutation({
    mutationFn: (placeId: string) =>
      api.post<{ restaurant: NewRestaurant }>('/restaurants/from-google', {
        placeId,
        sessionToken: googleSession.token,
      }),
    onSuccess: ({ restaurant }) => {
      googleSession.reset()
      queryClient.invalidateQueries({ queryKey: ['explore'] })
      navigate({ to: '/r/$restaurantId', params: { restaurantId: restaurant.id } })
    },
    onError: (err) => {
      const status = err instanceof ApiError ? err.status : null
      toast({
        variant: 'error',
        message:
          status === 429
            ? 'Llegaste al límite de lugares por hoy.'
            : status === 409
              ? 'Google dice que este lugar cerró permanentemente.'
              : 'No se pudo conectar con Google. Intenta de nuevo.',
      })
    },
  })

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />
        <div className="tab-header">
          <Eyebrow>Explorar</Eyebrow>
          <Title>Encuentra un spot</Title>
          <input
            className="search-field"
            type="search"
            placeholder="Busca un spot, plato o miembro"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <QuickActions />

        {/* Two rails: attribute filters (sort/open/price) and, on its own line,
            sector. Sector is the highest-value filter for a
            neighbourhood-driven city — one crammed rail buried all 7 sectors
            ~600px off-screen behind the price chips. Each rail scrolls on its
            own now, so the sectors are visible from the start of their line. */}
        <ChipRail style={{ marginBottom: 'var(--space-2)' }}>
          <Chip
            size="sm"
            icon={<SortIcon size={12} />}
            state={sort === 'score' ? 'selected' : 'default'}
            onClick={() => setSort(sort === 'score' ? 'name' : 'score')}
          >
            Puntuación
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
          {PRICES.map((pt) => (
            <Chip
              key={pt}
              size="sm"
              state={price === pt ? 'selected' : 'default'}
              onClick={() => setPrice(price === pt ? null : pt)}
            >
              {'$'.repeat(pt)}
            </Chip>
          ))}
        </ChipRail>
        <ChipRail aria-label="Filtrar por sector" style={{ marginBottom: 'var(--space-4)' }}>
          {neighborhoods.data?.neighborhoods.map((n) => (
            <Chip
              key={n.slug}
              size="sm"
              state={hood === n.slug ? 'selected' : 'default'}
              onClick={() => setHood(hood === n.slug ? null : n.slug)}
            >
              {n.name}
            </Chip>
          ))}
        </ChipRail>
        {(cuisines.data?.cuisines.length ?? 0) > 0 && (
          <ChipRail aria-label="Filtrar por cocina" style={{ marginBottom: 'var(--space-4)' }}>
            {cuisines.data?.cuisines.map((cz) => (
              <Chip
                key={cz}
                size="sm"
                state={cuisine === cz ? 'selected' : 'default'}
                onClick={() => setCuisine(cuisine === cz ? null : cz)}
              >
                {cuisineLabel(cz)}
              </Chip>
            ))}
          </ChipRail>
        )}

        {members.length > 0 && (
          <>
            <SectionHeader>Miembros</SectionHeader>
            {members.map((m) => (
              <MemberRow key={m.id} m={m} />
            ))}
          </>
        )}

        {results.isPending ? (
          <Body>Buscando…</Body>
        ) : results.isError ? (
          <ErrorState onRetry={() => results.refetch()}>No se pudo buscar.</ErrorState>
        ) : hits.length === 0 && members.length === 0 && suggestions.length === 0 ? (
          <EmptyState>Nada coincide.</EmptyState>
        ) : (
          <>
            {members.length > 0 && hits.length > 0 && <SectionHeader>Spots</SectionHeader>}
            {hits.map((r, i) => {
              return (
                <Link
                  key={r.id}
                  to="/r/$restaurantId"
                  params={{ restaurantId: r.id }}
                  className="explore-row"
                >
                  <span className="explore-row__rank">{i + 1}</span>
                  <PlaceCover
                    seed={r.id}
                    name={r.name}
                    coverImageId={r.coverImageId}
                    size={{ w: 200, h: 200 }}
                    className="search-thumb"
                  />
                  <div className="ranking-main">
                    <div className="ranking-name" style={{ fontSize: 'var(--text-serif-sm)' }}>
                      {r.name}
                    </div>
                    <Characteristics
                      priceTier={r.priceTier}
                      cuisine={r.cuisine}
                      neighborhood={r.neighborhood}
                      hours={r.closesAt ? `hasta ${r.closesAt}` : null}
                    />
                  </div>
                  {r.friendCount > 0 && r.friendAvg != null ? (
                    <ScoreBadge
                      size="sm"
                      score={r.friendAvg}
                      attribution={{ kind: 'friends', count: r.friendCount }}
                    />
                  ) : (
                    r.isNew && <span className="explore-row__new">Sé el primero</span>
                  )}
                </Link>
              )
            })}
          </>
        )}

        {/* Online matches when Mesa's own catalog is thin. Tapping one creates
            a full profile from that place's Google listing and lands on it
            (M9) — the only way a place enters Mesa. "Powered by Google" is
            required off-map (Google ToS); swap the text for the official logo
            asset before a real launch. */}
        {suggestions.length > 0 && (
          <div className="explore-external">
            <SectionHeader>En Google</SectionHeader>
            {suggestions.map((s) => {
              const pending = fromGoogle.isPending && fromGoogle.variables === s.providerPlaceId
              return (
                <button
                  key={s.providerPlaceId}
                  type="button"
                  className="explore-external__row"
                  disabled={fromGoogle.isPending}
                  onClick={() => fromGoogle.mutate(s.providerPlaceId)}
                >
                  <div className="explore-external__name">{s.name}</div>
                  {(pending || s.secondaryText) && (
                    <div className="explore-external__meta">
                      {pending ? 'Creando perfil…' : s.secondaryText}
                    </div>
                  )}
                </button>
              )
            })}
            <div className="explore-external__attr">Powered by Google</div>
          </div>
        )}
      </div>
    </div>
  )
}

// A member result row ("place, dish, or member") — links to their passport.
function MemberRow({ m }: { m: ExploreMember }) {
  return (
    <Link to="/u/$userId" params={{ userId: m.id }} className="explore-member">
      <Avatar name={m.name || m.handle || 'm'} src={m.image} size={44} />
      <div className="ranking-main">
        <div className="ranking-name" style={{ fontSize: 'var(--text-serif-sm)' }}>
          {m.name || m.handle}
        </div>
        <div className="explore-member__meta">
          {[m.handle ? `@${m.handle}` : null, `${m.rankedCount} rankeados`, m.neighborhood]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </Link>
  )
}
