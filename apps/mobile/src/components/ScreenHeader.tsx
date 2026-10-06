import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MAX_SCALE } from '@/components/ui'
import { BackIcon } from '@/components/ui/icons'
import { useLift } from '@/theme/useLift'

// Header for full-screen routes outside the tab shell (no TopBar/tab bar): a 42pt
// round back chip on the left, an optional centered 16/600 title, and an optional
// right slot for a per-screen action. It supplies the status-bar inset so the back
// control never hides under the notch. `backLabel` is the chip's accessibility label
// (always "Back" — the destination's name goes in `title`).
export function ScreenHeader({
  onBack,
  backLabel,
  title,
  right,
}: {
  onBack: () => void
  backLabel: string
  title?: string
  right?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const lift = useLift()
  return (
    <View className="px-4" style={{ paddingTop: insets.top + 8, paddingBottom: 10 }}>
      <View className="h-[42px] flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={4}
          className="h-[42px] w-[42px] items-center justify-center rounded-pill bg-chip active:opacity-70"
          style={lift}
        >
          <BackIcon size={20} />
        </Pressable>
        {title ? (
          <View
            pointerEvents="none"
            className="absolute inset-x-[70px] h-full items-center justify-center"
          >
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              numberOfLines={1}
              className="font-ui-semibold text-body text-text"
            >
              {title}
            </Text>
          </View>
        ) : null}
        {right}
      </View>
    </View>
  )
}
