import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CheersButton } from '@/components/CheersButton'
import { Body, Caption, MAX_SCALE, SectionHeader } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { Dish } from '@/lib/types'

// Dishes at a place: a rail of photo cards ranked by cheers + how often the name recurs +
// recency (routes/dishes.ts's scoredDishesForRestaurant), with an entry to post your own (only
// once you've ranked the place) and — once there is a rail at all — a link to every dish.
export function PlaceDishes({ restaurantId, canAdd }: { restaurantId: string; canAdd: boolean }) {
  const router = useRouter()
  const t = useT()
  const q = useQuery({
    queryKey: ['dishes', restaurantId],
    queryFn: () => api.get<{ dishes: Dish[] }>(`/dishes/restaurant/${restaurantId}`),
  })
  const dishes = q.data?.dishes ?? []
  if (dishes.length === 0 && !canAdd && !q.isError) return null

  return (
    <View>
      <View className="px-5">
        <SectionHeader
          action={
            canAdd ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/dish?restaurant=${restaurantId}`)}
                hitSlop={8}
                className="active:opacity-60"
              >
                <Text className="font-ui-semibold text-pill text-accent">
                  {t('restaurant.add_dish')}
                </Text>
              </Pressable>
            ) : undefined
          }
        >
          {t('restaurant.popular_dishes')}
        </SectionHeader>
      </View>
      {q.isError ? (
        <Caption className="px-5">{t('restaurant.dishes_load_error')}</Caption>
      ) : dishes.length === 0 ? (
        <Body className="px-5 text-text-muted">{t('restaurant.no_dishes')}</Body>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2.5 px-5"
          >
            {dishes.map((d) => (
              <View key={d.id} className="w-[150px]">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/dish/${d.id}`)}
                  className="active:opacity-80"
                >
                  <View className="h-[132px] overflow-hidden rounded-[22px]">
                    <PlaceCover
                      name={d.name}
                      coverImageId={d.imageId}
                      size={{ w: 320, h: 290 }}
                      className="h-full w-full rounded-none"
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="mt-[7px] font-serif text-serif-sm text-text"
                  >
                    {d.name}
                  </Text>
                </Pressable>
                <View className="flex-row items-center justify-between gap-1">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/u/${d.user.id}`)}
                    className="min-w-0 flex-1 active:opacity-70"
                  >
                    <Caption numberOfLines={1}>
                      {t('restaurant.by_name', {
                        name: (d.user.name || d.user.handle || '').split(' ')[0],
                      })}
                    </Caption>
                  </Pressable>
                  <CheersButton
                    compact
                    target={{ kind: 'dish', id: d.id }}
                    count={d.cheerCount}
                    cheered={d.cheeredByMe}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/r/${restaurantId}/dishes`)}
            className="mx-5 mt-1 min-h-[44px] items-end justify-center active:opacity-60"
          >
            <Text className="font-ui-semibold text-pill text-accent">
              {t('restaurant.see_all_dishes')}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  )
}
