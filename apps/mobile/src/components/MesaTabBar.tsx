import {
  CompassIcon,
  DiscoverIcon,
  PersonIcon,
  PlusIcon,
  RankingsIcon,
} from '@/components/ui/icons'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { tapLight } from '@/lib/haptics'
import { useColor } from '@/theme/useColor'
import { BRASS_SHADOW } from '@/theme/vars'
import { type Tabs, useRouter } from 'expo-router'

// The exact props expo-router's Tabs passes to a custom tabBar (it re-exports its
// own BottomTabBarProps, distinct from @react-navigation's).
type MesaTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]
import { useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Custom bottom bar: four tabs with a center "+" (rank a place) that breaks
// the bar's top edge, ported from app/router.tsx's 5-slot layout. Tonight is
// cut, so the tabs are Discover · Explore · (+) · Rankings · Profile.
//
// This is the SHIPPED bar (NATIVE_TABS = false in (tabs)/_layout.tsx), not a
// fallback: the native UITabBar (expo-router's NativeTabs) was tried first for
// the center "+", but has no exposed way to render one item's icon at a
// larger point size than its siblings (confirmed against react-native-screens'
// full native prop list — only icon *color* is overridable, not size), and its
// "scroll edge" transparency needs an explicit opt-out that still left the bar
// reading as translucent on real hardware. Instagram/TikTok's own raised
// center button is a plain overlay for exactly this reason — see
// docs/NATIVE.md's tab bar row.
const ICONS: Record<string, typeof DiscoverIcon> = {
  discover: DiscoverIcon,
  explore: CompassIcon,
  rankings: RankingsIcon,
  profile: PersonIcon,
}
const LABELS: Record<string, string> = {
  discover: 'Feed',
  explore: 'Explora',
  rankings: 'Rankings',
  profile: 'Perfil',
}

const FAB_SIZE = 56
const FAB_RAISE = 18

function TabItem({
  routeName,
  focused,
  badge,
  onPress,
}: { routeName: string; focused: boolean; badge?: number; onPress: () => void }) {
  const Ico = ICONS[routeName]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      className="flex-1 items-center justify-center gap-[3px]"
    >
      <View>
        <Ico size={22} color={focused ? 'accent' : 'tab-inactive'} />
        {badge ? (
          <View className="-top-1.5 -right-2.5 absolute min-w-[16px] items-center justify-center rounded-pill bg-status-packed px-1">
            <Text className="font-ui-semibold text-[10px] text-on-accent leading-[14px]">
              {badge > 9 ? '9+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        className={`font-ui-semibold text-micro ${focused ? 'text-accent' : 'text-tab-inactive'}`}
      >
        {LABELS[routeName]}
      </Text>
    </Pressable>
  )
}

export function MesaTabBar({ state, navigation }: MesaTabBarProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const fabBg = useColor('btn-primary-bg')
  const unseen = useUnseenActivity()
  const order = state.routes

  // Same re-entrancy guard as the native path's trigger listener: a few rapid
  // taps must open one rank flow, not stack several `/rank` instances that
  // then take repeated dismisses to actually get back to the tab underneath.
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

  const item = (name: string, badge?: number) => {
    const idx = order.findIndex((r) => r.name === name)
    const focused = state.index === idx
    return (
      <TabItem
        key={name}
        routeName={name}
        focused={focused}
        badge={badge}
        onPress={() => {
          const e = navigation.emit({
            type: 'tabPress',
            target: order[idx].key,
            canPreventDefault: true,
          })
          if (!focused && !e.defaultPrevented) navigation.navigate(order[idx].name)
        }}
      />
    )
  }

  return (
    <View
      className="flex-row items-stretch justify-around border-t border-line bg-surface"
      style={{ minHeight: 56, paddingBottom: insets.bottom, paddingHorizontal: 10 }}
    >
      {item('discover')}
      {item('explore')}
      <View className="flex-none items-center justify-center px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rankear un spot"
          onPress={openRank}
          className="items-center justify-center rounded-pill active:scale-95"
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            marginTop: -FAB_RAISE,
            backgroundColor: fabBg,
            shadowColor: BRASS_SHADOW,
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 3 },
            elevation: 6,
          }}
        >
          <PlusIcon size={26} color="btn-primary-fg" />
        </Pressable>
      </View>
      {item('rankings')}
      {item('profile', unseen)}
    </View>
  )
}
