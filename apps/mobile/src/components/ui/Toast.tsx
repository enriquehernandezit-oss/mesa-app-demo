import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'

import { useTabBarClearance } from '@/components/MesaTabBar'
import { Glass } from '@/components/ui/Glass'
import { tapError } from '@/lib/haptics'

import { MAX_SCALE } from './index'
import { type Toast, dismiss, useToasts } from './toast-store'

// Mounted once (root layout). Renders whatever toast-store holds, stacked above
// the bottom safe area. Enter/exit are reanimated layout animations, replacing
// the web's CSS transitions.
export function Toaster() {
  const toasts = useToasts()
  // Cleared the tab bar's own height, not just the safe area — at bottom:
  // insets.bottom + 16 a toast sat directly on top of MesaTabBar (and any
  // screen's fixed bottom CTA, like the restaurant page's "Rankear") for the
  // whole 3-5s it's shown, and ToastItem below has no pointerEvents of its
  // own, so it ate every tap underneath it.
  const bottom = useTabBarClearance()
  if (toasts.length === 0) return null
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        gap: 8,
        paddingHorizontal: 24,
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const error = toast.variant === 'error'
  // Every failed mutation in the app surfaces as an error toast, so buzzing here
  // gives the whole app failure feedback from one place. Once per toast, on mount.
  useEffect(() => {
    if (error) tapError()
  }, [error])
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(200)}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      {/* A glass capsule that floats over whatever screen it lands on. `solid`: it sits over
          rows of text, which the system material would let show through the words. */}
      <Glass solid variant="bar" className="min-h-[52px] flex-row items-center gap-3 px-5 py-3">
        {/* pointerEvents none: box-none on the container doesn't stop this
            Text from being the touch target, which ate taps on the card under
            the toast for its whole 3–5s. */}
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          pointerEvents="none"
          className={`flex-1 font-ui-medium text-subhead ${error ? 'text-danger' : 'text-text'}`}
        >
          {toast.message}
        </Text>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            className="active:opacity-60"
            onPress={() => {
              toast.action?.onClick()
              dismiss(toast.id)
            }}
          >
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-subhead text-accent"
            >
              {toast.action.label}
            </Text>
          </Pressable>
        )}
      </Glass>
    </Animated.View>
  )
}
