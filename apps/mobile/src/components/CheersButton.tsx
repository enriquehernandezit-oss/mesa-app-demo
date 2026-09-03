import { HeartFilledIcon, HeartIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { tapLight } from '@/lib/haptics'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

// The heart — the one-tap reaction on a feed item (mock A1). Optimistic with a
// scale pop; both API calls are idempotent so a rapid toggle can't drift. Ported
// from apps/app/src/screens/tabs/CheersButton.tsx. The success haptic (tapLight)
// lands with expo-haptics in N6.
export function CheersButton({
  rankingId,
  count,
  cheered,
}: {
  rankingId: string
  count: number
  cheered: boolean
}) {
  const [on, setOn] = useState(cheered)
  const [n, setN] = useState(count)
  const scale = useSharedValue(1)

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post(`/cheers/${rankingId}`) : api.del(`/cheers/${rankingId}`),
    // Roll the optimistic state back if the write fails, so the button never
    // shows a cheer the server didn't record.
    onError: (_err, next) => {
      setOn(!next)
      setN((cur) => cur + (next ? -1 : 1))
    },
  })

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  function onTap() {
    const next = !on
    setOn(next)
    setN((cur) => cur + (next ? 1 : -1))
    if (next) {
      scale.value = withSequence(
        withTiming(1.3, { duration: 150 }),
        withTiming(1, { duration: 150 }),
      )
      tapLight()
    }
    toggle.mutate(next)
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? 'Quitar brindis' : 'Brindar'}
      onPress={onTap}
      className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-70"
    >
      <Animated.View style={style}>
        {on ? <HeartFilledIcon size={16} /> : <HeartIcon size={16} color="text-muted" />}
      </Animated.View>
      {n > 0 ? <Text className="font-mono text-eyebrow text-text-muted">{n}</Text> : null}
    </Pressable>
  )
}
