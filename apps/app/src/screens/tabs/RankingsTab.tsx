import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Chip, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { api } from '../../lib/api'
import type { Ranking, SavedPlace } from '../../lib/types'
import './tabs.css'
import './rankings.css'

// The ranked passport (M3). Mine = the ordered list with serif numerals, brass
// scores, and vibe notes. Want-to-try = saved places waiting to be ranked.
export function RankingsTab() {
  const [tab, setTab] = useState<'mine' | 'saved'>('mine')

  const mine = useQuery({
    queryKey: ['rankings'],
    queryFn: () => api.get<{ rankings: Ranking[] }>('/rankings'),
  })
  const saved = useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<{ saved: SavedPlace[] }>('/saved'),
    enabled: tab === 'saved',
  })

  return (
    <div>
      <div className="tab-header">
        <Eyebrow>Your list</Eyebrow>
        <Title>Rankings</Title>
      </div>

      <div className="rank-toggle">
        <Chip state={tab === 'mine' ? 'selected' : 'default'} onClick={() => setTab('mine')}>
          Mine
        </Chip>
        <Chip state={tab === 'saved' ? 'selected' : 'default'} onClick={() => setTab('saved')}>
          Want to try
        </Chip>
      </div>

      {tab === 'mine' &&
        (mine.isPending ? (
          <Body>Loading your list…</Body>
        ) : mine.data && mine.data.rankings.length > 0 ? (
          mine.data.rankings.map((r) => <RankingRow key={r.id} ranking={r} />)
        ) : (
          <EmptyMine />
        ))}

      {tab === 'saved' &&
        (saved.isPending ? (
          <Body>Loading…</Body>
        ) : saved.data && saved.data.saved.length > 0 ? (
          saved.data.saved.map((s) => <SavedRow key={s.restaurant.id} saved={s} />)
        ) : (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Nothing saved yet.</SerifItalic>
            <Body>Places you want to try will collect here.</Body>
          </div>
        ))}

      <Link to="/rank" className="fab">
        + Rank a place
      </Link>
    </div>
  )
}

function EmptyMine() {
  return (
    <div className="tab-empty">
      <SerifItalic style={{ fontSize: '1.15rem' }}>Your list is empty.</SerifItalic>
      <Body>Rank a place and it takes its spot in your passport.</Body>
    </div>
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
  })
  const remove = useMutation({
    mutationFn: () => api.del(`/rankings/${ranking.id}`),
    onSuccess: invalidate,
  })

  return (
    <div className="ranking-row">
      <div className="ranking-numeral">{ranking.position}</div>
      <div className="ranking-main">
        <div className="ranking-name">{ranking.restaurant.name}</div>
        <div className="ranking-meta">
          {[ranking.restaurant.cuisine, ranking.neighborhood].filter(Boolean).join(' · ')}
        </div>

        {editing ? (
          <>
            <textarea
              className="note-editor"
              maxLength={140}
              placeholder="One line on why…"
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
                Save
              </button>
              <button
                type="button"
                className="link-action"
                onClick={() => {
                  setDraft(ranking.note ?? '')
                  setEditing(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {ranking.note && <div className="ranking-note">“{ranking.note}”</div>}
            <div className="ranking-actions">
              <button type="button" className="link-action" onClick={() => setEditing(true)}>
                {ranking.note ? 'Edit note' : 'Add note'}
              </button>
              <button
                type="button"
                className="link-action link-action--danger"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </div>
      <div className="ranking-score">{Math.round(ranking.score)}</div>
    </div>
  )
}

function SavedRow({ saved }: { saved: SavedPlace }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/${saved.restaurant.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved'] }),
  })
  return (
    <div className="saved-row">
      <div className="ranking-main">
        <div className="ranking-name">{saved.restaurant.name}</div>
        <div className="ranking-meta">
          {[saved.restaurant.cuisine, saved.neighborhood].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flex: 'none' }}>
        <Button
          variant="secondary"
          style={{ width: 'auto', minHeight: 40, padding: '0 var(--space-4)' }}
          onClick={() => navigate({ to: '/rank', search: { restaurant: saved.restaurant.id } })}
        >
          Rank it
        </Button>
        <button
          type="button"
          className="link-action link-action--danger"
          onClick={() => remove.mutate()}
        >
          Remove
        </button>
      </div>
    </div>
  )
}
