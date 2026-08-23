import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Body, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { cloudinaryUrl } from '../../lib/media'
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

  const cover = cloudinaryUrl(q.data?.list.coverImageId, { w: 1000, h: 560 })

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />

        {q.isPending ? (
          <Body style={{ marginTop: 'var(--space-4)' }}>Cargando…</Body>
        ) : q.isError || !q.data ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Lista no encontrada.</SerifItalic>
          </div>
        ) : (
          <>
            {cover && (
              <div className="list-hero" style={{ backgroundImage: `url(${cover})` }}>
                <span className="list-hero__tag">film · con velas</span>
              </div>
            )}
            <div className="tab-header" style={{ marginTop: 'var(--space-4)' }}>
              <Eyebrow>Destacada · {q.data.items.length} spots</Eyebrow>
              <Title>{q.data.list.title}</Title>
              {q.data.list.subtitle && <Body>{q.data.list.subtitle}</Body>}
            </div>

            {q.data.items.map((r) => {
              const thumb = cloudinaryUrl(r.coverImageId, { w: 200, h: 200 })
              return (
                <Link
                  key={r.id}
                  to="/r/$restaurantId"
                  params={{ restaurantId: r.id }}
                  className="explore-row"
                >
                  <span className="explore-row__rank">{r.position}</span>
                  {thumb ? (
                    <img className="search-thumb" src={thumb} alt="" loading="lazy" />
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
                    />
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
