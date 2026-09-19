import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, Chip, EmptyState, ErrorState, Eyebrow, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { dateLocale, useLanguage, useT } from '@/lib/i18n'
import type { RestaurantMenu as RestaurantMenuData } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

// The restaurant's own published menu (M5), pulled out of the profile into
// its own page (M7) — a long menu (La Locanda has 83 items) was pushing the
// social content (scores, popular dishes) off the fold, and Enrique wanted a
// dedicated "Menú" button next to Llamar/Sitio web/Cómo llegar instead of an
// inline, collapsible section.
export default function RestaurantMenuScreen() {
  const t = useT()
  const lang = useLanguage()
  const router = useRouter()
  const { restaurantId, name } = useLocalSearchParams<{ restaurantId: string; name?: string }>()
  const queryClient = useQueryClient()
  const restaurantName =
    name ??
    queryClient.getQueryData<{ restaurant: { name: string } }>(['restaurant', restaurantId])
      ?.restaurant.name
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/r/${restaurantId}`))

  const bg = useColor('bg')
  const line = useColor('line')

  const q = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.get<RestaurantMenuData>(`/restaurants/${restaurantId}/menu`),
  })
  const sections = q.data?.sections ?? []

  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsets = useRef<number[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  // Tapping a chip used to only call scrollTo — the highlight itself only
  // ever moved once `onScroll` below caught up, which a short animated hop to
  // a nearby section can outrun entirely (a handful of scrollEventThrottle-32
  // events over a fast, short scroll can land zero of them on the way), so
  // the tap visibly "did nothing." Setting the index immediately on tap fixes
  // that; `jumping` then mutes the scroll-spy below for the span of that
  // animation so it can't fight the just-tapped chip with a stale in-between
  // read before the scroll settles.
  const jumping = useRef(false)
  const jumpTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (jumpTimeout.current) clearTimeout(jumpTimeout.current)
    },
    [],
  )

  const railRef = useRef<ScrollView>(null)
  const chipOffsets = useRef<number[]>([])
  // Keeps the active chip on-screen in the horizontal rail — it used to only
  // ever move the PAGE, so a chip near the end of a long rail could highlight
  // while sitting off the edge of the visible strip.
  // Never while the member's own finger is on the rail (that yanked it back
  // mid-drag), and clamped to the rail's real scroll range so it can't
  // overshoot and bounce at the end.
  const railDragging = useRef(false)
  const railContentW = useRef(0)
  const railW = useRef(0)
  useEffect(() => {
    const x = chipOffsets.current[activeIndex]
    if (x == null || railDragging.current) return
    const max = Math.max(0, railContentW.current - railW.current)
    railRef.current?.scrollTo({ x: Math.min(max, Math.max(0, x - 24)), animated: true })
  }, [activeIndex])

  const jumpTo = (i: number) => {
    const y = sectionOffsets.current[i]
    if (y == null) return
    setActiveIndex(i)
    jumping.current = true
    if (jumpTimeout.current) clearTimeout(jumpTimeout.current)
    jumpTimeout.current = setTimeout(() => {
      jumping.current = false
    }, 400)
    scrollRef.current?.scrollTo({ y, animated: true })
  }

  // The chip rail tracks scroll position: whichever section's header is the
  // last one at or above the current scroll offset is "current." A small
  // lookahead (24px) keeps the chip from flipping right as a header's top
  // edge crosses zero, which read as one tick early against the eye.
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (jumping.current) return
    const y = e.nativeEvent.contentOffset.y + 24
    let idx = 0
    for (let i = 0; i < sectionOffsets.current.length; i++) {
      if ((sectionOffsets.current[i] ?? 0) <= y) idx = i
    }
    setActiveIndex(idx)
  }

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {/* Shaped like the loaded screen (padded text rows under a name), not
            the generic avatar-row skeleton — that one only ever matched a
            list of people, and swapping it for the real menu on arrival
            produced its own layout jump (padding and a chip rail appearing
            at once) on top of the transition this is fixing. */}
        <View className="px-5">
          <Skeleton height={11} width={140} className="mt-4" />
          <Skeleton height={16} width={200} className="mt-5" />
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} className="border-line border-b py-2.5">
              <Skeleton height={15} width={`${70 - i * 6}%`} />
            </View>
          ))}
        </View>
      </View>
    )
  }
  if (q.isError) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="px-5">
          <ErrorState onRetry={() => q.refetch()}>{t('restaurant.menu_load_error')}</ErrorState>
        </View>
      </View>
    )
  }
  if (sections.length === 0) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="px-5">
          <EmptyState>{t('restaurant.menu_empty')}</EmptyState>
        </View>
      </View>
    )
  }

  // Leading, non-sticky children (name + verified caption) shift every
  // section header's index in the ScrollView's own children array —
  // stickyHeaderIndices addresses that array directly, so it has to be
  // computed from the same conditionals the JSX below uses, not assumed.
  const leading = (restaurantName ? 1 : 0) + (q.data?.verifiedAt ? 1 : 0)
  const headerIndices = sections.map((_, i) => leading + i * 2)

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      {sections.length > 1 ? (
        // Not the shared ChipRail here: as the first child above the flex-1
        // content ScrollView (no sibling to size against), its row-direction
        // cross-axis stretch default blew each Chip up to fill the whole
        // remaining screen. `height` in a ScrollView's own `style` is
        // silently ignored in this app regardless of whether it's plain or
        // NativeWind-derived — confirmed by swapping 52 for 200 and seeing
        // no change at all. A plain View wrapper with overflow:hidden clips
        // it from the outside instead, which Views (unlike this ScrollView)
        // do respect.
        <View style={{ height: 52, overflow: 'hidden' }}>
          <ScrollView
            ref={railRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={(e) => {
              railW.current = e.nativeEvent.layout.width
            }}
            onContentSizeChange={(w) => {
              railContentW.current = w
            }}
            onScrollBeginDrag={() => {
              railDragging.current = true
            }}
            onScrollEndDrag={(e) => {
              // No fling → no momentum events; release right away.
              if (!e.nativeEvent.velocity?.x) railDragging.current = false
            }}
            onMomentumScrollEnd={() => {
              railDragging.current = false
            }}
            style={{
              backgroundColor: bg,
              borderBottomWidth: 1,
              borderBottomColor: line,
            }}
            contentContainerStyle={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 24,
              height: 52,
            }}
          >
            {sections.map((s, i) => (
              <Chip
                key={s.name}
                size="sm"
                state={i === activeIndex ? 'selected' : 'default'}
                onPress={() => jumpTo(i)}
                onLayout={(e) => {
                  chipOffsets.current[i] = e.nativeEvent.layout.x
                }}
              >
                {s.label[lang]}
              </Chip>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        onScroll={onScroll}
        scrollEventThrottle={32}
        stickyHeaderIndices={headerIndices}
      >
        {restaurantName ? <Eyebrow className="mt-4">{restaurantName}</Eyebrow> : null}
        {q.data?.verifiedAt ? (
          <Caption className="mt-1">
            {t('restaurant.menu_verified_on', {
              date: new Date(q.data.verifiedAt).toLocaleDateString(dateLocale()),
            })}
          </Caption>
        ) : null}

        {sections.flatMap((s, i) => [
          <View
            key={`h-${s.name}`}
            className="bg-bg pt-5 pb-1"
            onLayout={(e) => {
              sectionOffsets.current[i] = e.nativeEvent.layout.y
            }}
          >
            <Eyebrow className="text-accent-strong">{s.label[lang]}</Eyebrow>
          </View>,
          <View key={`b-${s.name}`}>
            {/* Prices deliberately not shown — they drift with time and a
                stale price reads worse than no price at all. The data is
                still fetched/stored (see docs/MENUS.md); this is a display
                decision only. */}
            {s.items.map((item) => (
              <View key={item.id} className="border-line border-b py-2.5">
                <Text className="font-ui text-body text-text">{item.name}</Text>
                {item.description ? (
                  <Caption numberOfLines={2} className="mt-0.5 text-text-2">
                    {item.description}
                  </Caption>
                ) : null}
              </View>
            ))}
          </View>,
        ])}
      </ScrollView>
    </View>
  )
}
