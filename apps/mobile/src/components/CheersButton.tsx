import { MAX_SCALE } from '@/components/ui'
import { HeartFilledIcon, HeartIcon } from '@/components/ui/icons'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import type { FeedItem } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
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
  className,
}: {
  rankingId: string
  count: number
  cheered: boolean
  className?: string
}) {
  const t = useT()
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
    onSuccess: (_data, next) => {
      // Patch the cache instead of invalidating: an invalidation here used to
      // refetch the whole feed on every heart tap, which is also what made
      // Feed's pull-to-refresh spinner freeze mid-scroll so often (a
      // background refetch triggered from any screen looks identical to a
      // user's own pull — see lib/usePullToRefresh.ts). This row's own
      // cheersCount/cheeredByMe is the only thing that changed, so patch it
      // directly wherever it appears in the cached feed pages; trending is a
      // 5-minute-stale rail (staleTime in discover.tsx) that doesn't need
      // read-your-own-write freshness for one cheer.
      queryClient.setQueriesData<{ pages: { feed: FeedItem[]; nextCursor: string | null }[] }>(
        { queryKey: ['feed'] },
        (data) => {
          if (!data) return data
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              feed: page.feed.map((item) =>
                item.rankingId === rankingId
                  ? { ...item, cheeredByMe: next, cheersCount: n + (next ? 1 : 0) - (on ? 1 : 0) }
                  : item,
              ),
            })),
          }
        },
      )
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
      accessibilityLabel={on ? t('cheers.remove') : t('cheers.give')}
      onPress={onTap}
      hitSlop={{ top: 12, bottom: 12 }}
      className={`min-w-[44px] flex-row items-center gap-1.5 active:opacity-70 ${className ?? ''}`}
    >
      <Animated.View style={style}>
        {on ? <HeartFilledIcon size={20} /> : <HeartIcon size={20} color="text-muted" />}
      </Animated.View>
      {n > 0 ? (
        <Text
          style={DATA_FIGURES}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-medium text-label text-text-muted"
        >
          {n}
        </Text>
      ) : null}
    </Pressable>
  )
}
