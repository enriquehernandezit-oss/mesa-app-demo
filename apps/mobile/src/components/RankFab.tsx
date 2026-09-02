import { PlusIcon } from '@/components/ui/icons'
import { tapLight } from '@/lib/haptics'
import { useColor } from '@/theme/useColor'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// The "rank a place" action, floating over every tab. It used to live *inside*
// the custom tab bar as a center notch; the native tab bar (expo-router
// NativeTabs) can't host a non-tab item, so the FAB became what iOS 26 actually
// does with a primary action over content — a floating Liquid Glass circle.
//
// Glass is deliberate and scoped: this control floats OVER content, which is
// exactly what the material is for (docs/DESIGN.md's chrome/content line — paper
// stays the ground for content surfaces). Pre-iOS-26 devices get the solid ink
// circle the tab bar shipped with, so nothing regresses.
const SIZE = 56
const BOTTOM_GAP = 72

// How much room a scrolling tab screen must leave at the end of its content so
// the last row can clear the floating FAB. The native tab bar already insets
// itself; this is only the button's own footprint.
export const RANK_FAB_CLEARANCE = SIZE + BOTTOM_GAP - 40

export function RankFab() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const ink = useColor('btn-primary-bg')
  const glass = isLiquidGlassAvailable()

  const press = () => {
    tapLight()
    router.push('/rank')
  }

  const body = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Rankear un spot"
      onPress={press}
      className="items-center justify-center active:scale-95"
      style={{ width: SIZE, height: SIZE }}
    >
      <PlusIcon size={26} color={glass ? 'accent-strong' : 'btn-primary-fg'} />
    </Pressable>
  )

  return (
    <View
      // Above the tab bar, right-aligned — the iOS placement for a floating
      // primary action. pointerEvents box-none so only the circle takes touches.
      pointerEvents="box-none"
      style={{ position: 'absolute', right: 20, bottom: insets.bottom + BOTTOM_GAP }}
    >
      {glass ? (
        <GlassView style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2 }} isInteractive>
          {body}
        </GlassView>
      ) : (
        <View
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: ink,
            shadowColor: ink,
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          {body}
        </View>
      )}
    </View>
  )
}
