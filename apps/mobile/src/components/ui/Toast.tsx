import { tapError } from '@/lib/haptics'
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { type Toast, dismiss, useToasts } from './toast-store'

// Mounted once (root layout). Renders whatever toast-store holds, stacked above
// the bottom safe area. Enter/exit are reanimated layout animations, replacing
// the web's CSS transitions.
export function Toaster() {
  const toasts = useToasts()
  const insets = useSafeAreaInsets()
  if (toasts.length === 0) return null
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 16,
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
      accessibilityLiveRegion="polite"
      className={`flex-row items-center gap-3 rounded border px-4 py-3 ${error ? 'border-status-packed bg-surface' : 'border-line bg-surface-raised'}`}
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Text className={`flex-1 font-ui text-label ${error ? 'text-status-packed' : 'text-text'}`}>
        {toast.message}
      </Text>
      {toast.action && (
        <Pressable
          accessibilityRole="button"
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
