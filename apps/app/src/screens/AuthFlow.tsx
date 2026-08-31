import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '../components/ui'
import { authClient, signOut } from '../lib/auth-client'
import { authErrorEs } from '../lib/authErrors'
import { clearAuthLost } from '../lib/authLost'
import '../styles/screens.css'

// Sign-in. Four ways in: email + password (first-party), phone OTP, Apple, and
// Instagram. App Store 4.8: because Instagram login is offered, Sign in with
// Apple appears alongside it with equal prominence. Email/password and phone
// work in every build; Apple/Instagram complete only when the server has their
// secrets (dev shows a soft message).
//
// The visible agreement line is the signup-time EULA/terms consent (App Store
// 1.2); acceptance is also recorded server-side when the profile is completed.

// Phone sign-in is off until an SMS provider is wired (the server also disables
// its routes). A visible button that cannot complete is worse than no button:
// the endpoint used to answer "code sent" for a code nobody would ever receive.
// Set VITE_PHONE_AUTH=1 alongside the server's SMS key to bring it back.
const PHONE_AUTH = import.meta.env.VITE_PHONE_AUTH === '1'

type Step = 'choose' | 'email' | 'phone' | 'verify'

// The shape the auth client uses for errors, for the one case it can't produce
// itself: the request never reached the server.
type AuthClientError = { code?: string; message?: string; status?: number }
const NETWORK_ERROR: AuthClientError = { message: 'network' }

export function AuthFlow({ suspended = false }: { suspended?: boolean }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('choose')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailMode, setEmailMode] = useState<'signup' | 'signin'>('signup')
  const [resetSent, setResetSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Forgot password — emails a link to /reset-password carrying a one-time token.
  // The response is intentionally the same whether or not the address exists, so
  // this never reveals whether an email is registered.
  async function sendReset() {
    setError(null)
    setBusy(true)
    // This had no error handling at all: the { error } return was discarded and
    // a rejection left busy stuck true, freezing the screen with no message.
    const res = await authClient
      .requestPasswordReset({ email: email.trim(), redirectTo: '/reset-password' })
      .catch(() => ({ error: NETWORK_ERROR }))
    setBusy(false)
    // Rate limiting is the one failure worth naming; anything else keeps the
    // same neutral answer, so this never reveals whether an address exists.
    if (res.error && (res.error as AuthClientError).status === 429) {
      return setError(authErrorEs(res.error))
    }
    setResetSent(true)
  }

  // Email + password — a first-party account. Sign-up mints the session and drops
  // the user into onboarding (name, optional handle, neighborhood, EULA); the
  // temp name from the local-part is overwritten there.
  async function emailAuth() {
    setError(null)
    setBusy(true)
    const addr = email.trim()
    const res =
      emailMode === 'signup'
        ? await authClient.signUp.email({ email: addr, password, name: addr.split('@')[0] ?? addr })
        : await authClient.signIn.email({ email: addr, password })
    setBusy(false)
    if (res.error)
      return setError(
        authErrorEs(
          res.error,
          emailMode === 'signup'
            ? 'No se pudo crear la cuenta.'
            : 'El correo o la contraseña no coinciden.',
        ),
      )
    queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  async function oauth(provider: 'apple' | 'instagram') {
    setError(null)
    setBusy(true)
    // The client RESOLVES with { error } rather than throwing, so the try/catch
    // this used to rely on could never fire and the return value was dropped —
    // with no provider configured the button was a silent no-op. Read the
    // result; keep a catch only for an actual network rejection.
    const res = await (provider === 'apple'
      ? authClient.signIn.social({ provider: 'apple', callbackURL: '/' })
      : authClient.signIn.oauth2({ providerId: 'instagram', callbackURL: '/' })
    ).catch(() => ({ error: NETWORK_ERROR }))
    setBusy(false)
    if (res && 'error' in res && res.error) {
      const name = provider === 'apple' ? 'Apple' : 'Instagram'
      setError(authErrorEs(res.error, `El inicio de sesión con ${name} aún no está disponible.`))
    }
  }

  async function sendCode() {
    setError(null)
    setBusy(true)
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: phone })
    setBusy(false)
    if (error) return setError(authErrorEs(error, 'No se pudo enviar el código.'))
    setStep('verify')
  }

  async function verify() {
    setError(null)
    setBusy(true)
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber: phone,
      code,
    })
    setBusy(false)
    if (error) return setError(authErrorEs(error, 'Ese código no coincide.'))
    // Session cookie is set — refresh the cached session so App re-gates.
    queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  // Ejected account (App Store 1.2). The server 403s every route, so there is
  // no app to return to — but the member is owed a reason rather than a splash
  // screen that never resolves, which is what this used to be.
  if (suspended) {
    return (
      <div className="screen screen--center auth-screen">
        <div className="auth-hero" aria-hidden />
        <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Wordmark size={64} />
          <Eyebrow style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-strong)' }}>
            Cuenta suspendida
          </Eyebrow>
          <SerifItalic
            style={{ fontSize: 'var(--text-title)', lineHeight: 1.15, marginTop: 'var(--space-2)' }}
          >
            Tu cuenta ya no está activa.
          </SerifItalic>
          <Body style={{ color: 'var(--text-2)', maxWidth: '19rem' }}>
            Suspendimos esta cuenta por incumplir las normas de la comunidad. Si crees que fue un
            error, responde al correo con el que te registraste.
          </Body>
        </div>
        <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
          <Button
            variant="secondary"
            className="mesa-btn--mono"
            onClick={async () => {
              await signOut().catch(() => {})
              clearAuthLost()
            }}
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen--center auth-screen">
      {/* Film-photo hero behind everything — the first thing anyone sees. */}
      <div className="auth-hero" aria-hidden />
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Wordmark size={64} />
        <Eyebrow style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-strong)' }}>
          Una revolución gastronómica social · Santo Domingo
        </Eyebrow>
        <SerifItalic
          style={{ fontSize: 'var(--text-title)', lineHeight: 1.15, marginTop: 'var(--space-2)' }}
        >
          Rankea donde comes. Confía en quien conoces.
        </SerifItalic>
        <Body style={{ color: 'var(--text-2)', maxWidth: '19rem' }}>
          Sin estrellas, sin desconocidos. Solo los números de tus amigos, en orden.
        </Body>
      </div>

      {step === 'choose' && (
        <>
          <div className="stack">
            {/* Apple-forward per the design; Instagram + phone stay available so
                Sign in with Apple is offered alongside social login (App Store 4.8). */}
            <Button disabled={busy} onClick={() => oauth('apple')}>
              Continuar con Apple
            </Button>
            <Button
              variant="secondary"
              className="mesa-btn--mono"
              disabled={busy}
              onClick={() => {
                setError(null)
                setStep('email')
              }}
            >
              Usar correo y contraseña
            </Button>
            {PHONE_AUTH && (
              <Button
                variant="secondary"
                className="mesa-btn--mono"
                disabled={busy}
                onClick={() => setStep('phone')}
              >
                Usar un número de teléfono
              </Button>
            )}
            <Button
              variant="secondary"
              className="mesa-btn--mono"
              disabled={busy}
              onClick={() => oauth('instagram')}
            >
              Continuar con Instagram
            </Button>
          </div>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            className="auth-toggle"
            disabled={busy}
            onClick={() => {
              setError(null)
              setEmailMode('signin')
              setStep('email')
            }}
          >
            ¿Ya estás en Mesa? Inicia sesión
          </button>

          <div className="legal-text">
            Al continuar aceptas los <a href="/terms">Términos</a> y el <a href="/eula">EULA</a> de
            Mesa, y reconoces nuestra <a href="/privacy">Política de Privacidad</a>.
          </div>
        </>
      )}

      {step === 'email' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && email.includes('@') && password.length >= 8) emailAuth()
          }}
        >
          <Eyebrow>{emailMode === 'signup' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</Eyebrow>
          <label className="sr-only" htmlFor="auth-email">
            Correo electrónico
          </label>
          <input
            id="auth-email"
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="sr-only" htmlFor="auth-password">
            Contraseña
          </label>
          <input
            id="auth-password"
            className="field"
            type="password"
            autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="Contraseña (8+ caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={emailMode === 'signup' ? 'auth-password-hint' : undefined}
          />
          {/* One honest line, not a strength meter: length is the only rule the
              server actually enforces today (minPasswordLength: 8). */}
          {emailMode === 'signup' && password.length > 0 && password.length < 8 && (
            <Caption id="auth-password-hint" style={{ color: 'var(--status-packed)' }}>
              Le faltan {8 - password.length} caracteres.
            </Caption>
          )}
          <Button
            type="submit"
            aria-busy={busy}
            disabled={busy || !email.includes('@') || password.length < 8}
          >
            {busy ? '…' : emailMode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
          </Button>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
          {resetSent ? (
            <Caption style={{ textAlign: 'center', color: 'var(--text-2)' }}>
              Si ese correo está registrado, te llegará un enlace para restablecerla.
            </Caption>
          ) : (
            emailMode === 'signin' && (
              <button
                type="button"
                className="auth-toggle"
                disabled={busy || !email.includes('@')}
                onClick={sendReset}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )
          )}
          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setEmailMode(emailMode === 'signup' ? 'signin' : 'signup')
              setError(null)
              setResetSent(false)
            }}
          >
            {emailMode === 'signup'
              ? '¿Ya tienes una cuenta? Inicia sesión'
              : '¿Nuevo aquí? Crea una cuenta'}
          </button>
          <Button type="button" variant="ghost" onClick={() => setStep('choose')}>
            Atrás
          </Button>
        </form>
      )}

      {step === 'phone' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && phone.trim().length >= 8) sendCode()
          }}
        >
          <Eyebrow>Tu número</Eyebrow>
          <label className="sr-only" htmlFor="auth-phone">
            Número de teléfono
          </label>
          <input
            id="auth-phone"
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 809 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" aria-busy={busy} disabled={busy || phone.trim().length < 8}>
            Enviar código
          </Button>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
          <Button type="button" variant="ghost" onClick={() => setStep('choose')}>
            Atrás
          </Button>
        </form>
      )}

      {step === 'verify' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && code.length === 6) verify()
          }}
        >
          <Eyebrow>Ingresa el código de 6 dígitos</Eyebrow>
          <Caption>Enviado a {phone}</Caption>
          <label className="sr-only" htmlFor="auth-code">
            Código de 6 dígitos
          </label>
          <input
            id="auth-code"
            className="field field--code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <Button type="submit" aria-busy={busy} disabled={busy || code.length !== 6}>
            Verificar
          </Button>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
          <Button type="button" variant="ghost" onClick={() => setStep('phone')}>
            Usar otro número
          </Button>
        </form>
      )}

      {step === 'choose' && (
        <Body style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Ranking + notas de vibe. Sin estrellas, nunca.
        </Body>
      )}
    </div>
  )
}
