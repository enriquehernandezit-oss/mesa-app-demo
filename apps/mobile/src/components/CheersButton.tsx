import { HeartFilledIcon, HeartIcon } from '@/components/ui/icons'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { tapLight } from '@/lib/haptics'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post(`/cheers/${rankingId}`) : api.del(`/cheers/${rankingId}`),
    // Roll the optimistic state back if the write fails, so the button never
    // shows a cheer the server didn't record.
    onError: (_err, next) => {
      setOn(!next)
      setN((cur) => cur + (next ? -1 : 1))
    },
    onSuccess: () => {
      // Trending is driven by cheer counts and nothing else invalidates it;
      // feed rows carry their own cheersCount that a refetch (pull-to-refresh,
      // remount) would otherwise serve stale.
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['trending'] })
    },
  })

  // `useState(cheered)`/`useState(count)` only seed from props on the FIRST
  // render — a row that stays mounted through a pull-to-refresh (new
  // cheersCount/cheeredByMe arriving from the server) would otherwise keep
  // showing whatever this button last set, forever, even after the real
  // value changes. Deliberately keyed on [cheered, count] alone, not
  // toggle.isPending: our own tap's optimistic state already matches what
  // the server will report, so by the time a refetch actually lands these
  // props they just reconfirm it — but if isPending gated this effect too,
  // it would re-fire the instant OUR OWN mutation settles, syncing from the
  // still-stale pre-refetch props and visibly reverting the heart for a
  // moment before the real data arrives a beat later.
  useEffect(() => {
    setOn(cheered)
    setN(count)
  }, [cheered, count])

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  function onTap() {
    const next = !on
    if (next) track('cheers_given')
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
