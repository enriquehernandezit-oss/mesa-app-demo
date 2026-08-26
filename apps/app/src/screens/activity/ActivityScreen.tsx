import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { markActivitySeen } from '../../components/TopBar'
import { Body, Chip, ChipRail, EmptyState, ErrorState, Eyebrow } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { PlaceCover } from '../../components/ui/PlaceCover'
import { api } from '../../lib/api'
import { displayScore } from '../../lib/display'
import { timeAgo } from '../../lib/time'
import type { ActivityItem } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import './activity.css'

type Filter = 'all' | 'follows' | 'rankings' | 'tables'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'follows', label: 'Seguidores' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'tables', label: 'Mesas' },
]

// Bucket an event into Today / This week / Earlier for the section grouping.
function bucket(at: string): 'today' | 'week' | 'earlier' {
  const d = new Date(at).getTime()
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d >= startToday) return 'today'
  if (d >= startToday - 6 * 86_400_000) return 'week'
  return 'earlier'
}
const SECTIONS: { key: 'today' | 'week' | 'earlier'; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'earlier', label: 'Antes' },
]

// The screen behind the bell (mock F2): cheers, new followers, friends ranking
// your saved spots, and friends out-ranking you — every row carries its own
// action, so it's a place to DO things, not only read them. "Mark read" clears
// the bell's badge. (Table activity arrives with the Tonight fixtures.)
export function ActivityScreen() {
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const q = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
  })

  const markRead = () => {
    markActivitySeen()
    queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  const items = q.data?.activity ?? []
  const shown = items.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'follows') return a.type === 'follow'
    if (filter === 'tables') return false // table activity lands with Tonight (M11)
    return a.type === 'cheers' || a.type === 'saved_ranked' || a.type === 'friend_ranked'
  })
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: shown.filter((a) => bucket(a.at) === s.key),
  })).filter((s) => s.items.length > 0)

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader
          onBack={goBack}
          backLabel="Actividad"
          right={
            <button type="button" className="activity-markread" onClick={markRead}>
              Marcar leído
            </button>
          }
        />

        <ChipRail style={{ margin: 'var(--space-3) 0 var(--space-4)' }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              size="sm"
              state={filter === f.value ? 'selected' : 'default'}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </ChipRail>

        {q.isPending ? (
          <Body>Cargando…</Body>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar la actividad.</ErrorState>
        ) : sections.length === 0 ? (
          <EmptyState body="Los cheers, nuevos seguidores, y amigos probando tus spots guardados aparecen aquí.">
            Tranquilo por ahora.
          </EmptyState>
        ) : (
          sections.map((s) => (
            <div key={s.key}>
              <Eyebrow
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  margin: 'var(--space-5) 0 var(--space-2)',
                }}
              >
                {s.label}
              </Eyebrow>
              {s.items.map((a) => (
                <ActivityRow key={`${a.type}-${a.user.id}-${a.at}`} a={a} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ActivityRow({ a }: { a: ActivityItem }) {
  const queryClient = useQueryClient()
  const [followed, setFollowed] = useState(Boolean(a.followsBack))
  const follow = useMutation({
    mutationFn: () => api.post('/social/follow', { userId: a.user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })
  const place = a.restaurant && (
    <Link
      to="/r/$restaurantId"
      params={{ restaurantId: a.restaurant.id }}
      className="activity-row__place"
    >
      {a.restaurant.name}
    </Link>
  )
  return (
    <div className="activity-row">
      <Link to="/u/$userId" params={{ userId: a.user.id }}>
        <Avatar name={a.user.name || a.user.handle || 'm'} src={a.user.image} size={36} />
      </Link>
      <div className="activity-row__main">
        <span className="activity-row__text">
          <b>{a.user.name || a.user.handle}</b>{' '}
          {a.type === 'cheers' && <>le dio cheers a tu ranking de {place}</>}
          {a.type === 'follow' && 'empezó a seguirte'}
          {a.type === 'saved_ranked' && <>rankeó {place} — está en tu lista</>}
          {a.type === 'friend_ranked' && a.score != null && (
            <>
              rankeó {place} con {displayScore(a.score)}
              {/* Lead with the place and their score; only surface the
                  comparison when you two genuinely disagree (≥1 point apart),
                  framed as taste, not a scoreboard. A small gap or a tie shows
                  nothing — which also fixes the old `>=` that reported ties as
                  "por encima de tu". */}
              {a.yourScore != null && Math.abs(a.score - a.yourScore) >= 10 && (
                <> — {a.score > a.yourScore ? 'le gustó más que a ti' : 'a ti te gustó más'}</>
              )}
            </>
          )}
        </span>
        <span className="feed-time">{timeAgo(a.at)}</span>
      </div>
      {a.type === 'follow' ? (
        followed ? (
          <span className="activity-row__following">Siguiendo</span>
        ) : (
          <button
            type="button"
            className="activity-row__follow"
            onClick={() => {
              setFollowed(true)
              follow.mutate()
            }}
          >
            Seguir
          </button>
        )
      ) : (
        a.restaurant && (
          <PlaceCover
            seed={a.restaurant.id}
            name={a.restaurant.name}
            coverImageId={a.restaurant.coverImageId}
            size={{ w: 96, h: 96 }}
            className="activity-row__thumb"
          />
        )
      )}
    </div>
  )
}
