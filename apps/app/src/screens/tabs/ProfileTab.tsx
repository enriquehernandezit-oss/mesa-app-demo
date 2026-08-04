import { useQueryClient } from '@tanstack/react-query'
import { Body, Button, Caption, Eyebrow } from '../../components/ui'
import { useProfile } from '../../hooks/useProfile'
import { signOut } from '../../lib/auth-client'
import './tabs.css'

// The user's own profile. M2 shows their identity and lets them sign out.
// In-app account deletion (App Store 5.1.1, cascading) is built in M5 and will
// live right here in settings.
export function ProfileTab() {
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile

  async function handleSignOut() {
    await signOut()
    // Drop cached authed data so the next user starts clean.
    queryClient.clear()
  }

  const initial = (p?.name || p?.handle || 'm').trim().charAt(0).toLowerCase()

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

      <div className="stack">
        <Button variant="secondary" onClick={handleSignOut}>
          Sign out
        </Button>
        <Caption style={{ textAlign: 'center' }}>
          Account deletion arrives with the final polish pass.
        </Caption>
      </div>
    </div>
  )
}
