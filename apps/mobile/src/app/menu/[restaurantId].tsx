import {
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  Eyebrow,
  RowsSkeleton,
} from '@/components/ui'
import { api } from '@/lib/api'
import { dateLocale, useT } from '@/lib/i18n'
import type { RestaurantMenu as RestaurantMenuData } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

// The restaurant's own published menu (M5), pulled out of the profile into
// its own page (M7) — a long menu (La Locanda has 83 items) was pushing the
// social content (scores, popular dishes) off the fold, and Enrique wanted a
// dedicated "Menú" button next to Llamar/Sitio web/Cómo llegar instead of an
// inline, collapsible section.
export default function RestaurantMenuScreen() {
  const t = useT()
  const { restaurantId, name } = useLocalSearchParams<{ restaurantId: string; name?: string }>()
  const queryClient = useQueryClient()
  const restaurantName =
    name ??
    queryClient.getQueryData<{ restaurant: { name: string } }>(['restaurant', restaurantId])
      ?.restaurant.name

  const q = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.get<RestaurantMenuData>(`/restaurants/${restaurantId}/menu`),
  })
  const sections = q.data?.sections ?? []

  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsets = useRef<number[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const jumpTo = (i: number) => {
    const y = sectionOffsets.current[i]
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true })
  }

  // The chip rail tracks scroll position: whichever section's header is the
  // last one at or above the current scroll offset is "current." A small
  // lookahead (24px) keeps the chip from flipping right as a header's top
  // edge crosses zero, which read as one tick early against the eye.
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y + 24
    let idx = 0
    for (let i = 0; i < sectionOffsets.current.length; i++) {
      if ((sectionOffsets.current[i] ?? 0) <= y) idx = i
    }
    setActiveIndex(idx)
  }

  if (q.isPending) return <RowsSkeleton />
  if (q.isError)
    return <ErrorState onRetry={() => q.refetch()}>{t('restaurant.menu_load_error')}</ErrorState>
  if (sections.length === 0) return <EmptyState>{t('restaurant.menu_empty')}</EmptyState>

  // Leading, non-sticky children (name + verified caption) shift every
  // section header's index in the ScrollView's own children array —
  // stickyHeaderIndices addresses that array directly, so it has to be
  // computed from the same conditionals the JSX below uses, not assumed.
  const leading = (restaurantName ? 1 : 0) + (q.data?.verifiedAt ? 1 : 0)
  const headerIndices = sections.map((_, i) => leading + i * 2)

  return (
    <View className="flex-1 bg-bg">
      {sections.length > 1 ? (
        <ChipRail className="border-line border-b bg-bg px-5 py-2">
          {sections.map((s, i) => (
            <Chip
              key={s.name}
              size="sm"
              state={i === activeIndex ? 'selected' : 'default'}
              onPress={() => jumpTo(i)}
            >
              {s.name}
            </Chip>
          ))}
        </ChipRail>
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
          <Caption className="mt-1 font-mono text-micro text-text-muted">
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
            <Text className="font-mono text-micro uppercase tracking-micro text-accent-strong">
              {s.name}
            </Text>
          </View>,
          <View key={`b-${s.name}`}>
            {s.items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-start gap-3 border-line border-b py-2.5"
              >
                <View className="flex-1">
                  <Text
                    className="font-ui text-body text-text"
                    accessibilityLabel={
                      item.priceCents != null && item.currency
                        ? `${item.name}, ${formatPrice(item.priceCents, item.currency)}`
                        : item.name
                    }
                  >
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Caption numberOfLines={2} className="mt-0.5 text-text-2">
                      {item.description}
                    </Caption>
                  ) : null}
                </View>
                {item.priceCents != null && item.currency ? (
                  <Text style={DATA_FIGURES} className="font-mono text-label text-accent">
                    {formatPrice(item.priceCents, item.currency)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>,
        ])}
      </ScrollView>
    </View>
  )
}

function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat(dateLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
  }).format(priceCents / 100)
}
