import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
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
        <ScreenHeader onBack={() => navigate({ to: '/discover' })} backLabel="Atrás" />
        <div className="tab-header">
          <Eyebrow>Santo Domingo</Eyebrow>
          <Title>Clasificación</Title>
        </div>

        <div className="rank-toggle">
          <Chip
            state={period === 'month' ? 'selected' : 'default'}
            onClick={() => setPeriod('month')}
          >
            Este mes
          </Chip>
          <Chip state={period === 'all' ? 'selected' : 'default'} onClick={() => setPeriod('all')}>
            Todo el tiempo
          </Chip>
        </div>

        {q.data?.myRank && (
          <Body style={{ marginBottom: 'var(--space-4)', color: 'var(--accent)' }}>
            Eres #{q.data.myRank} en la ciudad.
          </Body>
        )}

        {q.isPending ? (
          <Body>Cargando…</Body>
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
                <span className="lb-meta">spots · prom. {displayScore(r.avgScore)}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
