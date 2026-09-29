import { type ReactNode, useRef } from 'react'
import { Pressable, Text } from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { LinearTransition } from 'react-native-reanimated'

import { useT } from '@/lib/i18n'

// Hoisted, not built fresh on every row's every render — a LinearTransition config is a plain
// object either way, but re-creating it per row per render is needless churn on a list that
// can run long.
const ROW_LAYOUT_TRANSITION = LinearTransition.springify().damping(18)

// A row that reveals a single "Remove" action on a left swipe — the iOS gesture for removing
// something from a list. It's additive: each row keeps its own visible way to remove (a menu, a
// button), and the swipe is a second trigger for it. Removal itself is unchanged (the
// existing undo-toast machinery owns the optimistic remove + restore).
//
// For the hairline-divided rows of Your list: the red action is the row's own height, edge to
// edge. (Not for raised cards — the swipeable clips its child, and a card's shadow lives outside
// its box.)
export function SwipeToRemove({
  onRemove,
  skipAnim,
  children,
}: {
  onRemove: () => void
  // Skip the layout animation: this render is a filter/sort change, not a removal.
  skipAnim?: boolean
  children: ReactNode
}) {
  const ref = useRef<SwipeableMethods>(null)
  const t = useT()
  return (
    // layout= makes a removal slide the neighbours up rather than teleporting them — it
    // matters right after a swipe, and again when undo puts the row back.
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('rankings.remove')}
          onPress={() => {
            // Close first: the row is removed optimistically, and a half-open swipeable left
            // behind reads as a stuck row.
            ref.current?.close()
            onRemove()
          }}
          className="w-[88px] items-center justify-center bg-danger active:opacity-80"
        >
          <Text className="font-ui-semibold text-label text-on-accent">{t('rankings.remove')}</Text>
        </Pressable>
      )}
    >
      <Animated.View layout={skipAnim ? undefined : ROW_LAYOUT_TRANSITION}>
        {children}
      </Animated.View>
    </ReanimatedSwipeable>
  )
}
