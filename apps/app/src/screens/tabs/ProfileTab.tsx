import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import { Body, Button, Caption, Eyebrow } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { useProfile } from '../../hooks/useProfile'
import { api, apiOrigin } from '../../lib/api'
import { displayScore } from '../../lib/display'
import { resizeToJpeg } from '../../lib/image'
import type { MeStats, SuggestedUser } from '../../lib/types'
import './tabs.css'
import './rankings.css'
import './profile.css'

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
  const stats = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<MeStats>('/me/stats'),
  })

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
    if (file)
      setAvatar.mutate(await resizeToJpeg(file, { maxEdge: 192, square: true, quality: 0.8 }))
    e.target.value = ''
  }

  // Invite — plain-text share; the link becomes real at launch.
  async function invite() {
    const text = 'Estoy en Mesa — donde mis amigos realmente comen 🥂 https://mesa.app'
    if (navigator.share) await navigator.share({ text }).catch(() => {})
    else await navigator.clipboard.writeText(text).catch(() => {})
  }

  // Share my public passport (the /p/u/handle page).
  async function shareProfile() {
    const link = p?.handle ? `${apiOrigin}/p/u/${p.handle}` : apiOrigin
    if (navigator.share)
      await navigator.share({ text: `Mi ranking en Mesa 🥂\n${link}` }).catch(() => {})
    else await navigator.clipboard.writeText(link).catch(() => {})
  }

  return (
    <div>
      <div className="profile-settings-row">
        <Link to="/settings" className="link-action" aria-label="Settings">
          Settings ⚙
        </Link>
      </div>
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
            <span className="stat__n">{stats.data.followers}</span>
            <span className="stat__l">followers</span>
          </div>
          <div className="stat">
            <span className="stat__n">{stats.data.following}</span>
            <span className="stat__l">following</span>
          </div>
          <div className="stat">
            <span className="stat__n">
              {stats.data.rankInDr != null ? `#${stats.data.rankInDr}` : '—'}
            </span>
            <span className="stat__l">rank in DR</span>
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

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <Button variant="secondary" onClick={shareProfile}>
          Share profile
        </Button>
        <Button variant="secondary" onClick={invite}>
          Invite friends 🥂
        </Button>
      </div>

      {/* Your lists — the routes into the passport. */}
      <div className="profile-nav">
        <Link to="/rankings" className="profile-nav__row">
          <span>Ranked</span>
          <span className="profile-nav__meta">{stats.data?.places ?? 0} ›</span>
        </Link>
        <Link to="/rankings" search={{ tab: 'saved' }} className="profile-nav__row">
          <span>Want to try</span>
          <span className="profile-nav__meta">›</span>
        </Link>
        <Link to="/explore" className="profile-nav__row">
          <span>Recs for you</span>
          <span className="profile-nav__meta">›</span>
        </Link>
        <Link to="/leaderboard" className="profile-nav__row">
          <span>Leaderboard</span>
          <span className="profile-nav__meta">›</span>
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
    </div>
  )
}
