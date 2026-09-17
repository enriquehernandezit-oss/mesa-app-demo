import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { DishListSummary } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// "Tus platos" (M20) — every dish the member has posted at 3+ restaurants,
// ranked or still waiting on them. Reached from Profile; also where a
// dismissed nudge's list lives on for a manual visit anytime.
export default function PlatosScreen() {
  const t = useT()
  const router = useRouter()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))

  const q = useQuery({
    queryKey: ['dish-lists'],
    queryFn: () => api.get<{ lists: DishListSummary[] }>('/dish-lists'),
  })

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('platos.title'), headerLargeTitle: false }} />
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <View className="px-5">
        <Text className="font-serif text-title text-text">{t('platos.title')}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10 pt-3">
        {q.isPending ? (
          <View className="gap-3">
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('platos.load_error')}</ErrorState>
        ) : (q.data?.lists.length ?? 0) === 0 ? (
          <EmptyState body={t('platos.empty_body')}>{t('platos.empty_title')}</EmptyState>
        ) : (
          q.data?.lists.map((list) => (
            <Link key={list.id} href={`/platos/${list.id}`} asChild>
              <Pressable className="flex-row items-center justify-between border-line border-b py-3 active:opacity-80">
                <View className="flex-1 pr-3">
                  <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
                    {list.label}
                  </Text>
                  <Caption className="mt-1">
                    {list.rankedAt
                      ? t('platos.ranked_count', { n: list.restaurantCount })
                      : t('platos.not_ranked_yet')}
                  </Caption>
                </View>
                {!list.rankedAt && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/platos/rankear?listId=${list.id}`)}
                    className="min-h-[36px] justify-center px-2 active:opacity-60"
                  >
                    <Caption className="text-accent">{t('platos.rank_button')}</Caption>
                  </Pressable>
                )}
              </Pressable>
            </Link>
          ))
        )}
      </ScrollView>
    </View>
  )
}
