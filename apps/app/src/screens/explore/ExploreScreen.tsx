import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Chip, ChipRail, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { cloudinaryUrl } from '../../lib/media'
import type { ExploreHit, Neighborhood } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/feed.css'
import './explore.css'

// Explore (Phase 6) — search your circle's rankings, filtered by price / barrio
// and sorted by friends' score. Promoted out of the Discover search box into its
// own surface. Each result carries the friend-signal badge.
const PRICES = [1, 2, 3, 4]

export function ExploreScreen() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hood, setHood] = useState<string | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [sort, setSort] = useState<'name' | 'score'>('name')

  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const active = q.trim().length >= 2 || hood !== null || price !== null
  const results = useQuery({
    queryKey: ['explore', q.trim(), hood, price, sort],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim().length >= 2) params.set('q', q.trim())
      if (hood) params.set('neighborhood', hood)
      if (price) params.set('price', String(price))
      params.set('sort', sort)
      return api.get<{ restaurants: ExploreHit[] }>(`/restaurants?${params}`)
    },
    enabled: active,
  })

  const hits = results.data?.restaurants ?? []

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <button type="button" className="link-action" onClick={() => navigate({ to: '/discover' })}>
          ← Back
        </button>
        <div className="tab-header" style={{ marginTop: 'var(--space-3)' }}>
          <Eyebrow>Explore</Eyebrow>
          <Title>Find a spot</Title>
          <input
            className="search-field"
            type="search"
            placeholder="Search a place, cuisine, or barrio…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ChipRail style={{ marginBottom: 'var(--space-3)' }}>
          <Chip
            size="sm"
            state={sort === 'score' ? 'selected' : 'default'}
            onClick={() => setSort(sort === 'score' ? 'name' : 'score')}
          >
            ⇅ Score
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
        <ChipRail style={{ marginBottom: 'var(--space-4)' }}>
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

        {!active ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Search, or pick a filter.</SerifItalic>
          </div>
        ) : results.isPending ? (
          <Body>Searching…</Body>
        ) : hits.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Nothing matches.</SerifItalic>
          </div>
        ) : (
          hits.map((r, i) => {
            const cover = cloudinaryUrl(r.coverImageId, { w: 200, h: 200 })
            return (
              <Link
                key={r.id}
                to="/r/$restaurantId"
                params={{ restaurantId: r.id }}
                className="explore-row"
              >
                <span className="explore-row__rank">{i + 1}</span>
                {cover ? (
                  <img className="search-thumb" src={cover} alt="" />
                ) : (
                  <div className="search-thumb" />
                )}
                <div className="ranking-main">
                  <div className="ranking-name" style={{ fontSize: '1.2rem' }}>
                    {r.name}
                  </div>
                  <Characteristics
                    priceTier={r.priceTier}
                    cuisine={r.cuisine}
                    neighborhood={r.neighborhood}
                  />
                </div>
                {r.friendCount > 0 && r.friendAvg != null && (
                  <ScoreBadge
                    size="sm"
                    score={r.friendAvg}
                    attribution={{ kind: 'friends', count: r.friendCount }}
                    caption={r.friendCount === 1 ? 'friend' : 'friends'}
                  />
                )}
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
