import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { markActivitySeen } from '../../components/TopBar'
import { Body, Chip, ChipRail, Eyebrow, SerifItalic } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { api } from '../../lib/api'
import { displayScore } from '../../lib/display'
import { cloudinaryUrl } from '../../lib/media'
import { timeAgo } from '../../lib/time'
import type { ActivityItem } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import './activity.css'

type Filter = 'all' | 'follows' | 'rankings' | 'tables'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'follows', label: 'Follows' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'tables', label: 'Tables' },
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

// The screen behind the bell (mock F2): cheers, new followers, friends ranking
// your saved spots, and friends out-ranking you — every row carries its own
// action, so it's a place to DO things, not only read them. "Mark read" clears
// the bell's badge. (Table activity arrives with the Tonight fixtures.)
export function ActivityScreen() {
  const navigate = useNavigate()
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
        <div className="activity-head">
          <button
            type="button"
            className="link-action"
            onClick={() => navigate({ to: '/discover' })}
          >
            ‹ Activity
          </button>
          <button type="button" className="activity-markread" onClick={markRead}>
            Mark read
          </button>
        </div>

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
          <Body>Loading…</Body>
        ) : sections.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Quiet for now.</SerifItalic>
            <Body>Cheers, new followers, and friends trying your saved spots land here.</Body>
          </div>
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
  const thumb = a.restaurant && cloudinaryUrl(a.restaurant.coverImageId, { w: 96, h: 96 })

  return (
    <div className="activity-row">
      <Link to="/u/$userId" params={{ userId: a.user.id }}>
        <Avatar name={a.user.name || a.user.handle || 'm'} src={a.user.image} size={36} />
      </Link>
      <div className="activity-row__main">
        <span className="activity-row__text">
          <b>{a.user.name || a.user.handle}</b>{' '}
          {a.type === 'cheers' && <>cheered your ranking of {place} 🥂</>}
          {a.type === 'follow' && 'started following you'}
          {a.type === 'saved_ranked' && <>ranked {place} — it's on your list</>}
          {a.type === 'friend_ranked' && a.score != null && (
            <>
              ranked {place} {displayScore(a.score)}
              {a.yourScore != null && (
                <>
                  {' — '}
                  {a.score >= a.yourScore ? 'above' : 'below'} your {displayScore(a.yourScore)}
                </>
              )}
            </>
          )}
        </span>
        <span className="feed-time">{timeAgo(a.at)}</span>
      </div>
      {a.type === 'follow' ? (
        followed ? (
          <span className="activity-row__following">Following</span>
        ) : (
          <button
            type="button"
            className="activity-row__follow"
            onClick={() => {
              setFollowed(true)
              follow.mutate()
            }}
          >
            Follow
          </button>
        )
      ) : (
        thumb && <img className="activity-row__thumb" src={thumb} alt="" />
      )}
    </div>
  )
}
