import { MesaTabBar } from '@/components/MesaTabBar'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { useSession } from '@/lib/auth-client'
import { useAuthLost } from '@/lib/authLost'
import { tapLight } from '@/lib/haptics'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import { Redirect, Tabs, useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useRef } from 'react'
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
// (The custom bar's own center "+" already matches this one — see the `add`
// trigger below for how the native path does the same thing.)
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
  const router = useRouter()

  // The center item is a `disabled` trigger, not a real destination: iOS still
  // renders it normally (react-native-screens blocks selection at the native
  // layer via `preventNativeSelection`, it does NOT grey the item out via
  // `UITabBarItem.isEnabled`), and expo-router still emits `tabPress` with
  // `isPrevented: true` to this listener — so tapping it opens the rank sheet
  // without ever becoming the selected tab or losing the one underneath.
  //
  // Guarded like dishPhoto.ts's `picking` flag: a few rapid taps each fire
  // their own `tabPress` (this isn't a single Pressable expo-router debounces),
  // so without a guard each one pushes its own `/rank` instance and they stack
  // — dismissing one just reveals the next underneath instead of the tab bar.
  const openingRank = useRef(false)
  const openRank = () => {
    if (openingRank.current) return
    openingRank.current = true
    tapLight()
    router.push('/rank')
    setTimeout(() => {
      openingRank.current = false
    }, 1000)
  }

  return (
    <View className="flex-1 bg-bg">
      <NativeTabs
        tintColor={c.accent}
        // A solid bar, not the system's translucent material: the glass/blur
        // read as "invisible" against Mesa's content, especially Candlelit's
        // dark ground. Same c.bg the utility header bars already use, so the
        // tab bar and a pushed screen's nav bar are the same solid chrome.
        backgroundColor={c.bg}
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

        {/* Deliberately NOT role="search": iOS 26 pins a search-role tab to its
            own separated right-hand slot, which would break the 2-1-2 symmetry
            around the center "+" below. */}
        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Explora</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        {/* Instagram-style center action: a filled glyph (the app's one filled
            icon among outline ones) marks it as a different kind of item —
            an action, not a destination. Blank-but-not-empty <Label> (a
            single space): omitting <Label> entirely falls back to the route
            name ("add"), and an empty string title still rendered "add" too
            — react-native-screens' native bottom-tabs treats a falsy title
            as unset and substitutes the route name at the UIKit layer, below
            where expo-router's JS fallback could catch it. A space is a
            genuinely blank, truthy title, so it survives to native and lets
            UITabBarItem re-center/enlarge the icon into the label's space —
            the actual Instagram treatment; a real title would make it look
            like a fifth ordinary tab. VoiceOver still gets the right name via
            accessibilityLabel below. `add` is its own route name so it
            doesn't collide with `app/rank.tsx`'s `/rank`; the route itself is
            an inert placeholder that's never shown (see app/(tabs)/add.tsx). */}
        <NativeTabs.Trigger
          name="add"
          disabled
          accessibilityLabel="Rankear un spot"
          listeners={{ tabPress: openRank }}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: 'plus.circle.fill', selected: 'plus.circle.fill' }}
          />
          <NativeTabs.Trigger.Label> </NativeTabs.Trigger.Label>
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
