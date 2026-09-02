import { useColor } from '@/theme/useColor'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

// The circular controls that float OVER a photo — a hero's back and share
// buttons. Glass is the right material precisely here: it's chrome sitting on
// content, and it stays legible over both a bright dish and a dark room, which
// a flat surface fill does not. Content surfaces stay paper (docs/DESIGN.md).
//
// Pre-iOS-26 devices fall back to the opaque surface these shipped with, so
// nothing regresses; `isLiquidGlassAvailable()` is the check.
export function GlassCircle({
  size = 40,
  onPress,
  accessibilityLabel,
  className,
  children,
}: {
  size?: number
  onPress: () => void
  accessibilityLabel: string
  className?: string
  children: ReactNode
}) {
  const surface = useColor('surface')
  const glass = isLiquidGlassAvailable()
  const box = { width: size, height: size, borderRadius: size / 2 }
  const inner = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={box}
      className="items-center justify-center active:opacity-80"
    >
      {children}
    </Pressable>
  )
  return glass ? (
    <GlassView style={box} isInteractive className={className}>
      {inner}
    </GlassView>
  ) : (
    <View style={[box, { backgroundColor: surface }]} className={className}>
      {inner}
    </View>
  )
}
