import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Chip, ErrorState, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { useProfile } from '../../hooks/useProfile'
import { api } from '../../lib/api'
import { cloudinaryUrl } from '../../lib/media'
import { renderListCard, shareCard } from '../../lib/shareCard'
import type { Ranking, SavedPlace } from '../../lib/types'
import './tabs.css'
import './rankings.css'

// The ranked passport (M3). Mine = the ordered list with serif numerals, brass
// scores, and vibe notes. Want-to-try = saved places waiting to be ranked.
export function RankingsTab() {
  const [tab, setTab] = useState<'mine' | 'saved'>('mine')
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
        eyebrow: `${name}'s top ${top.length}`,
        subtitle: `${me?.profile.neighborhood?.name ?? 'Santo Domingo'} · Mesa`,
        items: top.map((r) => ({
          position: r.position,
          name: r.restaurant.name,
          score: r.score,
        })),
        coverUrl: first ? cloudinaryUrl(first.restaurant.coverImageId, { w: 1080, h: 780 }) : null,
      })
      await shareCard(blob, 'mesa-top.jpg', 'Mi ranking en Mesa 🥂')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div>
      <div className="tab-header">
        <Eyebrow>Your list</Eyebrow>
        <div className="rankings-title-row">
          <Title>Rankings</Title>
          {tab === 'mine' && (mine.data?.rankings.length ?? 0) > 0 && (
            <button type="button" className="share-pill" onClick={shareMyList} disabled={sharing}>
              {sharing ? '…' : '↗ Share'}
            </button>
          )}
        </div>
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
        ) : mine.isError ? (
          <ErrorState>Couldn't load your rankings.</ErrorState>
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

  const thumb = cloudinaryUrl(ranking.restaurant.coverImageId, { w: 160, h: 160 })
  return (
    <div className="ranking-row" style={{ gridTemplateColumns: 'auto auto 1fr auto' }}>
      <div className="ranking-numeral">{ranking.position}</div>
      {thumb ? (
        <img className="ranking-thumb" src={thumb} alt="" loading="lazy" />
      ) : (
        <div className="ranking-thumb" />
      )}
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
