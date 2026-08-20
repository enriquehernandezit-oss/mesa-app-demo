import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Chip, ErrorState, Eyebrow, SerifItalic, Title } from '../../components/ui'
import { Characteristics } from '../../components/ui/patterns'
import { useProfile } from '../../hooks/useProfile'
import { api, apiOrigin } from '../../lib/api'
import { displayScore } from '../../lib/display'
import { cloudinaryUrl } from '../../lib/media'
import { renderListCard, shareCard } from '../../lib/shareCard'
import type { MeStats, Ranking, SavedPlace } from '../../lib/types'
import './tabs.css'
import './rankings.css'

// The ranked passport (M3). Mine = the ordered list with serif numerals, brass
// scores, and vibe notes. Want-to-try = saved places waiting to be ranked.
export function RankingsTab() {
  const search = useSearch({ strict: false }) as { tab?: 'mine' | 'saved' | 'barrios' }
  const [tab, setTab] = useState<'mine' | 'saved' | 'barrios'>(search.tab ?? 'mine')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
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
  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })

  // Tags actually used in my list, for the filter row.
  const myTags = [...new Set((mine.data?.rankings ?? []).flatMap((r) => r.tags ?? []))]
  const visibleRankings = (mine.data?.rankings ?? []).filter(
    (r) => !tagFilter || (r.tags ?? []).includes(tagFilter),
  )

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
      const link = me?.profile.handle ? `${apiOrigin}/p/u/${me.profile.handle}` : apiOrigin
      await shareCard(blob, 'mesa-top.jpg', `Mi ranking en Mesa 🥂\n${link}`)
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

      {/* Stats header — places · average · streak. */}
      {stats.data && (
        <div className="stats-row">
          <div className="stat">
            <span className="stat__n">{stats.data.places}</span>
            <span className="stat__l">places</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.avgScore != null ? displayScore(stats.data.avgScore) : '—'}
            </span>
            <span className="stat__l">avg</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.streakWeeks > 0 ? `${stats.data.streakWeeks}w 🔥` : '—'}
            </span>
            <span className="stat__l">streak</span>
          </div>
        </div>
      )}

      <div className="rank-toggle">
        <Chip state={tab === 'mine' ? 'selected' : 'default'} onClick={() => setTab('mine')}>
          Mine
        </Chip>
        <Chip state={tab === 'saved' ? 'selected' : 'default'} onClick={() => setTab('saved')}>
          Want to try
        </Chip>
        <Chip state={tab === 'barrios' ? 'selected' : 'default'} onClick={() => setTab('barrios')}>
          Barrios
        </Chip>
      </div>

      {tab === 'mine' && myTags.length > 0 && (
        <div className="tag-row" style={{ marginBottom: 'var(--space-4)' }}>
          {myTags.map((t) => (
            <Chip
              key={t}
              size="sm"
              state={tagFilter === t ? 'selected' : 'default'}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              {t}
            </Chip>
          ))}
        </div>
      )}

      {tab === 'mine' &&
        (mine.isPending ? (
          <Body>Loading your list…</Body>
        ) : mine.isError ? (
          <ErrorState>Couldn't load your rankings.</ErrorState>
        ) : visibleRankings.length > 0 ? (
          visibleRankings.map((r) => <RankingRow key={r.id} ranking={r} />)
        ) : (
          <EmptyMine />
        ))}

      {tab === 'barrios' && <BarriosView rankings={mine.data?.rankings ?? []} />}

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
    </div>
  )
}

// Where you've eaten, by neighborhood — the organizational view.
function BarriosView({ rankings }: { rankings: Ranking[] }) {
  const byHood = new Map<string, { count: number; avg: number }>()
  for (const r of rankings) {
    const hood = r.neighborhood ?? 'Santo Domingo'
    const cur = byHood.get(hood) ?? { count: 0, avg: 0 }
    byHood.set(hood, { count: cur.count + 1, avg: cur.avg + r.score })
  }
  const hoods = [...byHood.entries()]
    .map(([name, v]) => ({ name, count: v.count, avg: v.avg / v.count }))
    .sort((a, b) => b.count - a.count)
  const max = hoods[0]?.count ?? 1

  if (hoods.length === 0) {
    return (
      <div className="tab-empty">
        <SerifItalic style={{ fontSize: '1.15rem' }}>Rank a few places first.</SerifItalic>
      </div>
    )
  }
  return (
    <div>
      {hoods.map((h) => (
        <div key={h.name} className="hood-row">
          <div className="hood-row__top">
            <span className="hood-row__name">{h.name}</span>
            <span className="hood-row__stats">
              {h.count} · avg {displayScore(h.avg)}
            </span>
          </div>
          <div className="hood-bar">
            <div className="hood-bar__fill" style={{ width: `${(h.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
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
  const [confirmingRemove, setConfirmingRemove] = useState(false)
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
        <Characteristics
          priceTier={ranking.restaurant.priceTier}
          cuisine={ranking.restaurant.cuisine}
          neighborhood={ranking.neighborhood}
        />

        {(ranking.favoriteDish || (ranking.tags?.length ?? 0) > 0) && !editing && (
          <div className="ranking-extras">
            {ranking.favoriteDish && (
              <span className="ranking-dish">Pide: {ranking.favoriteDish}</span>
            )}
            {(ranking.tags ?? []).map((t) => (
              <span key={t} className="mini-tag">
                {t}
              </span>
            ))}
          </div>
        )}
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
              {confirmingRemove ? (
                <>
                  <button
                    type="button"
                    className="link-action link-action--danger"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? 'Removing…' : 'Confirm remove'}
                  </button>
                  <button
                    type="button"
                    className="link-action"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={remove.isPending}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="link-action" onClick={() => setEditing(true)}>
                    {ranking.note ? 'Edit note' : 'Add note'}
                  </button>
                  <button
                    type="button"
                    className="link-action link-action--danger"
                    onClick={() => setConfirmingRemove(true)}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="ranking-score">{displayScore(ranking.score)}</div>
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
        <Characteristics
          priceTier={saved.restaurant.priceTier}
          cuisine={saved.restaurant.cuisine}
          neighborhood={saved.neighborhood}
        />
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
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  )
}
