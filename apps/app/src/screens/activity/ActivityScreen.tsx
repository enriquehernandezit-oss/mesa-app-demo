import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { markActivitySeen } from '../../components/TopBar'
import { Body, Chip, ChipRail, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import type { ActivityItem } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import './activity.css'

type Filter = 'all' | 'follows' | 'rankings'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'follows', label: 'Follows' },
  { value: 'rankings', label: 'Rankings' },
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
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'earlier', label: 'Earlier' },
]

// The screen behind the bell: cheers on your rankings, new followers, and
// friends ranking spots you saved. Opening it advances the seen-watermark.
export function ActivityScreen() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const q = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
  })

  useEffect(() => {
    markActivitySeen()
  }, [])

  const items = q.data?.activity ?? []
  const shown = items.filter((a) =>
    filter === 'all'
      ? true
      : filter === 'follows'
        ? a.type === 'follow'
        : a.type === 'cheers' || a.type === 'saved_ranked',
  )
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: shown.filter((a) => bucket(a.at) === s.key),
  })).filter((s) => s.items.length > 0)

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <button type="button" className="link-action" onClick={() => navigate({ to: '/discover' })}>
          ← Back
        </button>
        <div className="tab-header" style={{ marginTop: 'var(--space-3)' }}>
          <Eyebrow>Activity</Eyebrow>
          <Title>What you missed</Title>
        </div>

        <ChipRail style={{ marginBottom: 'var(--space-4)' }}>
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
          <Body>Loading…</Body>
        ) : sections.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Quiet for now.</SerifItalic>
            <Body>Cheers, new followers, and friends trying your saved spots land here.</Body>
          </div>
        ) : (
          sections.map((s) => (
            <div key={s.key}>
              <Eyebrow style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>{s.label}</Eyebrow>
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
  return (
    <div className="activity-row">
      <Link to="/u/$userId" params={{ userId: a.user.id }}>
        <Avatar name={a.user.name || a.user.handle || 'm'} src={a.user.image} size={36} />
      </Link>
      <div className="activity-row__main">
        <span className="activity-row__text">
          <b>{a.user.name || a.user.handle}</b>{' '}
          {a.type === 'cheers' && (
            <>
              brindó por tu ranking de{' '}
              {a.restaurant && (
                <Link
                  to="/r/$restaurantId"
                  params={{ restaurantId: a.restaurant.id }}
                  className="activity-row__place"
                >
                  {a.restaurant.name}
                </Link>
              )}{' '}
              🥂
            </>
          )}
          {a.type === 'follow' && 'empezó a seguirte'}
          {a.type === 'saved_ranked' && (
            <>
              rankeó{' '}
              {a.restaurant && (
                <Link
                  to="/r/$restaurantId"
                  params={{ restaurantId: a.restaurant.id }}
                  className="activity-row__place"
                >
                  {a.restaurant.name}
                </Link>
              )}{' '}
              — está en tu lista
            </>
          )}
        </span>
      </div>
      <span className="feed-time">{timeAgo(a.at)}</span>
    </div>
  )
}
