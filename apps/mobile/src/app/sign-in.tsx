import { Splash } from '@/components/Splash'
import { ErrorState } from '@/components/ui'
import { useProfile } from '@/hooks/useProfile'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { AuthFlow } from '@/screens/AuthFlow'
import { Redirect } from 'expo-router'
import { View } from 'react-native'

// The unauthenticated surface. If a session becomes valid (after sign-in), the
// self-guard redirects onward — that's how AuthFlow's invalidate(['session'])
// leaves this screen without an imperative navigation.
export default function SignIn() {
  const authLost = useAuthLost()
  const { data: session } = useSession()
  const authed = Boolean(session?.user)
  const { data: me, isPending, refetch } = useProfile(authed && !authLost)

  if (authed && !authLost) {
    // A valid session with a slow or failed /me must never fall through to
    // AuthFlow below — that would show a signed-in member their own sign-in
    // form with no explanation. Mirror app/index.tsx's handling of the same
    // three states instead of just checking `me`.
    if (isPending) return <Splash />
    if (me && !me.onboardingComplete) return <Redirect href="/onboarding" />
    if (me) return <Redirect href="/discover" />
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ErrorState onRetry={() => refetch()}>No pudimos cargar tu perfil.</ErrorState>
      </View>
    )
  }
  return <AuthFlow suspended={authLost === 'account_suspended'} />
}
