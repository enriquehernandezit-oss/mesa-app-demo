import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CheersButton } from '@/components/CheersButton'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, EmptyState, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { Dish, RestaurantProfileResponse } from '@/lib/types'

// "See all dishes" (M22) — the rail's overflow destination. Every visible
// dish at this place, duplicates included, same order the rail already
// uses (routes/dishes.ts's scoredDishesForRestaurant, unsliced) — two per
// row. Redesign 2: the serif title with the place's name under it, then a grid of photos
// (a name card when there isn't one), each dish's name in the serif and "by {name}" with the heart.
export default function AllDishesScreen() {
  const t = useT()
  const router = useRouter()
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/r/${restaurantId}`))

  const q = useQuery({
    queryKey: ['dishes', restaurantId, 'all'],
    queryFn: () => api.get<{ dishes: Dish[] }>(`/dishes/restaurant/${restaurantId}/all`),
  })
  const dishes = q.data?.dishes ?? []
  // The place's name for the subtitle — the same query (and cache) as the place page itself.
  const place = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })
  const placeName = place.data?.restaurant.name

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-10">
        <View className="px-1">
          <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-display text-text">
            {t('restaurant.popular_dishes')}
          </Text>
          {placeName ? (
            <Caption numberOfLines={1} className="mt-1 text-pill">
              {placeName}
            </Caption>
          ) : null}
        </View>
        {q.isPending ? (
          <View className="mt-4 flex-row flex-wrap justify-between gap-y-4">
            <Skeleton height={168} width="48%" />
            <Skeleton height={168} width="48%" />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('restaurant.dishes_load_error')}</ErrorState>
        ) : dishes.length === 0 ? (
          <EmptyState>{t('restaurant.no_dishes')}</EmptyState>
        ) : (
          <View className="mt-4 flex-row flex-wrap justify-between gap-y-4">
            {dishes.map((d) => (
              <View key={d.id} className="w-[48%]">
                <Link href={`/dish/${d.id}`} asChild>
                  <Pressable accessibilityRole="button" className="active:opacity-80">
                    <View className="h-[168px] overflow-hidden rounded-[22px]">
                      <PlaceCover
                        name={d.name}
                        coverImageId={d.imageId}
                        size={{ w: 504, h: 504 }}
                        className="h-full w-full rounded-none"
                      />
                    </View>
                    <Text
                      numberOfLines={2}
                      maxFontSizeMultiplier={MAX_SCALE}
                      className="mt-2 font-serif text-serif-xs text-text"
                    >
                      {d.name}
                    </Text>
                  </Pressable>
                </Link>
                <View className="mt-0.5 flex-row items-center justify-between">
                  {/* A plain Pressable, not a nested Link — Link-in-Link has
                      its own gesture-machinery bug (see the feed card's note
                      on the same fix); a router.push here avoids it. */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/u/${d.user.id}`)}
                    className="min-w-0 flex-1 active:opacity-70"
                  >
                    <Caption numberOfLines={1} className="text-meta">
                      {t('restaurant.by_name', {
                        name: (d.user.name || d.user.handle || '').split(' ')[0],
                      })}
                    </Caption>
                  </Pressable>
                  <CheersButton
                    target={{ kind: 'dish', id: d.id }}
                    count={d.cheerCount}
                    cheered={d.cheeredByMe}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
