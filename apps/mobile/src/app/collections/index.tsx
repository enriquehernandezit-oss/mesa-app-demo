import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { ScreenHeader } from '@/components/ScreenHeader'
import { Button, Caption, EmptyState, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { PlusIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { CollectionSummary } from '@/lib/types'

// "Your lists" (M19) — every named list the member keeps. Was a horizontal rail at the top of
// Rankings' Saved tab; it lives on its own screen now, reached from Profile's icon list. Redesign
// 2: the serif title, then two tiles per row — the list's cover (else the photo of its latest
// spot, else a name card), its name in the serif, how many are saved — after a dashed "New list"
// tile. Same ['collections'] key, so save-to-list's invalidation still refreshes this.
export default function CollectionsScreen() {
  const t = useT()
  const router = useRouter()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))
  // The same branded create screen SaveButton's "Add to list" opens, with no item attached.
  const newList = () => router.push('/save-to-list')

  const q = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get<{ collections: CollectionSummary[] }>('/collections'),
  })
  const lists = q.data?.collections ?? []

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-10">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="px-1 font-serif text-display text-text">
          {t('rankings.lists_section')}
        </Text>
        {q.isPending ? (
          <View className="mt-4 flex-row flex-wrap justify-between gap-y-4">
            <Skeleton height={124} width="48%" />
            <Skeleton height={124} width="48%" />
          </View>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('saveToList.load_error')}</ErrorState>
        ) : lists.length === 0 ? (
          <EmptyState
            action={
              <Button size="sm" variant="primary" onPress={newList}>
                {t('saveToList.new_list_cta')}
              </Button>
            }
          >
            {t('saveToList.no_lists')}
          </EmptyState>
        ) : (
          <View className="mt-4 flex-row flex-wrap justify-between gap-y-4">
            <Pressable
              accessibilityRole="button"
              onPress={newList}
              className="w-[48%] active:opacity-70"
            >
              <View className="h-[124px] items-center justify-center gap-1.5 rounded-[22px] border-[1.5px] border-dashed border-line-strong">
                <PlusIcon size={22} color="text-2" />
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-pill text-text-2"
                >
                  {t('saveToList.new_list_cta')}
                </Text>
              </View>
            </Pressable>
            {lists.map((list) => (
              <Link key={list.id} href={`/collections/${list.id}`} asChild>
                <Pressable accessibilityRole="button" className="w-[48%] active:opacity-80">
                  <View className="h-[124px] overflow-hidden rounded-[22px]">
                    <PlaceCover
                      name={list.name}
                      coverImageId={list.coverImageId ?? list.previewImageId}
                      size={{ w: 480, h: 372 }}
                      className="h-full w-full rounded-none"
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="mt-2 font-serif text-serif-sm text-text"
                  >
                    {list.name}
                  </Text>
                  <Caption className="text-meta">
                    {t('saveToList.item_count', { n: list.itemCount })}
                  </Caption>
                </Pressable>
              </Link>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
