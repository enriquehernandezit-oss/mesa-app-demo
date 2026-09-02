import { MesaTabBar } from '@/components/MesaTabBar'
import { RankFab } from '@/components/RankFab'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import { Redirect, Tabs } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { View } from 'react-native'

// The four-tab shell. Self-guards: if the session is lost or the account is
// ejected, redirect straight to sign-in (this is what makes sign-out reactive).
//
// The bar is the REAL UITabBar (expo-router's NativeTabs), so iOS gives us the
// things a JS bar can only imitate: the Liquid Glass material, the scroll-edge
// treatment, minimize-on-scroll, system re-press scroll-to-top, and badges.
// Mesa's identity rides through the props native chrome exposes — brass tint and
// the app's own UI face on the labels.
//
// NativeTabs is still an unstable API. `NATIVE_TABS` is the escape hatch: flip it
// to false and the shipped custom MesaTabBar comes back untouched, no other edit.
// (The custom bar carries its own center "+"; the native path floats RankFab
// instead, since a UITabBar can't host a non-tab item.)
const NATIVE_TABS = true

export default function TabsLayout() {
  const authLost = useAuthLost()
  const { data: session, isPending } = useSession()
  if (authLost) return <Redirect href="/sign-in" />
  if (!isPending && !session?.user) return <Redirect href="/sign-in" />
  return NATIVE_TABS ? <NativeShell /> : <CustomShell />
}

function NativeShell() {
  const theme = useResolvedTheme()
  const c = themeColors[theme]
  const unseen = useUnseenActivity()

  return (
    <View className="flex-1 bg-bg">
      <NativeTabs
        tintColor={c.accent}
        // Let the system paint its own material rather than forcing a solid
        // color: that's what gives the glass/scroll-edge behavior. The blur
        // variant follows Mesa's resolved theme, which can be dark while the OS
        // is light (Auto flips Candlelit at 6pm) — hence the explicit choice.
        blurEffect={
          theme === 'candlelit' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'
        }
        minimizeBehavior="onScrollDown"
        badgeBackgroundColor={c['status-packed']}
        badgeTextColor={c['on-accent']}
        labelStyle={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 }}
        iconColor={{ default: c['tab-inactive'], selected: c.accent }}
      >
        <NativeTabs.Trigger name="discover">
          <NativeTabs.Trigger.Icon sf={{ default: 'fork.knife', selected: 'fork.knife' }} />
          <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        {/* Deliberately NOT role="search": iOS 26 pins a search-role tab to a
            separated right-hand slot, which would sit under the floating FAB. */}
        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Explora</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="rankings">
          <NativeTabs.Trigger.Icon sf={{ default: 'list.number', selected: 'list.number' }} />
          <NativeTabs.Trigger.Label>Rankings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
          <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
          {/* No tab owns Activity, so its unseen count rides the account tab —
              the bell in the TopBar stays the primary entry point. */}
          {unseen > 0 ? (
            <NativeTabs.Trigger.Badge>
              {unseen > 9 ? '9+' : String(unseen)}
            </NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>
      </NativeTabs>
      <RankFab />
    </View>
  )
}

// The pre-native bar, kept whole behind NATIVE_TABS so a bad device report is a
// one-line revert rather than a re-port.
function CustomShell() {
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
