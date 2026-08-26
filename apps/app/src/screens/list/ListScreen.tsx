import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Body, EmptyState, Eyebrow, Title } from '../../components/ui'
import { PlaceCover } from '../../components/ui/PlaceCover'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import type { ListDetailResponse } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import '../tabs/tabs.css'
import '../explore/explore.css'
import './list.css'

// A curated list's detail — its members in editorial order, each with the
// friend signal. Reached from the Discover carousel or a restaurant's pills.
export function ListScreen() {
  const { slug } = useParams({ from: '/lists/$slug' })
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const q = useQuery({
    queryKey: ['list', slug],
    queryFn: () => api.get<ListDetailResponse>(`/lists/${slug}`),
    retry: false,
  })

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />

        {q.isPending ? (
          <Body style={{ marginTop: 'var(--space-4)' }}>Cargando…</Body>
        ) : q.isError || !q.data ? (
          <EmptyState>Lista no encontrada.</EmptyState>
        ) : (
          <>
            <div className="list-hero">
              <PlaceCover
                seed={slug}
                name={q.data.list.title}
                coverImageId={q.data.list.coverImageId}
                size={{ w: 1000, h: 560 }}
                className="list-hero__cover"
              />
              <span className="list-hero__tag">film · con velas</span>
            </div>
            <div className="tab-header" style={{ marginTop: 'var(--space-4)' }}>
              <Eyebrow>Destacada · {q.data.items.length} spots</Eyebrow>
              <Title>{q.data.list.title}</Title>
              {q.data.list.subtitle && <Body>{q.data.list.subtitle}</Body>}
            </div>

            {q.data.items.map((r) => {
              return (
                <Link
                  key={r.id}
                  to="/r/$restaurantId"
                  params={{ restaurantId: r.id }}
                  className="explore-row"
                >
                  <span className="explore-row__rank">{r.position}</span>
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
                    />
                  </div>
                  {r.myScore != null ? (
                    <ScoreBadge size="sm" score={r.myScore} attribution={{ kind: 'you' }} />
                  ) : (
                    r.friendCount > 0 &&
                    r.friendAvg != null && (
                      <ScoreBadge
                        size="sm"
                        score={r.friendAvg}
                        attribution={{ kind: 'friends', count: r.friendCount }}
                      />
                    )
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
