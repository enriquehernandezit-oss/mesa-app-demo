import {
  CompassIcon,
  DiscoverIcon,
  PersonIcon,
  PlusIcon,
  RankingsIcon,
} from '@/components/ui/icons'
import { useColor } from '@/theme/useColor'
import { BRASS_SHADOW } from '@/theme/vars'
import { type Tabs, useRouter } from 'expo-router'

// The exact props expo-router's Tabs passes to a custom tabBar (it re-exports its
// own BottomTabBarProps, distinct from @react-navigation's).
type MesaTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Custom bottom bar: four tabs with a center "+" FAB (rank a place) that breaks
// the bar's top edge, ported from app/router.tsx's 5-slot layout. Tonight is
// cut, so the tabs are Discover · Explore · (FAB) · Rankings · Profile.
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

function TabItem({
  routeName,
  focused,
  onPress,
}: { routeName: string; focused: boolean; onPress: () => void }) {
  const Ico = ICONS[routeName]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      className="flex-1 items-center justify-center gap-[3px]"
    >
      <Ico size={22} color={focused ? 'accent' : 'tab-inactive'} />
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
  const fabFg = useColor('btn-primary-fg')
  const order = state.routes

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
          onPress={() => router.push('/rank')}
          className="h-[44px] w-[44px] items-center justify-center rounded-pill active:scale-95"
          style={{
            marginTop: -8,
            backgroundColor: fabBg,
            shadowColor: BRASS_SHADOW,
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 3 },
            elevation: 6,
          }}
        >
          <PlusIcon size={20} color="btn-primary-fg" />
        </Pressable>
      </View>
      {item('rankings')}
      {item('profile')}
    </View>
  )
}
