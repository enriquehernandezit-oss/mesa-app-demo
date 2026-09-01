import { useProfile } from '@/hooks/useProfile'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { AuthFlow } from '@/screens/AuthFlow'
import { Redirect } from 'expo-router'

// The unauthenticated surface. If a session becomes valid (after sign-in), the
// self-guard redirects onward — that's how AuthFlow's invalidate(['session'])
// leaves this screen without an imperative navigation.
export default function SignIn() {
  const authLost = useAuthLost()
  const { data: session } = useSession()
  const authed = Boolean(session?.user)
  const { data: me } = useProfile(authed && !authLost)

  if (authed && !authLost) {
    if (me && !me.onboardingComplete) return <Redirect href="/onboarding" />
    if (me) return <Redirect href="/discover" />
  }
  return <AuthFlow suspended={authLost === 'account_suspended'} />
}
