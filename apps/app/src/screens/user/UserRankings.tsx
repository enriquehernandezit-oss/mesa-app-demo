import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Caption, Chip, Eyebrow, SerifItalic } from '../../components/ui'
import { Characteristics } from '../../components/ui/patterns'
import { ApiError, api } from '../../lib/api'
import { displayScore } from '../../lib/display'
import type { Ranking, UserRankingsResponse } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../onboarding/friends.css'
import './moderation.css'

// Another person's ranked passport — and the surface where UGC moderation is
// exercised (App Store 1.2): report any vibe note, block the user. Blocking
// severs the graph and hides their content everywhere; the API 404s a blocked or
// banned user, so this view empties out.
const REASONS = ['Spam', 'Harassment', 'Inappropriate', 'Other'] as const

export function UserRankings() {
  const { userId } = useParams({ from: '/u/$userId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: ['user-rankings', userId],
    queryFn: () => api.get<UserRankingsResponse>(`/rankings/user/${userId}`),
    retry: false,
  })

  const block = useMutation({
    mutationFn: () => api.post('/moderation/blocks', { userId }),
    onSuccess: () => {
      // Their content is gone now — drop caches that could still show them.
      queryClient.invalidateQueries()
      navigate({ to: '/discover' })
    },
  })

  // Follow/unfollow. Optimistically flip the cached profile, and refresh the
  // feed since following changes what it shows.
  const follow = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post('/social/follow', { userId }) : api.del(`/social/follow/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-rankings', userId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  if (q.isPending) {
    return (
      <div className="tab-shell">
        <div className="tab-body">
          <Body>Loading…</Body>
        </div>
      </div>
    )
  }

  // Blocked / banned / missing → the API hides the user.
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404
    return (
      <div className="tab-shell">
        <div className="tab-body">
          <button
            type="button"
            className="link-action"
            onClick={() => navigate({ to: '/discover' })}
          >
            ← Back
          </button>
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>
              {gone ? 'This profile is unavailable.' : 'Could not load this profile.'}
            </SerifItalic>
          </div>
        </div>
      </div>
    )
  }

  const { user, rankings, isFollowing, followerCount, followingCount, matchPercent, sharedCount } =
    q.data
  return (
    <div className="tab-shell">
      <div className="tab-body">
        <button type="button" className="link-action" onClick={() => navigate({ to: '/discover' })}>
          ← Back
        </button>

        <div className="mod-header">
          <div>
            <Eyebrow>{user.neighborhood?.name ?? 'Santo Domingo'}</Eyebrow>
            <div
              style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)' }}
            >
              {user.name || user.handle}
            </div>
            {user.handle && <Caption>@{user.handle}</Caption>}
            <Caption style={{ marginTop: 'var(--space-2)' }}>
              {followerCount} followers · {followingCount} following
            </Caption>
            {matchPercent != null && (
              <span className="match-chip">
                +{matchPercent}% taste match · {sharedCount} en común
              </span>
            )}
          </div>
          <button
            type="button"
            className="mod-block-btn"
            onClick={() => block.mutate()}
            disabled={block.isPending}
          >
            Block
          </button>
        </div>

        <button
          type="button"
          className={`friend-follow${isFollowing ? ' friend-follow--on' : ''}`}
          style={{ alignSelf: 'flex-start', marginBottom: 'var(--space-5)' }}
          onClick={() => follow.mutate(!isFollowing)}
          disabled={follow.isPending}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>

        {rankings.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>No rankings yet.</SerifItalic>
          </div>
        ) : (
          rankings.map((r) => <TheirRow key={r.id} ranking={r} />)
        )}
      </div>
    </div>
  )
}

function TheirRow({ ranking }: { ranking: Ranking }) {
  return (
    <div className="ranking-row">
      <div className="ranking-numeral">{ranking.position}</div>
      <div className="ranking-main">
        <div className="ranking-name">{ranking.restaurant.name}</div>
        <Characteristics
          priceTier={ranking.restaurant.priceTier}
          cuisine={ranking.restaurant.cuisine}
          neighborhood={ranking.neighborhood}
        />
        {ranking.note && <div className="ranking-note">“{ranking.note}”</div>}
        {ranking.note && ranking.noteId && (
          <ReportControl targetType="vibe_note" targetId={ranking.noteId} />
        )}
      </div>
      <div className="ranking-score">{displayScore(ranking.score)}</div>
    </div>
  )
}

function ReportControl({
  targetType,
  targetId,
}: {
  targetType: 'vibe_note' | 'user'
  targetId: string
}) {
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType, targetId, reason }),
  })

  if (report.isSuccess) {
    return <div className="report-done">Reported. Thank you — we'll review it.</div>
  }

  return (
    <div className="ranking-actions">
      {!open ? (
        <button
          type="button"
          className="link-action link-action--danger"
          onClick={() => setOpen(true)}
        >
          Report
        </button>
      ) : (
        <div className="report-panel">
          <Caption>Why are you reporting this note?</Caption>
          <div className="report-reasons">
            {REASONS.map((reason) => (
              <Chip key={reason} onClick={() => report.mutate(reason)} state="default">
                {reason}
              </Chip>
            ))}
          </div>
          <button type="button" className="link-action" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
