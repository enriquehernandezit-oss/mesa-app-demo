import {
  CompassIcon,
  DiscoverIcon,
  PersonIcon,
  PlusIcon,
  RankingsIcon,
} from '@/components/ui/icons'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { tapLight, tapSelect } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { useColor } from '@/theme/useColor'
import { type Tabs, useRouter } from 'expo-router'

// The exact props expo-router's Tabs passes to a custom tabBar (it re-exports its
// own BottomTabBarProps, distinct from @react-navigation's).
type MesaTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]
import { useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Custom bottom bar: four tabs plus an inline "+" pill (rank a place), ported
// from app/router.tsx's 5-slot layout. Tonight is cut, so the tabs are
// Discover · Explore · (+) · Rankings · Profile.
//
// This is the SHIPPED bar (NATIVE_TABS = false in (tabs)/_layout.tsx), not a
// fallback: the native UITabBar (expo-router's NativeTabs) was tried first for
// the "+", but has no exposed way to render one item's icon at a larger point
// size than its siblings (confirmed against react-native-screens' full native
// prop list — only icon *color* is overridable, not size), and its
// "scroll edge" transparency needs an explicit opt-out that still left the bar
// reading as translucent on real hardware — see docs/NATIVE.md's tab bar row.
//
// The "+" itself is a flat inline pill, not a raised circle: a first pass
// raised it above the bar with a brass glow, styled after Instagram's classic
// overlay button, but next to the icons it read "mishapen," not like a
// current professional app. Threads, X and TikTok all sit their center action
// *in* the row — filled instead of outlined is what marks it as different,
// not elevation. Matching that meant boldening the other four icons too
// (strokeWidth 2 here only, vs the app-wide 1.6 default) so they hold their
// own next to a solid filled shape.
const ICONS: Record<string, typeof DiscoverIcon> = {
  discover: DiscoverIcon,
  explore: CompassIcon,
  rankings: RankingsIcon,
  profile: PersonIcon,
}
const LABEL_KEYS = {
  discover: 'tabs.feed',
  explore: 'tabs.explore',
  rankings: 'tabs.rankings',
  profile: 'tabs.profile',
} as const

const TAB_ICON_STROKE = 2
const PILL_WIDTH = 52
const PILL_HEIGHT = 34

function TabItem({
  routeName,
  focused,
  badge,
  onPress,
}: { routeName: string; focused: boolean; badge?: number; onPress: () => void }) {
  const t = useT()
  const Ico = ICONS[routeName]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      className="flex-1 items-center justify-center gap-[3px]"
    >
      <View>
        <Ico size={22} color={focused ? 'accent' : 'tab-inactive'} strokeWidth={TAB_ICON_STROKE} />
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
        {t(LABEL_KEYS[routeName as keyof typeof LABEL_KEYS])}
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
          if (!focused && !e.defaultPrevented) {
            tapSelect()
            navigation.navigate(order[idx].name)
          }
        }}
      />
    )
  }

  return (
    <View
      className="flex-row items-stretch justify-around border-t border-line bg-surface"
      // `minHeight` is the CONTENT area, on top of the bottom safe-area inset
      // it doesn't include — home-indicator devices have ~34pt there, which
      // was silently eating into the 56 total before (no paddingTop existed
      // at all), squeezing icon+label rows against the top edge until they
      // visibly clipped. Explicit paddingTop is the actual fix; the bumped
      // minHeight is just margin so a future taller item still fits.
      style={{
        minHeight: 64,
        paddingTop: 10,
        paddingBottom: insets.bottom,
        paddingHorizontal: 10,
      }}
    >
      {item('discover')}
      {item('explore')}
      <View className="flex-1 items-center justify-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rankear un spot"
          onPress={openRank}
          className="items-center justify-center rounded-pill active:scale-95"
          style={{ width: PILL_WIDTH, height: PILL_HEIGHT, backgroundColor: fabBg }}
        >
          <PlusIcon size={20} color="btn-primary-fg" />
        </Pressable>
      </View>
      {item('rankings')}
      {item('profile', unseen)}
    </View>
  )
}
