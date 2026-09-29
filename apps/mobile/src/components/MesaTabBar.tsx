import { type Tabs, useRouter } from 'expo-router'
import { useRef } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Glass } from '@/components/ui/Glass'
import {
  CompassIcon,
  DiscoverIcon,
  PersonIcon,
  PlusIcon,
  RankingsIcon,
} from '@/components/ui/icons'
import { tapLight, tapSelect } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { useLift } from '@/theme/useLift'

// The exact props expo-router's Tabs passes to a custom tabBar (it re-exports its
// own BottomTabBarProps, distinct from @react-navigation's).
type MesaTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

// The floating capsule's geometry (docs/DESIGN.md): inset 18 from each side, 66pt
// tall, its bottom edge sitting a little INSIDE the home-indicator inset so it reads
// as floating rather than docked.
const BAR_HEIGHT = 66
const BAR_INSET = 18
const barBottom = (insetBottom: number) => Math.max(insetBottom - 10, 16)

// A tab screen's own scrollable content should pad its bottom by this much (plus a
// little breathing room) so the last row clears the floating bar. The bar is
// absolutely positioned, so the scenes run UNDER it and this is the only thing
// keeping a last row from ending up behind it. Also where toasts sit.
export function useTabBarClearance(extra = 16) {
  const insets = useSafeAreaInsets()
  return barBottom(insets.bottom) + BAR_HEIGHT + extra
}

// Custom bottom bar: four tabs and a raised-in-colour "+" (rank a place) — Feed ·
// Explore · (+) · Rankings · Profile. A glass capsule; the open tab sits in a solid
// `ink` circle, the "+" is a burgundy `accent-fill` circle, and there are no labels
// (the accessibility labels stay).
//
// This is the SHIPPED bar (NATIVE_TABS = false in (tabs)/_layout.tsx), not a
// fallback: the native UITabBar (expo-router's NativeTabs) was tried first for the
// "+", but has no exposed way to render one item's icon at a larger point size than
// its siblings (confirmed against react-native-screens' full native prop list —
// only icon *color* is overridable, not size), and it cannot be a floating capsule
// with a circle on the active item — see docs/NATIVE.md's tab bar row.
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

function TabItem({
  routeName,
  focused,
  onPress,
}: {
  routeName: string
  focused: boolean
  onPress: () => void
}) {
  const t = useT()
  const Ico = ICONS[routeName]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(LABEL_KEYS[routeName as keyof typeof LABEL_KEYS])}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      className={`h-[46px] w-[46px] items-center justify-center rounded-pill ${focused ? 'bg-ink' : ''}`}
    >
      {focused ? (
        <Ico size={21} color="on-ink" strokeWidth={1.9} />
      ) : (
        <Ico size={22} color="tab-inactive" strokeWidth={1.8} />
      )}
    </Pressable>
  )
}

export function MesaTabBar({ state, navigation }: MesaTabBarProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const t = useT()
  const float = useLift('float')
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

  const item = (name: string) => {
    const idx = order.findIndex((r) => r.name === name)
    const focused = state.index === idx
    return (
      <TabItem
        key={name}
        routeName={name}
        focused={focused}
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
    // Absolute, so the scenes run under the bar; `box-none` so the empty strip either
    // side of the capsule still passes touches through to the page.
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0"
      style={{ paddingHorizontal: BAR_INSET, paddingBottom: barBottom(insets.bottom) }}
    >
      {/* The shadow sits on its own view: Glass clips its material to the capsule. */}
      <View style={[{ borderRadius: BAR_HEIGHT / 2 }, float]}>
        <Glass
          variant="bar"
          radius={BAR_HEIGHT / 2}
          className="flex-row items-center justify-around px-2"
          style={{ height: BAR_HEIGHT }}
        >
          {item('discover')}
          {item('explore')}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tabs.rank_a_spot')}
            onPress={openRank}
            className="h-[50px] w-[50px] items-center justify-center rounded-pill bg-accent-fill active:scale-95"
          >
            <PlusIcon size={22} color="on-accent" strokeWidth={2.2} />
          </Pressable>
          {item('rankings')}
          {item('profile')}
        </Glass>
      </View>
    </View>
  )
}
