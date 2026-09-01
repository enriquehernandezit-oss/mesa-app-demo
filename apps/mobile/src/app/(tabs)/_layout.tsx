import { MesaTabBar } from '@/components/MesaTabBar'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { Redirect, Tabs } from 'expo-router'
import { View } from 'react-native'

// The four-tab shell. Self-guards: if the session is lost or the account is
// ejected, redirect straight to sign-in (this is what makes sign-out reactive).
export default function TabsLayout() {
  const authLost = useAuthLost()
  const { data: session, isPending } = useSession()
  if (authLost) return <Redirect href="/sign-in" />
  if (!isPending && !session?.user) return <Redirect href="/sign-in" />
  return (
    <View className="flex-1 bg-bg">
      <Tabs
        tabBar={(props) => <MesaTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        <Tabs.Screen name="discover" />
        <Tabs.Screen name="explore" />
        <Tabs.Screen name="rankings" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </View>
  )
}
