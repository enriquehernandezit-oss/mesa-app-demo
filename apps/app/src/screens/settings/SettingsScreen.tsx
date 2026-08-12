import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Caption, Eyebrow } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { ThemePicker } from '../../components/ui/ThemePicker'
import { useProfile } from '../../hooks/useProfile'
import { api } from '../../lib/api'
import { authClient, signOut } from '../../lib/auth-client'
import type { BlockedUser, Ranking } from '../../lib/types'
import '../tabs/tabs.css'
import '../tabs/profile.css'
import './settings.css'

// Settings (Phase 6) — the home for appearance, data, and account controls that
// used to sit loose at the bottom of Profile. Reached from the Profile gear; the
// legal copy points here ("Profile → settings"). Full-screen, no tab bar.
export function SettingsScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useProfile(true)
  const p = data?.profile

  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ blocked: BlockedUser[] }>('/moderation/blocks'),
  })
  const unblock = useMutation({
    mutationFn: (userId: string) => api.del(`/moderation/blocks/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  })
  const blocked = blocks.data?.blocked ?? []

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [verifySent, setVerifySent] = useState(false)

  // Real email only — phone-first accounts carry a placeholder inbox we never
  // surface or ask to verify.
  const realEmail = p?.email && !p.email.endsWith('@phone.mesa.local') ? p.email : null

  async function resendVerification() {
    if (!realEmail) return
    await authClient.sendVerificationEmail({ email: realEmail, callbackURL: '/' })
    setVerifySent(true)
  }

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
    window.location.href = '/'
  }

  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me'),
    onSuccess: async () => {
      await signOut().catch(() => {})
      queryClient.clear()
      window.location.href = '/'
    },
  })

  // Export — your ranked list as JSON, straight from the existing endpoint. No
  // new API; the data is yours to take.
  async function exportRankings() {
    if (exporting) return
    setExporting(true)
    try {
      const res = await api.get<{ rankings: Ranking[] }>('/rankings')
      const blob = new Blob([JSON.stringify(res.rankings, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mesa-rankings.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <button type="button" className="link-action" onClick={() => navigate({ to: '/profile' })}>
          ← Back
        </button>
        <div className="tab-header" style={{ marginTop: 'var(--space-3)' }}>
          <Eyebrow>Mesa</Eyebrow>
          <div className="settings-title">Settings</div>
        </div>

        {/* Identity row. */}
        <div className="settings-id">
          <Avatar name={p?.name || p?.handle || 'm'} src={p?.image} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="settings-id__name">{p?.name || 'You'}</div>
            {p?.handle && <Caption>@{p.handle}</Caption>}
          </div>
        </div>

        {/* Appearance. */}
        <Eyebrow className="settings-eyebrow">Appearance</Eyebrow>
        <ThemePicker />

        {/* Your list. */}
        <Eyebrow className="settings-eyebrow">Your list</Eyebrow>
        <div className="settings-group">
          <button
            type="button"
            className="settings-row settings-row--btn"
            onClick={exportRankings}
            disabled={exporting}
          >
            <span>Export my rankings</span>
            <span className="settings-row__meta">{exporting ? '…' : 'JSON ›'}</span>
          </button>
        </div>

        {/* Blocked accounts (App Store 1.2). */}
        {blocked.length > 0 && (
          <>
            <Eyebrow className="settings-eyebrow">Blocked accounts</Eyebrow>
            <div className="settings-group">
              {blocked.map((u) => (
                <div key={u.id} className="settings-row">
                  <span>{u.name || (u.handle ? `@${u.handle}` : 'Someone')}</span>
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
            </div>
          </>
        )}

        {/* Account. */}
        <Eyebrow className="settings-eyebrow">Account</Eyebrow>
        <div className="settings-group">
          {realEmail && (
            <div className="settings-row">
              <span className="settings-row__email">{realEmail}</span>
              {p?.emailVerified ? (
                <span className="settings-row__meta">Verified ✓</span>
              ) : verifySent ? (
                <span className="settings-row__meta">Link sent ›</span>
              ) : (
                <button type="button" className="link-action" onClick={resendVerification}>
                  Verify email
                </button>
              )}
            </div>
          )}
          <a className="settings-row settings-row--link" href="/privacy">
            <span>Privacy Policy</span>
            <span className="settings-row__meta">›</span>
          </a>
          <a className="settings-row settings-row--link" href="/terms">
            <span>Terms</span>
            <span className="settings-row__meta">›</span>
          </a>
          <a className="settings-row settings-row--link" href="/eula">
            <span>EULA</span>
            <span className="settings-row__meta">›</span>
          </a>
          <button
            type="button"
            className="settings-row settings-row--btn settings-row--accent"
            onClick={handleSignOut}
          >
            <span>Log out</span>
          </button>
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
              <button
                type="button"
                className="danger-btn"
                onClick={() => setConfirmingDelete(true)}
              >
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
    </div>
  )
}
