import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Caption, Chip, SectionHeader, SerifItalic } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics } from '../../components/ui/patterns'
import { ApiError, api } from '../../lib/api'
import { displayScore } from '../../lib/display'
import type { Ranking, UserRankingsResponse } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../onboarding/friends.css'
import './moderation.css'

// Another person's ranked passport (mock E2) — and the surface where UGC
// moderation is exercised (App Store 1.2): report a vibe note or the user, block
// them. Blocking severs the graph and hides their content; the API 404s a blocked
// user, so this view empties out.
const REASONS = ['Spam', 'Harassment', 'Inappropriate', 'Other'] as const

export function UserRankings() {
  const { userId } = useParams({ from: '/u/$userId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const q = useQuery({
    queryKey: ['user-rankings', userId],
    queryFn: () => api.get<UserRankingsResponse>(`/rankings/user/${userId}`),
    retry: false,
  })

  const block = useMutation({
    mutationFn: () => api.post('/moderation/blocks', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate({ to: '/discover' })
    },
  })
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
            ‹ Back
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

  const { user, rankings, isFollowing, matchPercent } = q.data
  const firstName = (user.name || user.handle || '').split(' ')[0] || 'Their'
  const barrio = user.neighborhood?.name
  const shown = expanded ? rankings : rankings.slice(0, 4)

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <div className="user-headbar">
          <button
            type="button"
            className="link-action"
            onClick={() => navigate({ to: '/discover' })}
          >
            ‹ {user.name || user.handle}
          </button>
          <div className="user-menu-wrap">
            <button
              type="button"
              className="user-menu-btn"
              aria-label="More"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="user-menu">
                <button type="button" onClick={() => setReporting(true)}>
                  Report
                </button>
                <button
                  type="button"
                  className="user-menu__danger"
                  onClick={() => block.mutate()}
                  disabled={block.isPending}
                >
                  Block
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="user-identity">
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={88} />
          {user.handle && <div className="user-identity__handle">@{user.handle}</div>}
          <div className="user-identity__meta">
            {[`${rankings.length} ranked`, barrio].filter(Boolean).join(' · ')}
          </div>
          {matchPercent != null && <span className="match-chip">+{matchPercent}% taste match</span>}
          <div className="user-actions">
            <Button
              variant="primary"
              style={{ width: 'auto', minHeight: 44, padding: '0 var(--space-6)' }}
              onClick={() => follow.mutate(!isFollowing)}
              disabled={follow.isPending}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
            <button type="button" className="user-message" data-stale aria-disabled>
              Message
            </button>
          </div>
        </div>

        {reporting && (
          <ReportUser
            userId={userId}
            onDone={() => {
              setReporting(false)
              setMenuOpen(false)
            }}
          />
        )}

        {rankings.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>No rankings yet.</SerifItalic>
          </div>
        ) : (
          <>
            <SectionHeader action={<span>All {rankings.length}</span>}>
              {firstName}'s top places
            </SectionHeader>
            {shown.map((r) => (
              <TheirRow key={r.id} ranking={r} />
            ))}
            {rankings.length > 4 && (
              <button type="button" className="resto-seeall" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show fewer' : `See all ${rankings.length} ›`}
              </button>
            )}
          </>
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

// Report the whole user (from the ⋯ menu) — targetType 'user'.
function ReportUser({ userId, onDone }: { userId: string; onDone: () => void }) {
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'user', targetId: userId, reason }),
    onSuccess: onDone,
  })
  return (
    <div className="report-panel">
      <Caption>Why are you reporting this person?</Caption>
      <div className="report-reasons">
        {REASONS.map((reason) => (
          <Chip key={reason} onClick={() => report.mutate(reason)} state="default">
            {reason}
          </Chip>
        ))}
      </div>
      <button type="button" className="link-action" onClick={onDone}>
        Cancel
      </button>
    </div>
  )
}

function ReportControl({
  targetType,
  targetId,
}: { targetType: 'vibe_note' | 'user'; targetId: string }) {
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
