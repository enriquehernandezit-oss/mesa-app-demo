import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CheersButton } from '@/components/CheersButton'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { Dish } from '@/lib/types'

// "See all dishes" (M22) — the rail's overflow destination. Every visible
// dish at this place, duplicates included, same order the rail already
// uses (routes/dishes.ts's scoredDishesForRestaurant, unsliced) — two per
// row, same card/grid idiom as collections/index.tsx.
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

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('restaurant.popular_dishes'), headerLargeTitle: false }} />
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <View className="px-5">
        <Text className="font-serif text-title text-text">{t('restaurant.popular_dishes')}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10 pt-3">
        {q.isPending ? (
          <View className="flex-row flex-wrap gap-3">
            <Skeleton height={172} width="48%" />
            <Skeleton height={172} width="48%" />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('restaurant.dishes_load_error')}</ErrorState>
        ) : dishes.length === 0 ? (
          <EmptyState>{t('restaurant.no_dishes')}</EmptyState>
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {dishes.map((d) => (
              <View key={d.id} className="w-[48%]">
                <Link href={`/dish/${d.id}`} asChild>
                  <Pressable className="active:opacity-80">
                    <PlaceCover
                      seed={d.id}
                      name={d.name}
                      coverImageId={d.imageId}
                      size={{ w: 480, h: 480 }}
                      className="aspect-square w-full"
                    />
                    <Text className="mt-2 font-serif text-serif-sm text-text" numberOfLines={1}>
                      {d.name}
                    </Text>
                  </Pressable>
                </Link>
                <View className="mt-1 flex-row items-center justify-between">
                  {/* A plain Pressable, not a nested Link — Link-in-Link has
                      its own gesture-machinery bug (see the feed card's note
                      on the same fix); a router.push here avoids it. */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/u/${d.user.id}`)}
                    className="flex-1 active:opacity-70"
                  >
                    <Caption numberOfLines={1}>
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
