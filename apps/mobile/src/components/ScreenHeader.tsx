import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Header for full-screen routes outside the tab shell (no TopBar/tab bar). It
// supplies the status-bar inset so the back control never hides under the notch,
// and gives it a >=44px target. Optional right slot for a per-screen action.
// Ported from apps/app/src/components/ScreenHeader.tsx.
export function ScreenHeader({
  onBack,
  backLabel,
  right,
}: { onBack: () => void; backLabel: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      className="flex-row items-center justify-between px-5"
      style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        className="min-h-[44px] flex-row items-center gap-1 active:opacity-70"
      >
        <Text className="font-serif text-title text-text">‹</Text>
        <Text className="font-ui-medium text-label text-text">{backLabel}</Text>
      </Pressable>
      {right}
    </View>
  )
}
