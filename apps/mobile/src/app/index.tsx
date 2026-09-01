import { Splash } from '@/components/Splash'
import { Body, Button, Caption, ErrorState, Wordmark } from '@/components/ui'
import { useProfile } from '@/hooks/useProfile'
import { signOut, useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { AuthFlow } from '@/screens/AuthFlow'
import { useTheme } from '@/theme/ThemeProvider'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Top-level gate, ported from apps/app/src/App.tsx. Resolves session + profile
// and hands off to exactly one destination. The onboarding flow and the tab
// shell arrive in N3; for now those branches render a stub so the whole email
// loop + gate + suspended/authLost paths are verifiable end-to-end.
export default function Index() {
  const { resolved } = useTheme()
  const { data: session, isPending: sessionLoading } = useSession()
  const authed = Boolean(session?.user)
  const { data: me, isPending: profileLoading, refetch: refetchMe } = useProfile(authed)
  const authLost = useAuthLost()

  let body: React.ReactNode
  if (authLost === 'account_suspended') body = <AuthFlow suspended />
  else if (sessionLoading) body = <Splash />
  else if (!authed) body = <AuthFlow />
  else if (profileLoading) body = <Splash />
  else if (!me)
    body = (
      <View className="flex-1 items-center justify-center bg-bg">
        <ErrorState onRetry={() => refetchMe()}>No pudimos cargar tu perfil.</ErrorState>
      </View>
    )
  else body = <SignedInStub email={me.profile.email} onboarded={me.onboardingComplete} />

  return (
    <>
      <StatusBar style={resolved === 'candlelit' ? 'light' : 'dark'} />
      {body}
    </>
  )
}

// Placeholder for the N3 onboarding stack + tab shell — proves we reached the
// authed state and can sign back out.
function SignedInStub({ email, onboarded }: { email: string | null; onboarded: boolean }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-4 px-5">
        <Wordmark size={56} />
        <Body className="text-center">Sesión iniciada · {email ?? 'sin correo'}</Body>
        <Caption className="text-center">
          {onboarded ? 'Perfil completo → las tabs llegan en N3' : 'Falta onboarding → llega en N3'}
        </Caption>
        <View className="mt-4 w-full">
          <Button variant="secondary" onPress={() => signOut()}>
            Cerrar sesión
          </Button>
        </View>
      </View>
    </SafeAreaView>
  )
}
