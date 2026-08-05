import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { markActivitySeen } from '../../components/TopBar'
import { Body, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import type { ActivityItem } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import './activity.css'

// The screen behind the bell: cheers on your rankings, new followers, and
// friends ranking spots you saved. Opening it advances the seen-watermark.
export function ActivityScreen() {
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
  })

  useEffect(() => {
    markActivitySeen()
  }, [])

  const items = q.data?.activity ?? []

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

        {q.isPending ? (
          <Body>Loading…</Body>
        ) : items.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Quiet for now.</SerifItalic>
            <Body>Cheers, new followers, and friends trying your saved spots land here.</Body>
          </div>
        ) : (
          items.map((a) => (
            <div key={`${a.type}-${a.user.id}-${a.at}`} className="activity-row">
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
          ))
        )}
      </div>
    </div>
  )
}
