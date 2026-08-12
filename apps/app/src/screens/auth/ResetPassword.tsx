import { useState } from 'react'
import { Body, Button, Eyebrow, SerifItalic, Wordmark } from '../../components/ui'
import { authClient } from '../../lib/auth-client'
import '../../styles/screens.css'

// Public, signed-out page reached from the password-reset email. The one-time
// token rides in the query string (?token=…); this collects a new password and
// calls resetPassword. Resolved by pathname in App.tsx, before the auth gate —
// the same way legal pages are — so a logged-out user can complete it.
export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const goSignIn = () => {
    window.location.href = '/'
  }

  async function submit() {
    if (!token) return
    setError(null)
    setBusy(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)
    if (error) return setError(error.message ?? 'This link is invalid or has expired.')
    setDone(true)
  }

  return (
    <div className="screen screen--center auth-screen">
      <div className="auth-hero" aria-hidden />
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Wordmark size={56} />
        <Eyebrow>Reset password</Eyebrow>
      </div>

      {!token ? (
        <div className="stack">
          <SerifItalic style={{ fontSize: '1.2rem', textAlign: 'center' }}>
            This link is missing its token.
          </SerifItalic>
          <Body style={{ textAlign: 'center', color: 'var(--text-2)' }}>
            Request a new reset link from the sign-in screen.
          </Body>
          <Button onClick={goSignIn}>Back to sign in</Button>
        </div>
      ) : done ? (
        <div className="stack">
          <SerifItalic style={{ fontSize: '1.3rem', textAlign: 'center' }}>
            Password updated.
          </SerifItalic>
          <Button onClick={goSignIn}>Sign in</Button>
        </div>
      ) : (
        <div className="stack">
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            placeholder="New password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button disabled={busy || password.length < 8 || password !== confirm} onClick={submit}>
            {busy ? '…' : 'Set new password'}
          </Button>
          {password.length > 0 && confirm.length > 0 && password !== confirm && (
            <div className="error-text">Passwords don't match.</div>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  )
}
