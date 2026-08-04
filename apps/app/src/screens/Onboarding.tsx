import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Eyebrow } from '../components/ui'
import { FriendsStep } from './onboarding/FriendsStep'
import { ProfileStep } from './onboarding/ProfileStep'
import { RankStep } from './onboarding/RankStep'
import '../styles/screens.css'

// Cold-start fix — the #1 product risk is an empty first open, so onboarding is
// first-class. A new profile leaves this flow with an identity, a starter
// ranking, and at least a few friends: never empty, never friendless.
//
// The flow owns its own step state and does NOT invalidate ['me'] between steps.
// If it did, the moment the ranking step wrote its rows the top-level gate would
// see onboardingComplete flip true and yank the user into the tab shell before
// friend-find. We refresh ['me'] exactly once, at the end.

const STEPS = ['profile', 'rank', 'friends'] as const
type Step = (typeof STEPS)[number]

export function Onboarding() {
  const [step, setStep] = useState<Step>('profile')
  const queryClient = useQueryClient()

  function finish() {
    // Now the gate re-reads: profile + ranking + eula are all set → tab shell.
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center' }}>
        <Eyebrow>Welcome to Mesa</Eyebrow>
        <div className="progress-dots" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} data-active={i <= stepIndex} />
          ))}
        </div>
      </div>

      {step === 'profile' && <ProfileStep onNext={() => setStep('rank')} />}
      {step === 'rank' && <RankStep onNext={() => setStep('friends')} />}
      {step === 'friends' && <FriendsStep onFinish={finish} />}
    </div>
  )
}
