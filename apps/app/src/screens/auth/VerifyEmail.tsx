import { useEffect, useState } from 'react'
import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '../../components/ui'
import { authClient } from '../../lib/auth-client'
import { authErrorEs } from '../../lib/authErrors'
import '../../styles/screens.css'

// Public, signed-out page reached from the verification email.
//
// Better Auth's link previously pointed straight at the API's verify endpoint,
// so confirming an address dumped the member on a bare redirect with nothing
// telling them it worked. Resolved by pathname in App.tsx BEFORE the auth gate,
// the same way /reset-password is — the link is very often opened on a
// different device from the one that signed up, where there is no session.
//
// The token rides in ?token=. On success Better Auth signs the member in
// (autoSignInAfterVerification), so the only thing left to do is send them into
// the app.
type State = 'verifying' | 'done' | 'expired' | 'missing'

export function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get('token')
  const [state, setState] = useState<State>(token ? 'verifying' : 'missing')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    authClient
      .verifyEmail({ query: { token } })
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(authErrorEs(res.error, 'Ese enlace ya no sirve.'))
          setState('expired')
          return
        }
        setState('done')
      })
      .catch(() => {
        if (cancelled) return
        setError('No pudimos conectar. Intenta de nuevo.')
        setState('expired')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const enter = () => {
    // A hard navigation, not a router push: the session was just created, and
    // this page renders outside the app's gate.
    window.location.href = '/'
  }

  return (
    <div className="screen screen--center auth-screen">
      <div className="auth-hero" aria-hidden />
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Wordmark size={64} />
        <Eyebrow style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-strong)' }}>
          {state === 'done' ? 'Correo confirmado' : 'Confirma tu correo'}
        </Eyebrow>

        {state === 'verifying' && <Caption>Confirmando…</Caption>}

        {state === 'done' && (
          <>
            <SerifItalic
              style={{
                fontSize: 'var(--text-title)',
                lineHeight: 1.15,
                marginTop: 'var(--space-2)',
              }}
            >
              Listo. Tu correo quedó confirmado.
            </SerifItalic>
            <Body style={{ color: 'var(--text-2)', maxWidth: '19rem' }}>
              Ya puedes rankear, escribir notas y agregar platos.
            </Body>
          </>
        )}

        {(state === 'expired' || state === 'missing') && (
          <>
            <SerifItalic
              style={{
                fontSize: 'var(--text-title)',
                lineHeight: 1.15,
                marginTop: 'var(--space-2)',
              }}
            >
              {state === 'missing' ? 'A este enlace le falta el token.' : 'Ese enlace ya no sirve.'}
            </SerifItalic>
            <Body style={{ color: 'var(--text-2)', maxWidth: '19rem' }}>
              Entra a Mesa y pide uno nuevo desde Ajustes — los enlaces vencen por seguridad.
            </Body>
            {error && (
              <div className="error-text" role="alert">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
        <Button onClick={enter}>{state === 'done' ? 'Entrar a Mesa' : 'Ir a Mesa'}</Button>
      </div>
    </div>
  )
}
