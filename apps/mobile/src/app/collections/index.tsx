import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, Stack, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { ScreenHeader } from '@/components/ScreenHeader'
import { Button, Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { ListIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { CollectionSummary } from '@/lib/types'

// "Tus listas" (M19) — every named list the member keeps. Was a horizontal
// rail at the top of Rankings' Guardados tab; it lives on its own screen now,
// reached from Profile's nav card, so Rankings is only the ranked list. Same
// cards and the same "+ Nueva" tile as that rail, two per row instead of
// scrolling sideways; same ['collections'] key, so save-to-list's invalidation
// still refreshes this.
export default function CollectionsScreen() {
  const t = useT()
  const router = useRouter()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))
  // The same branded create screen SaveButton's "Agregar a lista" opens, with
  // no item attached.
  const newList = () => router.push('/save-to-list')

  const q = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get<{ collections: CollectionSummary[] }>('/collections'),
  })
  const lists = q.data?.collections ?? []

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('rankings.lists_section'), headerLargeTitle: false }} />
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <View className="px-5">
        <Text className="font-serif text-title text-text">{t('rankings.lists_section')}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10 pt-3">
        {q.isPending ? (
          <View className="gap-3">
            <Skeleton height={112} />
            <Skeleton height={112} />
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
          <View className="flex-row flex-wrap gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={newList}
              className="w-[48%] items-center justify-center gap-1 rounded-card border border-line-strong border-dashed active:opacity-70"
            >
              <Text className="font-ui-medium text-label text-accent-strong">
                {t('rankings.new_list')}
              </Text>
            </Pressable>
            {lists.map((list) => {
              const img = imageUrl(list.coverImageId ?? list.previewImageId, { w: 480, h: 340 })
              return (
                <Link key={list.id} href={`/collections/${list.id}`} asChild>
                  <Pressable className="w-[48%] overflow-hidden rounded-card border border-line bg-surface active:opacity-80">
                    <View className="h-24 w-full items-center justify-center bg-bg-sunk">
                      {img ? (
                        <Image
                          source={{ uri: img }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                      ) : (
                        <ListIcon size={20} color="text-muted" />
                      )}
                    </View>
                    <View className="px-3 pt-2 pb-3">
                      <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                        {list.name}
                      </Text>
                      <Caption className="mt-0.5 text-micro">
                        {t('saveToList.item_count', { n: list.itemCount })}
                      </Caption>
                    </View>
                  </Pressable>
                </Link>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
