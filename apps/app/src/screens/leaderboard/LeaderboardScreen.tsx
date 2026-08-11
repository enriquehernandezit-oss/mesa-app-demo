import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Chip, Eyebrow, Title } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { api } from '../../lib/api'
import { displayScore } from '../../lib/display'
import type { LeaderboardRow } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import './leaderboard.css'

// Citywide leaderboard — who's eaten the most of Santo Domingo. Understated by
// design: brass serif numerals, no badges, the brand's version of gamification.
export function LeaderboardScreen() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'all' | 'month'>('month')
  const q = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () =>
      api.get<{ leaderboard: LeaderboardRow[]; myRank: number | null }>(
        `/leaderboard?period=${period}`,
      ),
  })

  const rows = q.data?.leaderboard ?? []

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <button type="button" className="link-action" onClick={() => navigate({ to: '/discover' })}>
          ← Back
        </button>
        <div className="tab-header" style={{ marginTop: 'var(--space-3)' }}>
          <Eyebrow>Santo Domingo</Eyebrow>
          <Title>Leaderboard</Title>
        </div>

        <div className="rank-toggle">
          <Chip
            state={period === 'month' ? 'selected' : 'default'}
            onClick={() => setPeriod('month')}
          >
            This month
          </Chip>
          <Chip state={period === 'all' ? 'selected' : 'default'} onClick={() => setPeriod('all')}>
            All time
          </Chip>
        </div>

        {q.data?.myRank && (
          <Body style={{ marginBottom: 'var(--space-4)', color: 'var(--accent)' }}>
            You're #{q.data.myRank} in the city.
          </Body>
        )}

        {q.isPending ? (
          <Body>Loading…</Body>
        ) : (
          rows.map((r, i) => (
            <Link
              key={r.id}
              to="/u/$userId"
              params={{ userId: r.id }}
              className="lb-row"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <span className="lb-pos">{i + 1}</span>
              <Avatar name={r.name || r.handle || 'm'} src={r.image} size={38} />
              <div className="lb-main">
                <span className="lb-name">{r.name || r.handle}</span>
                <span className="lb-meta">
                  {[r.handle ? `@${r.handle}` : null, r.neighborhood].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="lb-stats">
                <span className="lb-count">{r.count}</span>
                <span className="lb-meta">spots · avg {displayScore(r.avgScore)}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
