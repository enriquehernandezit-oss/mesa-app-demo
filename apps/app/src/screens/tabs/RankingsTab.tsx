import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Chip, EmptyState, ErrorState, Eyebrow, Title } from '../../components/ui'
import { ShareIcon } from '../../components/ui/icons'
import { Characteristics } from '../../components/ui/patterns'
import { toast } from '../../components/ui/toast-store'
import { useProfile } from '../../hooks/useProfile'
import { api, apiOrigin } from '../../lib/api'
import { displayScore, tagLabel } from '../../lib/display'
import { cloudinaryUrl } from '../../lib/media'
import { removeRankingWithUndo } from '../../lib/rankingRemoval'
import { renderListCard, shareCard } from '../../lib/shareCard'
import type { MeStats, Ranking, SavedPlace } from '../../lib/types'
import './tabs.css'
import './rankings.css'

// The ranked passport (M3). Mine = the ordered list with serif numerals, brass
// scores, and vibe notes. Want-to-try = saved places waiting to be ranked.
export function RankingsTab() {
  const search = useSearch({ strict: false }) as { tab?: 'mine' | 'saved' | 'barrios' }
  const [tab, setTab] = useState<'mine' | 'saved' | 'barrios'>(search.tab ?? 'mine')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const { data: me } = useProfile(true)

  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
    enabled: tab === 'saved',
  })
  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })

  // Tags actually used in my list, for the filter row.
  const myTags = [...new Set((mine.data?.rankings ?? []).flatMap((r) => r.tags ?? []))]
  const visibleRankings = (mine.data?.rankings ?? []).filter(
    (r) => !tagFilter || (r.tags ?? []).includes(tagFilter),
  )

  // The viral artifact: my top 5 as a branded story card → native share sheet.
  async function shareMyList() {
    const list = mine.data?.rankings ?? []
    if (list.length === 0 || sharing) return
    setSharing(true)
    try {
      const top = list.slice(0, 5)
      const first = top[0]
      const name = (me?.profile.name || me?.profile.handle || 'my').split(' ')[0]
      const blob = await renderListCard({
        eyebrow: `Top ${top.length} de ${name}`,
        subtitle: `${me?.profile.neighborhood?.name ?? 'Santo Domingo'} · Mesa`,
        items: top.map((r) => ({
          position: r.position,
          name: r.restaurant.name,
          score: r.score,
        })),
        coverUrl: first ? cloudinaryUrl(first.restaurant.coverImageId, { w: 1080, h: 780 }) : null,
      })
      const link = me?.profile.handle ? `${apiOrigin}/p/u/${me.profile.handle}` : apiOrigin
      await shareCard(blob, 'mesa-top.jpg', `Mi ranking en Mesa 🥂\n${link}`)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div>
      <div className="tab-header">
        <Eyebrow>Tu lista</Eyebrow>
        <div className="rankings-title-row">
          <Title>Rankings</Title>
          {tab === 'mine' && (mine.data?.rankings.length ?? 0) > 0 && (
            <button type="button" className="share-pill" onClick={shareMyList} disabled={sharing}>
              {sharing ? (
                '…'
              ) : (
                <>
                  <ShareIcon size={14} /> Compartir
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats header — places · average · streak. */}
      {stats.data && (
        <div className="stats-row">
          <div className="stat">
            <span className="stat__n">{stats.data.places}</span>
            <span className="stat__l">lugares</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.avgScore != null ? displayScore(stats.data.avgScore) : '—'}
            </span>
            <span className="stat__l">prom.</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.streakWeeks > 0 ? `${stats.data.streakWeeks} sem.` : '—'}
            </span>
            <span className="stat__l">racha</span>
          </div>
        </div>
      )}

      <div className="rank-toggle">
        <Chip state={tab === 'mine' ? 'selected' : 'default'} onClick={() => setTab('mine')}>
          Mía
        </Chip>
        <Chip state={tab === 'saved' ? 'selected' : 'default'} onClick={() => setTab('saved')}>
          Quiero probar
        </Chip>
        <Chip state={tab === 'barrios' ? 'selected' : 'default'} onClick={() => setTab('barrios')}>
          Sectores
        </Chip>
      </div>

      {tab === 'mine' && myTags.length > 0 && (
        <div className="tag-row" style={{ marginBottom: 'var(--space-4)' }}>
          {myTags.map((t) => (
            <Chip
              key={t}
              size="sm"
              state={tagFilter === t ? 'selected' : 'default'}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              {tagLabel(t)}
            </Chip>
          ))}
        </div>
      )}

      {tab === 'mine' &&
        (mine.isPending ? (
          <Body>Cargando tu lista…</Body>
        ) : mine.isError ? (
          <ErrorState onRetry={() => mine.refetch()}>
            No se pudieron cargar tus rankings.
          </ErrorState>
        ) : visibleRankings.length > 0 ? (
          visibleRankings.map((r) => <RankingRow key={r.id} ranking={r} />)
        ) : (
          <EmptyMine />
        ))}

      {tab === 'barrios' && <BarriosView rankings={mine.data?.rankings ?? []} />}

      {tab === 'saved' &&
        (saved.isPending ? (
          <Body>Cargando…</Body>
        ) : saved.data && saved.data.saved.length > 0 ? (
          saved.data.saved.map((s) => <SavedRow key={s.restaurant.id} saved={s} />)
        ) : (
          <EmptyState body="Los lugares que quieras probar se juntarán aquí.">
            Nada guardado todavía.
          </EmptyState>
        ))}
    </div>
  )
}

// Where you've eaten, by neighborhood — the organizational view.
function BarriosView({ rankings }: { rankings: Ranking[] }) {
  const byHood = new Map<string, { count: number; avg: number }>()
  for (const r of rankings) {
    const hood = r.neighborhood ?? 'Santo Domingo'
    const cur = byHood.get(hood) ?? { count: 0, avg: 0 }
    byHood.set(hood, { count: cur.count + 1, avg: cur.avg + r.score })
  }
  const hoods = [...byHood.entries()]
    .map(([name, v]) => ({ name, count: v.count, avg: v.avg / v.count }))
    .sort((a, b) => b.count - a.count)
  const max = hoods[0]?.count ?? 1

  if (hoods.length === 0) {
    return <EmptyState>Rankea algunos lugares primero.</EmptyState>
  }
  return (
    <div>
      {hoods.map((h) => (
        <div key={h.name} className="hood-row">
          <div className="hood-row__top">
            <span className="hood-row__name">{h.name}</span>
            <span className="hood-row__stats">
              {h.count} · prom. {displayScore(h.avg)}
            </span>
          </div>
          <div className="hood-bar">
            <div className="hood-bar__fill" style={{ width: `${(h.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyMine() {
  return (
    <EmptyState body="Rankea un spot y ocupa su puesto en tu pasaporte.">
      Tu lista está vacía.
    </EmptyState>
  )
}

function RankingRow({ ranking }: { ranking: Ranking }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ranking.note ?? '')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rankings'] })

  const saveNote = useMutation({
    mutationFn: () => api.patch(`/rankings/${ranking.id}/note`, { body: draft.trim() }),
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
    onError: () => {
      toast({
        variant: 'error',
        message: 'No se pudo guardar la nota',
        action: { label: 'Intentar de nuevo', onClick: () => saveNote.mutate() },
      })
    },
  })

  const thumb = cloudinaryUrl(ranking.restaurant.coverImageId, { w: 160, h: 160 })
  return (
    <div className="ranking-row" style={{ gridTemplateColumns: 'auto auto 1fr auto' }}>
      <div className="ranking-numeral">{ranking.position}</div>
      <Link
        to="/r/$restaurantId"
        params={{ restaurantId: ranking.restaurant.id }}
        className="ranking-thumb"
      >
        {thumb && <img src={thumb} alt="" loading="lazy" />}
      </Link>
      <div className="ranking-main">
        <Link
          to="/r/$restaurantId"
          params={{ restaurantId: ranking.restaurant.id }}
          className="ranking-name-link"
        >
          <div className="ranking-name">{ranking.restaurant.name}</div>
          <Characteristics
            priceTier={ranking.restaurant.priceTier}
            cuisine={ranking.restaurant.cuisine}
            neighborhood={ranking.neighborhood}
          />
        </Link>

        {(ranking.favoriteDish || (ranking.tags?.length ?? 0) > 0) && !editing && (
          <div className="ranking-extras">
            {ranking.favoriteDish && (
              <span className="ranking-dish">Pide: {ranking.favoriteDish}</span>
            )}
            {(ranking.tags ?? []).map((t) => (
              <span key={t} className="mini-tag">
                {tagLabel(t)}
              </span>
            ))}
          </div>
        )}
        {editing ? (
          <>
            <textarea
              className="note-editor"
              maxLength={140}
              placeholder="Una línea sobre por qué…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="ranking-actions">
              <button
                type="button"
                className="link-action"
                onClick={() => saveNote.mutate()}
                disabled={saveNote.isPending}
              >
                Guardar
              </button>
              <button
                type="button"
                className="link-action"
                onClick={() => {
                  setDraft(ranking.note ?? '')
                  setEditing(false)
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            {ranking.note && <div className="ranking-note">“{ranking.note}”</div>}
            <div className="ranking-actions">
              <button type="button" className="link-action" onClick={() => setEditing(true)}>
                {ranking.note ? 'Editar nota' : 'Agregar nota'}
              </button>
              <button
                type="button"
                className="link-action link-action--danger"
                onClick={() => removeRankingWithUndo(ranking)}
              >
                Quitar
              </button>
            </div>
          </>
        )}
      </div>
      <div className="ranking-score">{displayScore(ranking.score)}</div>
    </div>
  )
}

function SavedRow({ saved }: { saved: SavedPlace }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/${saved.restaurant.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved'] }),
    onError: () => {
      toast({
        variant: 'error',
        message: 'No se pudo quitar de tu lista',
        action: { label: 'Intentar de nuevo', onClick: () => remove.mutate() },
      })
    },
  })
  return (
    <div className="saved-row">
      <div className="ranking-main">
        <div className="ranking-name">{saved.restaurant.name}</div>
        <Characteristics
          priceTier={saved.restaurant.priceTier}
          cuisine={saved.restaurant.cuisine}
          neighborhood={saved.neighborhood}
        />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flex: 'none' }}>
        <Button
          variant="secondary"
          style={{ width: 'auto', minHeight: 40, padding: '0 var(--space-4)' }}
          onClick={() => navigate({ to: '/rank', search: { restaurant: saved.restaurant.id } })}
        >
          Rankear
        </Button>
        <button
          type="button"
          className="link-action link-action--danger"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Quitando…' : 'Quitar'}
        </button>
      </div>
    </div>
  )
}
