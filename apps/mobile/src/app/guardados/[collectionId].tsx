import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import type { CollectionDetail, CollectionItem } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// One named list's full contents (M19). Restaurant items show "Ya fuiste ·
// #N" once ranked since being added — see routes/collections.ts's own
// header for why ranking a place never drops it from a named list the way
// it clears the master saved_places one.
export default function CollectionDetailScreen() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/rankings?tab=saved'))

  const q = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => api.get<CollectionDetail>(`/collections/${collectionId}`),
    retry: false,
  })

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.del(`/collections/${collectionId}/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collection', collectionId] }),
    onError: () => toast({ variant: 'error', message: t('guardar.toggle_error') }),
  })

  const deleteList = useMutation({
    mutationFn: () => api.del(`/collections/${collectionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      goBack()
    },
    onError: (err) => {
      captureError(err, 'guardados.deleteList')
      toast({ variant: 'error', message: t('guardados.delete_error') })
    },
  })

  async function confirmDeleteList() {
    const picked = await showActionSheet({
      title: t('guardados.delete_confirm_title'),
      options: [{ label: t('guardados.delete_button'), destructive: true }],
    })
    if (picked === 0) deleteList.mutate()
  }

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
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {notFound ? (
          <EmptyState>{t('guardados.not_found')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('guardados.load_error')}</ErrorState>
        )}
      </View>
    )
  }

  const { name, items } = q.data

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: name, headerLargeTitle: false }} />
      <ScreenHeader
        onBack={goBack}
        backLabel={t('common.back_plain')}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={confirmDeleteList}
            className="min-h-[44px] justify-center active:opacity-60"
          >
            <Text className="font-ui-medium text-label text-status-packed">
              {t('guardados.delete_list')}
            </Text>
          </Pressable>
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10">
        {items.length === 0 ? (
          <EmptyState>{t('guardados.empty_list')}</EmptyState>
        ) : (
          items.map((item) => (
            <CollectionItemRow
              key={item.itemId}
              item={item}
              removing={removeItem.isPending}
              onRemove={() => removeItem.mutate(item.itemId)}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}

function CollectionItemRow({
  item,
  removing,
  onRemove,
}: {
  item: CollectionItem
  // Guards the "Quitar" Pressable below — removeItem is one shared mutation
  // for the whole list, so this goes true for every row while ANY of them is
  // mid-delete. A fast double-tap otherwise fired two overlapping DELETEs
  // with no feedback in between, reading as "nothing happened, tap again."
  removing: boolean
  onRemove: () => void
}) {
  const t = useT()
  if (item.restaurant) {
    const r = item.restaurant
    return (
      <Link href={`/r/${r.id}`} asChild>
        <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
          <PlaceCover
            seed={r.id}
            name={r.name}
            coverImageId={r.coverImageId}
            size={{ w: 200, h: 200 }}
            className="h-12 w-12"
          />
          <View className="flex-1">
            <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
              {r.name}
            </Text>
            <Characteristics
              priceTier={r.priceTier}
              cuisine={r.cuisine}
              neighborhood={r.neighborhood}
            />
          </View>
          {r.myRanking ? (
            <ScoreBadge
              size="sm"
              score={r.myRanking.score}
              attribution={{ kind: 'you' }}
              caption={t('guardados.already_went', { n: r.myRanking.position })}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              disabled={removing}
              onPress={onRemove}
              className="min-h-[36px] justify-center px-2 active:opacity-60"
            >
              <Caption className="text-status-packed">{t('rankings.remove')}</Caption>
            </Pressable>
          )}
        </Pressable>
      </Link>
    )
  }
  if (item.dish) {
    const d = item.dish
    return (
      <Link href={`/dish/${d.id}`} asChild>
        <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
          <View className="flex-1">
            <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
              {d.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={removing}
            onPress={onRemove}
            className="min-h-[36px] justify-center px-2 active:opacity-60"
          >
            <Caption className="text-status-packed">{t('rankings.remove')}</Caption>
          </Pressable>
        </Pressable>
      </Link>
    )
  }
  return null
}
