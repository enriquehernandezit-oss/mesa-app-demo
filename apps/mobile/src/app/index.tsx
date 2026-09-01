import { Splash } from '@/components/Splash'
import { ErrorState } from '@/components/ui'
import { useProfile } from '@/hooks/useProfile'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { Redirect } from 'expo-router'
import { View } from 'react-native'

// Top-level gate, ported from apps/app/src/App.tsx. Resolves session + profile
// once and redirects to exactly one destination; each group also self-guards, so
// the app reacts when session state changes (sign-out, ejection) without
// imperative navigation.
export default function Index() {
  const { data: session, isPending: sessionLoading } = useSession()
  const authed = Boolean(session?.user)
  const { data: me, isPending: profileLoading, refetch } = useProfile(authed)
  const authLost = useAuthLost()

  if (authLost || (!sessionLoading && !authed)) return <Redirect href="/sign-in" />
  if (sessionLoading) return <Splash />
  if (profileLoading) return <Splash />
  if (!me)
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ErrorState onRetry={() => refetch()}>No pudimos cargar tu perfil.</ErrorState>
      </View>
    )
  if (!me.onboardingComplete) return <Redirect href="/onboarding" />
  return <Redirect href="/discover" />
}
