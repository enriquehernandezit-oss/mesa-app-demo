import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Body, Button, Caption, Eyebrow } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { useProfile } from '../../hooks/useProfile'
import { api } from '../../lib/api'
import { signOut } from '../../lib/auth-client'
import { displayScore } from '../../lib/display'
import type { BlockedUser, MeStats, SuggestedUser } from '../../lib/types'
import './tabs.css'
import './rankings.css'
import './profile.css'

// Resize a picked photo to a small square JPEG data URL for the avatar column.
async function fileToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const size = 192
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unsupported')
    const s = Math.max(size / img.width, size / img.height)
    ctx.drawImage(
      img,
      (size - img.width * s) / 2,
      (size - img.height * s) / 2,
      img.width * s,
      img.height * s,
    )
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// The user's own profile. M2 showed identity + sign out; M3 adds the doorway to
// other people's ranked passports (where reporting/blocking happen) and blocked-
// account management. In-app account deletion (App Store 5.1.1, cascading) is M5.
export function ProfileTab() {
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile

  const people = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ blocked: BlockedUser[] }>('/moderation/blocks'),
  })
  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })
  const unblock = useMutation({
    mutationFn: (userId: string) => api.del(`/moderation/blocks/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  })

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const setAvatar = useMutation({
    mutationFn: (image: string) => api.patch('/me/avatar', { image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })
  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setAvatar.mutate(await fileToAvatar(file))
    e.target.value = ''
  }

  // Invite — plain-text share; the link becomes real at launch.
  async function invite() {
    const text = 'Estoy en Mesa — donde mis amigos realmente comen 🥂 https://mesa.app'
    if (navigator.share) await navigator.share({ text }).catch(() => {})
    else await navigator.clipboard.writeText(text).catch(() => {})
  }

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
  }

  // In-app account deletion (App Store 5.1.1). DELETE /me cascades server-side;
  // then we drop the local session and reload to the sign-in screen.
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me'),
    onSuccess: async () => {
      await signOut().catch(() => {})
      queryClient.clear()
      window.location.href = '/'
    },
  })

  const blocked = blocks.data?.blocked ?? []

  return (
    <div>
      <div className="profile-hero">
        <button
          type="button"
          className="avatar-btn"
          onClick={() => fileInput.current?.click()}
          aria-label="Change photo"
        >
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={72} />
          <span className="avatar-btn__hint">{setAvatar.isPending ? '…' : '+ photo'}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPickAvatar}
        />
        <Eyebrow>{p?.neighborhood?.name ?? 'Santo Domingo'}</Eyebrow>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)' }}>
          {p?.name || 'You'}
        </div>
        {p?.handle && <Caption>@{p.handle}</Caption>}
        {p?.bio && <Body style={{ marginTop: 'var(--space-2)' }}>{p.bio}</Body>}
      </div>

      {/* Stats row — the numbers that make a profile feel real. */}
      {stats.data && (
        <div className="stats-row">
          <div className="stat">
            <span className="stat__n">{stats.data.places}</span>
            <span className="stat__l">places</span>
          </div>
          <div className="stat">
            <span className="stat__n">{stats.data.followers}</span>
            <span className="stat__l">followers</span>
          </div>
          <div className="stat">
            <span className="stat__n">{stats.data.following}</span>
            <span className="stat__l">following</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.streakWeeks > 0 ? `${stats.data.streakWeeks}w` : '—'}
            </span>
            <span className="stat__l">streak</span>
          </div>
        </div>
      )}

      {/* Taste Profile — what your list says about you. */}
      {stats.data && stats.data.places > 0 && (
        <div className="taste-card">
          <Eyebrow>Tu Taste Profile</Eyebrow>
          <div className="taste-card__rows">
            {stats.data.topCuisine && (
              <div className="taste-card__row">
                <span className="taste-card__k">Cocina favorita</span>
                <span className="taste-card__v">{stats.data.topCuisine}</span>
              </div>
            )}
            {stats.data.topNeighborhood && (
              <div className="taste-card__row">
                <span className="taste-card__k">Tu barrio</span>
                <span className="taste-card__v">{stats.data.topNeighborhood}</span>
              </div>
            )}
            {stats.data.avgScore != null && (
              <div className="taste-card__row">
                <span className="taste-card__k">Promedio</span>
                <span className="taste-card__v">{displayScore(stats.data.avgScore)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Button variant="secondary" onClick={invite}>
          Invite friends 🥂
        </Button>
        <Link to="/leaderboard" style={{ flex: 1 }}>
          <Button variant="secondary">Leaderboard</Button>
        </Link>
      </div>

      {/* People — the entry point to another person's ranked passport. */}
      <Eyebrow style={{ marginBottom: 'var(--space-3)' }}>People on Mesa</Eyebrow>
      {people.data?.users.map((u) => (
        <Link
          key={u.id}
          to="/u/$userId"
          params={{ userId: u.id }}
          className="saved-row"
          style={{ display: 'flex' }}
        >
          <div className="ranking-main">
            <div className="ranking-name" style={{ fontSize: '1.25rem' }}>
              {u.name || u.handle}
            </div>
            <div className="ranking-meta">
              {[u.handle ? `@${u.handle}` : null, u.neighborhood].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span className="link-action">View →</span>
        </Link>
      ))}

      {/* Blocked accounts management (App Store 1.2). */}
      {blocked.length > 0 && (
        <>
          <Eyebrow style={{ margin: 'var(--space-6) 0 var(--space-3)' }}>Blocked accounts</Eyebrow>
          {blocked.map((u) => (
            <div key={u.id} className="saved-row">
              <div className="ranking-main">
                <div className="ranking-name" style={{ fontSize: '1.25rem' }}>
                  {u.name || u.handle}
                </div>
                {u.handle && <Caption>@{u.handle}</Caption>}
              </div>
              <button
                type="button"
                className="link-action"
                onClick={() => unblock.mutate(u.id)}
                disabled={unblock.isPending}
              >
                Unblock
              </button>
            </div>
          ))}
        </>
      )}

      <div className="stack" style={{ marginTop: 'var(--space-7)' }}>
        <Button variant="secondary" onClick={handleSignOut}>
          Sign out
        </Button>
        <Caption style={{ textAlign: 'center' }}>
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/eula">EULA</a>
        </Caption>
      </div>

      {/* Danger zone — in-app account deletion (App Store 5.1.1). */}
      <div className="danger-zone">
        <Eyebrow style={{ color: 'var(--status-packed)' }}>Danger zone</Eyebrow>
        {!confirmingDelete ? (
          <>
            <Caption>
              Deleting your account permanently erases your rankings, notes, follows, and profile.
              This can't be undone.
            </Caption>
            <button type="button" className="danger-btn" onClick={() => setConfirmingDelete(true)}>
              Delete account
            </button>
          </>
        ) : (
          <>
            <Caption>Are you sure? This erases everything and can't be undone.</Caption>
            <div className="stack stack--tight">
              <button
                type="button"
                className="danger-btn danger-btn--solid"
                onClick={() => deleteAccount.mutate()}
                disabled={deleteAccount.isPending}
              >
                {deleteAccount.isPending ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
