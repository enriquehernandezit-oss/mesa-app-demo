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
    if (error) return setError(error.message ?? 'Este enlace no es válido o ya venció.')
    setDone(true)
  }

  return (
    <div className="screen screen--center auth-screen">
      <div className="auth-hero" aria-hidden />
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Wordmark size={56} />
        <Eyebrow>Restablecer contraseña</Eyebrow>
      </div>

      {!token ? (
        <div className="stack">
          <SerifItalic style={{ fontSize: 'var(--text-serif-sm)', textAlign: 'center' }}>
            A este enlace le falta el token.
          </SerifItalic>
          <Body style={{ textAlign: 'center', color: 'var(--text-2)' }}>
            Pide un nuevo enlace desde la pantalla de inicio de sesión.
          </Body>
          <Button onClick={goSignIn}>Volver a iniciar sesión</Button>
        </div>
      ) : done ? (
        <div className="stack">
          <SerifItalic style={{ fontSize: 'var(--text-serif-md)', textAlign: 'center' }}>
            Contraseña actualizada.
          </SerifItalic>
          <Button onClick={goSignIn}>Iniciar sesión</Button>
        </div>
      ) : (
        <div className="stack">
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña (8+ caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            placeholder="Confirma la nueva contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button disabled={busy || password.length < 8 || password !== confirm} onClick={submit}>
            {busy ? '…' : 'Guardar nueva contraseña'}
          </Button>
          {password.length > 0 && confirm.length > 0 && password !== confirm && (
            <div className="error-text">Las contraseñas no coinciden.</div>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  )
}
