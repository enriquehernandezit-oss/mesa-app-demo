import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { ScreenHeader } from '@/components/ScreenHeader'
import { Group } from '@/components/SettingsRow'
import { Caption, Chip, EmptyState, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { ChevronIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { DishListSummary } from '@/lib/types'

// "Your dishes" (M20) — every dish the member has posted at 3+ restaurants, ranked or still
// waiting on them. Reached from Profile; also where a dismissed nudge's list lives on for a
// manual visit anytime. Redesign 2: the serif title, an inverted ink card nudging the first list
// still waiting to be ranked, then the lists as one grouped card — "Rank" on the ones not yet
// ranked, a chevron on the rest.
export default function DishListsScreen() {
  const t = useT()
  const router = useRouter()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))

  const q = useQuery({
    queryKey: ['dish-lists'],
    queryFn: () => api.get<{ lists: DishListSummary[] }>('/dish-lists'),
  })
  const lists = q.data?.lists ?? []
  const waiting = lists.find((l) => !l.rankedAt)
  const rank = (id: string) => router.push(`/dish-lists/rank?listId=${id}`)

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-10">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="px-1 font-serif text-display text-text">
          {t('dishLists.title')}
        </Text>
        {q.isPending ? (
          <View className="mt-4 gap-3">
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('dishLists.load_error')}</ErrorState>
        ) : lists.length === 0 ? (
          <EmptyState body={t('dishLists.empty_body')}>{t('dishLists.empty_title')}</EmptyState>
        ) : (
          <>
            {waiting ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => rank(waiting.id)}
                className="mt-4 flex-row items-center gap-3 rounded-group bg-ink px-4 py-3.5 active:opacity-90"
              >
                <View className="min-w-0 flex-1">
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-serif text-serif-md text-on-ink"
                  >
                    {t('dishLists.nudge_title_first', {
                      label: waiting.label,
                      n: waiting.restaurantCount,
                    })}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="mt-1 font-ui text-label text-on-ink opacity-70"
                  >
                    {t('dishLists.nudge_body')}
                  </Text>
                </View>
                <View className="min-h-[34px] items-center justify-center rounded-pill bg-bg px-3.5">
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui-semibold text-label text-text"
                  >
                    {t('dishLists.rank_button')}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            <Group className="mt-3">
              {lists.map((list, i) => (
                <Link key={list.id} href={`/dish-lists/${list.id}`} asChild>
                  <Pressable
                    accessibilityRole="button"
                    className={`min-h-[60px] flex-row items-center gap-3 py-2.5 active:opacity-70 ${i === lists.length - 1 ? '' : 'border-line border-b'}`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={MAX_SCALE}
                        className="font-serif text-serif-sm text-text"
                      >
                        {list.label}
                      </Text>
                      <Caption className="text-meta">
                        {list.rankedAt
                          ? t('dishLists.ranked_count', { n: list.restaurantCount })
                          : t('dishLists.not_ranked_yet')}
                      </Caption>
                    </View>
                    {list.rankedAt ? (
                      <ChevronIcon size={16} color="text-faint" />
                    ) : (
                      <Chip size="sm" onPress={() => rank(list.id)}>
                        {t('dishLists.rank_button')}
                      </Chip>
                    )}
                  </Pressable>
                </Link>
              ))}
            </Group>
          </>
        )}
      </ScrollView>
    </View>
  )
}
