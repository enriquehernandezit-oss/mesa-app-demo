import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics } from '@/components/ui/patterns'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { DishListDetail, DishListEntry } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// One dish list's full contents (M20) — "Tu mejor carbonara". Ranked
// entries show their position; anything in `unranked` (a place that's
// posted this dish since the last ranking, or before the member got to a
// nudge) sits below with a CTA back into the pairwise flow.
export default function DishListDetailScreen() {
  const t = useT()
  const router = useRouter()
  const { listId } = useLocalSearchParams<{ listId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/platos'))

  const q = useQuery({
    queryKey: ['dish-list', listId],
    queryFn: () => api.get<DishListDetail>(`/dish-lists/${listId}`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="gap-3 px-5">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <ErrorState onRetry={() => q.refetch()}>{t('platos.load_error')}</ErrorState>
      </View>
    )
  }

  const { label, ranked, unranked } = q.data

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{ title: t('platos.your_best', { label }), headerLargeTitle: false }}
      />
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10">
        {ranked.length === 0 ? (
          <EmptyState>{t('platos.not_ranked_yet')}</EmptyState>
        ) : (
          ranked.map((entry) => <RankedRow key={entry.restaurant.id} entry={entry} />)
        )}

        {unranked.length > 0 && (
          <View className="mt-6">
            <Caption>{t('platos.unranked_count', { n: unranked.length })}</Caption>
            {unranked.map((entry) => (
              <View
                key={entry.restaurant.id}
                className="flex-row items-center gap-3 border-line border-b py-3"
              >
                <PlaceCover
                  seed={entry.restaurant.id}
                  name={entry.restaurant.name}
                  coverImageId={entry.dish.imageId ?? entry.restaurant.coverImageId}
                  size={{ w: 200, h: 200 }}
                  className="h-12 w-12"
                />
                <View className="flex-1">
                  <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                    {entry.restaurant.name}
                  </Text>
                  <Characteristics
                    priceTier={entry.restaurant.priceTier}
                    cuisine={entry.restaurant.cuisine}
                    neighborhood={entry.restaurant.neighborhood}
                  />
                </View>
              </View>
            ))}
            <View className="mt-4">
              <Button onPress={() => router.push(`/platos/rankear?listId=${listId}`)}>
                {t('platos.rank_more_button', { n: unranked.length })}
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function RankedRow({ entry }: { entry: DishListEntry & { position: number } }) {
  const { restaurant, dish, position } = entry
  return (
    <Link href={`/r/${restaurant.id}`} asChild>
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
        <Text style={DATA_FIGURES} className="w-6 font-serif text-serif-md text-text-muted">
          {position}
        </Text>
        <PlaceCover
          seed={restaurant.id}
          name={restaurant.name}
          coverImageId={dish.imageId ?? restaurant.coverImageId}
          size={{ w: 200, h: 200 }}
          className="h-12 w-12"
        />
        <View className="flex-1">
          <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
            {restaurant.name}
          </Text>
          <Characteristics
            priceTier={restaurant.priceTier}
            cuisine={restaurant.cuisine}
            neighborhood={restaurant.neighborhood}
          />
          {dish.caption ? (
            <Body className="mt-1 text-text-2" numberOfLines={2}>
              {dish.caption}
            </Body>
          ) : null}
        </View>
      </Pressable>
    </Link>
  )
}
