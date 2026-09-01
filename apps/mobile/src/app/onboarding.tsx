import { Body, Button, Eyebrow, Wordmark } from '@/components/ui'
import { useProfile } from '@/hooks/useProfile'
import { signOut, useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// N3 stub. The real onboarding flow (profile → rank → friends) is a later phase;
// for now it self-guards and offers a way back out.
export default function Onboarding() {
  const authLost = useAuthLost()
  const { data: session, isPending } = useSession()
  const authed = Boolean(session?.user)
  const { data: me } = useProfile(authed && !authLost)
  if (authLost || (!isPending && !authed)) return <Redirect href="/sign-in" />
  if (me?.onboardingComplete) return <Redirect href="/discover" />
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-4 px-5">
        <Wordmark size={56} />
        <Eyebrow className="font-mono text-accent-strong">Casi listo</Eyebrow>
        <Body className="max-w-[19rem] text-center">
          El onboarding (perfil · rankea · amigos) llega en una fase próxima.
        </Body>
        <View className="mt-4 w-full">
          <Button variant="secondary" onPress={() => signOut()}>
            Cerrar sesión
          </Button>
        </View>
      </View>
    </SafeAreaView>
  )
}
