import { useQuery } from '@tanstack/react-query'
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
import { api } from '../../lib/api'
import type { ExploreMember, ExploreResponse, Neighborhood } from '../../lib/types'
import { useBack } from '../../lib/useBack'
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
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const [q, setQ] = useState('')
  const [hood, setHood] = useState<string | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [sort, setSort] = useState<'name' | 'score'>('score')

  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  // Default browse: with no query and no filters the API returns the top spots by
  // friends' score. So results always show — Explore is never a blank screen.
  const results = useQuery({
    queryKey: ['explore', q.trim(), hood, price, openNow, sort],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim().length >= 2) params.set('q', q.trim())
      if (hood) params.set('neighborhood', hood)
      if (price) params.set('price', String(price))
      if (openNow) params.set('open', '1')
      params.set('sort', sort)
      return api.get<ExploreResponse>(`/restaurants?${params}`)
    },
  })

  const hits = results.data?.restaurants ?? []
  const members = results.data?.members ?? []

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
          <Chip
            size="sm"
            state={openNow ? 'selected' : 'default'}
            onClick={() => setOpenNow((v) => !v)}
          >
            Abierto ahora
          </Chip>
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
        ) : hits.length === 0 && members.length === 0 ? (
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
