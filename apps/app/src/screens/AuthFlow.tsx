import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '../components/ui'
import { authClient } from '../lib/auth-client'
import '../styles/screens.css'

// Sign-in. Four ways in: email + password (first-party), phone OTP, Apple, and
// Instagram. App Store 4.8: because Instagram login is offered, Sign in with
// Apple appears alongside it with equal prominence. Email/password and phone
// work in every build; Apple/Instagram complete only when the server has their
// secrets (dev shows a soft message).
//
// The visible agreement line is the signup-time EULA/terms consent (App Store
// 1.2); acceptance is also recorded server-side when the profile is completed.

type Step = 'choose' | 'email' | 'phone' | 'verify'

export function AuthFlow() {
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
  // Invite code — display affordance from the mock (G1). Mesa has no invite
  // backend, so any code soft-fails with a friendly, honest message.
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  // Forgot password — emails a link to /reset-password carrying a one-time token.
  // The response is intentionally the same whether or not the address exists, so
  // this never reveals whether an email is registered.
  async function sendReset() {
    setError(null)
    setBusy(true)
    await authClient.requestPasswordReset({ email: email.trim(), redirectTo: '/reset-password' })
    setBusy(false)
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
        res.error.message ??
          (emailMode === 'signup'
            ? 'No se pudo crear la cuenta.'
            : 'El correo o la contraseña están mal.'),
      )
    queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  async function oauth(provider: 'apple' | 'instagram') {
    setError(null)
    setBusy(true)
    try {
      if (provider === 'apple') {
        await authClient.signIn.social({ provider: 'apple', callbackURL: '/' })
      } else {
        await authClient.signIn.oauth2({ providerId: 'instagram', callbackURL: '/' })
      }
    } catch {
      setError(
        `El inicio de sesión con ${provider === 'apple' ? 'Apple' : 'Instagram'} no está disponible todavía en esta versión.`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function sendCode() {
    setError(null)
    setBusy(true)
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: phone })
    setBusy(false)
    if (error) return setError(error.message ?? 'No se pudo enviar el código.')
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
    if (error) return setError(error.message ?? 'Ese código no coincide.')
    // Session cookie is set — refresh the cached session so App re-gates.
    queryClient.invalidateQueries({ queryKey: ['session'] })
  }

  return (
    <div className="screen screen--center auth-screen">
      {/* Film-photo hero behind everything — the first thing anyone sees. */}
      <div className="auth-hero" aria-hidden />
      <div className="stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Wordmark size={64} />
        <Eyebrow style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-strong)' }}>
          Solo por invitación · Santo Domingo
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
            <Button
              variant="secondary"
              className="mesa-btn--mono"
              disabled={busy}
              onClick={() => setStep('phone')}
            >
              Usar un número de teléfono
            </Button>
            <Button
              variant="secondary"
              className="mesa-btn--mono"
              disabled={busy}
              onClick={() => oauth('instagram')}
            >
              Continuar con Instagram
            </Button>
          </div>
          {error && <div className="error-text">{error}</div>}

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

          {/* Invite code — display affordance; soft-fails (no invite backend). */}
          {inviteOpen ? (
            <div className="invite-row">
              <input
                className="field"
                placeholder="Código de invitación"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value)
                  setInviteMsg(null)
                }}
              />
              <Button
                variant="secondary"
                className="mesa-btn--mono"
                style={{ width: 'auto', padding: '0 var(--space-4)' }}
                onClick={() =>
                  setInviteMsg('Las invitaciones son personales — pídele una a un amigo en Mesa.')
                }
              >
                Enviar
              </Button>
            </div>
          ) : (
            <button type="button" className="invite-link" onClick={() => setInviteOpen(true)}>
              ¿Tienes un código de invitación? Ingrésalo
            </button>
          )}
          {inviteMsg && <div className="invite-msg">{inviteMsg}</div>}

          <div className="legal-text">
            Al continuar aceptas los <a href="/terms">Términos</a> y el <a href="/eula">EULA</a> de
            Mesa, y reconoces nuestra <a href="/privacy">Política de Privacidad</a>.
          </div>
        </>
      )}

      {step === 'email' && (
        <div className="stack">
          <Eyebrow>{emailMode === 'signup' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</Eyebrow>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field"
            type="password"
            autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="Contraseña (8+ caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            disabled={busy || !email.includes('@') || password.length < 8}
            onClick={emailAuth}
          >
            {busy ? '…' : emailMode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
          </Button>
          {error && <div className="error-text">{error}</div>}
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
          <Button variant="ghost" onClick={() => setStep('choose')}>
            Atrás
          </Button>
        </div>
      )}

      {step === 'phone' && (
        <div className="stack">
          <Eyebrow>Tu número</Eyebrow>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 809 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button disabled={busy || phone.trim().length < 8} onClick={sendCode}>
            Enviar código
          </Button>
          {error && <div className="error-text">{error}</div>}
          <Button variant="ghost" onClick={() => setStep('choose')}>
            Atrás
          </Button>
        </div>
      )}

      {step === 'verify' && (
        <div className="stack">
          <Eyebrow>Ingresa el código de 6 dígitos</Eyebrow>
          <Caption>Enviado a {phone}</Caption>
          <input
            className="field field--code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <Button disabled={busy || code.length !== 6} onClick={verify}>
            Verificar
          </Button>
          {error && <div className="error-text">{error}</div>}
          <Button variant="ghost" onClick={() => setStep('phone')}>
            Usar otro número
          </Button>
        </div>
      )}

      {step === 'choose' && (
        <Body style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Ranking + notas de vibe. Sin estrellas, nunca.
        </Body>
      )}
    </div>
  )
}
