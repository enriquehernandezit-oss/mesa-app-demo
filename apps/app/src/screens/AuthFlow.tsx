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
            ? 'Could not create the account.'
            : 'That email or password is wrong.'),
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
        `${provider === 'apple' ? 'Apple' : 'Instagram'} sign-in isn't available in this build yet.`,
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
    if (error) return setError(error.message ?? 'Could not send the code.')
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
    if (error) return setError(error.message ?? 'That code did not match.')
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
          Invite only · Santo Domingo
        </Eyebrow>
        <SerifItalic style={{ fontSize: '1.5rem', lineHeight: 1.15, marginTop: 'var(--space-2)' }}>
          Rank where you eat. Trust who you know.
        </SerifItalic>
        <Body style={{ color: 'var(--text-2)', maxWidth: '19rem' }}>
          No stars, no strangers. Just your friends' numbers, in order.
        </Body>
      </div>

      {step === 'choose' && (
        <>
          <div className="stack">
            {/* Apple-forward per the design; Instagram + phone stay available so
                Sign in with Apple is offered alongside social login (App Store 4.8). */}
            <Button disabled={busy} onClick={() => oauth('apple')}>
              Continue with Apple
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
              Use email &amp; password
            </Button>
            <Button
              variant="secondary"
              className="mesa-btn--mono"
              disabled={busy}
              onClick={() => setStep('phone')}
            >
              Use a phone number
            </Button>
            <Button
              variant="secondary"
              className="mesa-btn--mono"
              disabled={busy}
              onClick={() => oauth('instagram')}
            >
              Continue with Instagram
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
            Already on Mesa? Sign in
          </button>

          {/* Invite code — display affordance; soft-fails (no invite backend). */}
          {inviteOpen ? (
            <div className="invite-row">
              <input
                className="field"
                placeholder="Invite code"
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
                  setInviteMsg('Invites are personal — ask a friend on Mesa to send you one.')
                }
              >
                Enter
              </Button>
            </div>
          ) : (
            <button type="button" className="invite-link" onClick={() => setInviteOpen(true)}>
              Have an invite code? Enter it
            </button>
          )}
          {inviteMsg && <div className="invite-msg">{inviteMsg}</div>}

          <div className="legal-text">
            By continuing you agree to Mesa's <a href="/terms">Terms</a> and{' '}
            <a href="/eula">EULA</a>, and acknowledge our <a href="/privacy">Privacy Policy</a>.
          </div>
        </>
      )}

      {step === 'email' && (
        <div className="stack">
          <Eyebrow>{emailMode === 'signup' ? 'Create your account' : 'Welcome back'}</Eyebrow>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field"
            type="password"
            autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            disabled={busy || !email.includes('@') || password.length < 8}
            onClick={emailAuth}
          >
            {busy ? '…' : emailMode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
          {error && <div className="error-text">{error}</div>}
          {resetSent ? (
            <Caption style={{ textAlign: 'center', color: 'var(--text-2)' }}>
              If that email is registered, a reset link is on its way.
            </Caption>
          ) : (
            emailMode === 'signin' && (
              <button
                type="button"
                className="auth-toggle"
                disabled={busy || !email.includes('@')}
                onClick={sendReset}
              >
                Forgot password?
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
              ? 'Already have an account? Sign in'
              : 'New here? Create an account'}
          </button>
          <Button variant="ghost" onClick={() => setStep('choose')}>
            Back
          </Button>
        </div>
      )}

      {step === 'phone' && (
        <div className="stack">
          <Eyebrow>Your number</Eyebrow>
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
            Send code
          </Button>
          {error && <div className="error-text">{error}</div>}
          <Button variant="ghost" onClick={() => setStep('choose')}>
            Back
          </Button>
        </div>
      )}

      {step === 'verify' && (
        <div className="stack">
          <Eyebrow>Enter the 6-digit code</Eyebrow>
          <Caption>Sent to {phone}</Caption>
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
            Verify
          </Button>
          {error && <div className="error-text">{error}</div>}
          <Button variant="ghost" onClick={() => setStep('phone')}>
            Use a different number
          </Button>
        </div>
      )}

      {step === 'choose' && (
        <Body style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Ranking + vibe notes. No stars, ever.
        </Body>
      )}
    </div>
  )
}
