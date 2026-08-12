import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Body, Button, Caption, Eyebrow, SerifItalic, Wordmark } from '../components/ui'
import { authClient } from '../lib/auth-client'
import '../styles/screens.css'

// Sign-in. App Store 4.8: because Instagram login is offered, Sign in with Apple
// must appear alongside it with equal prominence — so all three providers are
// the same size and weight here. Phone works in every build; Apple/Instagram
// complete only when the server has their secrets (dev shows a soft message).
//
// The visible agreement line is the signup-time EULA/terms consent (App Store
// 1.2); acceptance is also recorded server-side when the profile is completed.

type Step = 'choose' | 'phone' | 'verify'

export function AuthFlow() {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('choose')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <Eyebrow>Invite only · Santo Domingo</Eyebrow>
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
            <Button variant="secondary" disabled={busy} onClick={() => setStep('phone')}>
              Use a phone number
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => oauth('instagram')}>
              Continue with Instagram
            </Button>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="legal-text">
            By continuing you agree to Mesa's <a href="/terms">Terms</a> and{' '}
            <a href="/eula">EULA</a>, and acknowledge our <a href="/privacy">Privacy Policy</a>.
          </div>
        </>
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
