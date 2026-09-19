import { useTabBarClearance } from '@/components/MesaTabBar'
import { tapError } from '@/lib/haptics'
import { BRASS_SHADOW } from '@/theme/vars'
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
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
        paddingHorizontal: 16,
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
      className={`flex-row items-center gap-3 rounded border px-4 py-3 ${error ? 'border-status-packed bg-surface' : 'border-line bg-surface-raised'}`}
      style={{
        shadowColor: BRASS_SHADOW,
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      {/* pointerEvents none: box-none on the container doesn't stop this
          Text from being the touch target, which ate taps on the card under
          the toast for its whole 3–5s. */}
      <Text
        pointerEvents="none"
        className={`flex-1 font-ui text-label ${error ? 'text-status-packed' : 'text-text'}`}
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
          <Text className="font-ui-semibold text-label text-accent-strong">
            {toast.action.label}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  )
}
