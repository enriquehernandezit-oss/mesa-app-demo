import { Body, Caption, EmptyState, ErrorState, RowsSkeleton, Title } from '@/components/ui'
import { CheckIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import type { CollectionSummary } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'

// The list picker (M19) — a native form sheet reached from SaveButton's
// post-save toast or a long-press. Checking a list ALSO guarantees the
// master save (routes/collections.ts's own rule), so opening this straight
// from a long-press on an unsaved item still saves it, even before any
// checkbox is tapped.
export default function GuardarSheet() {
  const t = useT()
  const queryClient = useQueryClient()
  const { kind, id, name } = useLocalSearchParams<{
    kind: 'restaurant' | 'dish'
    id: string
    name?: string
  }>()
  const itemName = name ? decodeURIComponent(name) : ''

  const filterParam = kind === 'dish' ? 'dishId' : 'restaurantId'
  const q = useQuery({
    queryKey: ['collections', filterParam, id],
    queryFn: () =>
      api.get<{ collections: CollectionSummary[] }>(`/collections?${filterParam}=${id}`),
  })
  const lists = q.data?.collections ?? []

  const toggle = useMutation({
    mutationFn: (list: CollectionSummary) =>
      list.itemId
        ? api.del(`/collections/${list.id}/items/${list.itemId}`)
        : api.post(`/collections/${list.id}/items`, { [filterParam]: id }),
    onSuccess: (_data, list) => {
      if (!list.itemId) track('collection_item_added')
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['saved-dishes'] })
    },
    onError: () => toast({ variant: 'error', message: t('guardar.toggle_error') }),
  })

  const create = useMutation({
    mutationFn: (newName: string) => api.post<{ id: string }>('/collections', { name: newName }),
    onSuccess: async (created) => {
      track('collection_created')
      await api.post(`/collections/${created.id}/items`, { [filterParam]: id })
      track('collection_item_added')
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
      queryClient.invalidateQueries({ queryKey: ['saved-dishes'] })
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : ''
      captureError(err, 'guardar.create')
      toast({
        variant: 'error',
        message: code === 'name_taken' ? t('guardar.name_taken') : t('guardar.create_error'),
      })
    },
  })

  function promptNewList() {
    Alert.prompt(
      t('guardar.new_list_title'),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('guardar.create_button'),
          onPress: (typed?: string) => {
            const trimmed = typed?.trim()
            if (trimmed) create.mutate(trimmed)
          },
        },
      ],
      'plain-text',
    )
  }

  return (
    <View className="flex-1 bg-bg px-5 pt-4">
      <Title>{t('guardar.title')}</Title>
      {itemName ? <Body className="mt-1">{itemName}</Body> : null}

      <Pressable
        accessibilityRole="button"
        onPress={promptNewList}
        disabled={create.isPending}
        className="mt-4 min-h-[52px] flex-row items-center gap-3 rounded border border-line bg-surface px-4 active:opacity-80"
      >
        <Text className="flex-1 font-ui-medium text-body text-accent-strong">
          {create.isPending ? t('guardar.creating') : t('guardar.new_list')}
        </Text>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('guardar.load_error')}</ErrorState>
        ) : lists.length === 0 ? (
          <EmptyState>{t('guardar.no_lists')}</EmptyState>
        ) : (
          <View className="mt-2 rounded border border-line bg-surface px-4">
            {lists.map((list, i) => {
              const checked = Boolean(list.itemId)
              return (
                <Pressable
                  key={list.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: checked }}
                  disabled={toggle.isPending}
                  onPress={() => toggle.mutate(list)}
                  className={`min-h-[52px] flex-row items-center gap-3 py-3 active:opacity-70 ${i === lists.length - 1 ? '' : 'border-line border-b'}`}
                >
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-sm border ${checked ? 'border-accent bg-accent-fill' : 'border-line-strong'}`}
                  >
                    {checked ? <CheckIcon size={14} color="on-accent" /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="font-ui text-body text-text">{list.name}</Text>
                    <Caption>{t('guardar.item_count', { n: list.itemCount })}</Caption>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
