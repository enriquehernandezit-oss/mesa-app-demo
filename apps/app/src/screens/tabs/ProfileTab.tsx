import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Button, Caption, Eyebrow } from '../../components/ui'
import { useProfile } from '../../hooks/useProfile'
import { api } from '../../lib/api'
import { signOut } from '../../lib/auth-client'
import type { BlockedUser, SuggestedUser } from '../../lib/types'
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
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ blocked: BlockedUser[] }>('/moderation/blocks'),
  })
  const unblock = useMutation({
    mutationFn: (userId: string) => api.del(`/moderation/blocks/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  })

  const [confirmingDelete, setConfirmingDelete] = useState(false)

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

  const initial = (p?.name || p?.handle || 'm').trim().charAt(0).toLowerCase()
  const blocked = blocks.data?.blocked ?? []

  return (
    <div>
      <div className="profile-hero">
        <div className="profile-avatar">{initial}</div>
        <Eyebrow>{p?.neighborhood?.name ?? 'Santo Domingo'}</Eyebrow>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--cream)' }}>
          {p?.name || 'You'}
        </div>
        {p?.handle && <Caption>@{p.handle}</Caption>}
        {p?.bio && <Body style={{ marginTop: 'var(--space-2)' }}>{p.bio}</Body>}
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
