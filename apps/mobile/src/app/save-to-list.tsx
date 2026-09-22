import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { Button, Caption, Chip, ErrorState, Eyebrow, RowsSkeleton, Title } from '@/components/ui'
import { CheckIcon, CloseIcon, PlusIcon } from '@/components/ui/icons'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { pickDishPhoto } from '@/lib/dishPhoto'
import { captureError } from '@/lib/errors'
import { useLanguage, useT } from '@/lib/i18n'
import type { CollectionSummary } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// Save to a named list (M19) — a page sheet reached from SaveButton's
// post-save toast ("Agregar a lista") or a long-press. Checking a list ALSO
// guarantees the master "Quiero probar" save (routes/collections.ts's own
// rule), so opening this straight from a long-press on an unsaved item still
// saves it once a list is checked.
//
// With no `kind`/`id` it's the bare "Nueva lista" screen — Rankings' "+ Nueva"
// card opens it the same way, so there's ONE branded create flow in the app
// instead of the iOS text-prompt alert both used to show.
//
// Redesigned (Sept 2026): was a formSheet at a 0.5 detent whose flex-1 root
// mis-laid itself out (rows shifted off the left edge, the title clipped);
// it's a plain page sheet now, with the create form inline.
const SUGGESTIONS = {
  es: ['Pizza', 'Date night', 'Brunch', 'Con amigos', 'Para impresionar'],
  en: ['Pizza', 'Date night', 'Brunch', 'With friends', 'To impress'],
} as const

export default function SaveToListSheet() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const placeholder = useColor('text-muted')
  const { kind, id, name } = useLocalSearchParams<{
    kind?: 'restaurant' | 'dish'
    id?: string
    name?: string
  }>()
  const itemName = name ? decodeURIComponent(name) : ''
  const hasItem = Boolean(kind && id)
  const [creating, setCreating] = useState(!hasItem)
  const [draft, setDraft] = useState('')
  const lang = useLanguage()
  const [description, setDescription] = useState('')
  const [cover, setCover] = useState<string | null>(null)

  const filterParam = kind === 'dish' ? 'dishId' : 'restaurantId'
  const q = useQuery({
    queryKey: ['collections', filterParam, id ?? ''],
    queryFn: () =>
      api.get<{ collections: CollectionSummary[] }>(
        hasItem ? `/collections?${filterParam}=${id}` : '/collections',
      ),
  })
  const lists = q.data?.collections ?? []

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['collections'] })
    queryClient.invalidateQueries({ queryKey: ['saved'] })
    queryClient.invalidateQueries({ queryKey: ['saved-dishes'] })
  }

  const toggle = useMutation({
    mutationFn: (list: CollectionSummary) =>
      list.itemId
        ? api.del(`/collections/${list.id}/items/${list.itemId}`)
        : api.post(`/collections/${list.id}/items`, { [filterParam]: id }),
    onSuccess: (_data, list) => {
      if (!list.itemId) track('collection_item_added')
      invalidate()
    },
  })

  const create = useMutation({
    mutationFn: (newName: string) =>
      api.post<{ id: string }>('/collections', {
        name: newName,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(cover ? { coverImageId: cover } : {}),
      }),
    onSuccess: async (created) => {
      track('collection_created')
      if (hasItem) {
        await api.post(`/collections/${created.id}/items`, { [filterParam]: id })
        track('collection_item_added')
      }
      setDraft('')
      setDescription('')
      setCover(null)
      invalidate()
      // A bare "Nueva lista" is done once the list exists; saving an item
      // stays open so the new list shows checked alongside the others.
      if (!hasItem) router.back()
      else setCreating(false)
    },
    onError: (err) => captureError(err, 'saveToList.create'),
  })
  const createError =
    create.error instanceof ApiError && create.error.code === 'name_taken'
      ? t('saveToList.name_taken')
      : create.isError
        ? t('saveToList.create_error')
        : null

  const trimmed = draft.trim()

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-bg">
      <View className="flex-row items-start justify-between px-5 pt-5">
        <View className="flex-1 pr-3">
          {itemName ? (
            <Eyebrow numberOfLines={1} className="mb-1">
              {itemName}
            </Eyebrow>
          ) : null}
          <Title>{hasItem ? t('saveToList.title') : t('saveToList.new_list_title')}</Title>
          {hasItem ? <Caption className="mt-1">{t('saveToList.subtitle')}</Caption> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.close')}
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
        >
          <CloseIcon size={18} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pt-5 pb-10"
      >
        {hasItem ? (
          q.isPending ? (
            <RowsSkeleton rows={3} />
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()}>{t('saveToList.load_error')}</ErrorState>
          ) : lists.length > 0 ? (
            <View className="overflow-hidden rounded-card border border-line bg-surface">
              {lists.map((list, i) => {
                const checked = Boolean(list.itemId)
                return (
                  <Pressable
                    key={list.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    onPress={() => {
                      if (!toggle.isPending) toggle.mutate(list)
                    }}
                    className={`min-h-[60px] flex-row items-center gap-3 px-4 active:bg-bg ${i === lists.length - 1 ? '' : 'border-line border-b'}`}
                  >
                    <View className="flex-1">
                      <Text numberOfLines={1} className="font-ui-semibold text-body text-text">
                        {list.name}
                      </Text>
                      <Caption>{t('saveToList.item_count', { n: list.itemCount })}</Caption>
                    </View>
                    <View
                      className={`h-7 w-7 items-center justify-center rounded-pill border ${checked ? 'border-accent bg-accent-fill' : 'border-line-strong'}`}
                    >
                      {checked ? <CheckIcon size={15} color="on-accent" /> : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <Caption className="mb-1">{t('saveToList.no_lists')}</Caption>
          )
        ) : null}

        {toggle.isError ? (
          <Caption className="mt-2 text-status-packed">{t('saveToList.toggle_error')}</Caption>
        ) : null}

        {creating ? (
          <View className="mt-4 rounded-card border border-line bg-surface p-4">
            {hasItem ? <Eyebrow className="mb-3">{t('saveToList.new_list_title')}</Eyebrow> : null}
            {/* Cover + name side by side, like a playlist: the photo is
                optional (a list without one shows its latest spot's photo). */}
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('saveToList.cover_label')}
                onPress={async () => {
                  const uri = await pickDishPhoto()
                  if (uri) setCover(uri)
                }}
                className="h-20 w-20 items-center justify-center overflow-hidden rounded-sm border border-dashed border-line-strong bg-bg active:opacity-70"
              >
                {cover ? (
                  <Image
                    source={{ uri: cover }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <>
                    <PlusIcon size={18} color="accent" />
                    <Caption className="mt-1 text-micro">{t('saveToList.cover_add')}</Caption>
                  </>
                )}
              </Pressable>
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                placeholder={t('saveToList.name_placeholder')}
                placeholderTextColor={placeholder}
                maxLength={40}
                returnKeyType="next"
                className="min-h-[48px] flex-1 border-line border-b font-serif text-serif-md text-text"
              />
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('saveToList.description_placeholder')}
              placeholderTextColor={placeholder}
              maxLength={300}
              multiline
              className="mt-4 min-h-[72px] rounded-sm border border-line bg-bg px-3 py-3 font-ui text-body text-text"
            />
            <Caption className="mt-3 mb-2">{t('saveToList.suggestions')}</Caption>
            <View className="flex-row flex-wrap gap-2">
              {SUGGESTIONS[lang].map((s) => (
                <Chip
                  key={s}
                  size="sm"
                  state={trimmed === s ? 'selected' : 'default'}
                  onPress={() => setDraft(s)}
                >
                  {s}
                </Chip>
              ))}
            </View>
            {createError ? (
              <Caption className="mt-3 text-status-packed">{createError}</Caption>
            ) : null}
            <Button
              className="mt-4"
              disabled={!trimmed}
              loading={create.isPending}
              onPress={() => create.mutate(trimmed)}
            >
              {create.isPending ? t('saveToList.creating') : t('saveToList.create_button')}
            </Button>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCreating(true)}
            className="mt-4 min-h-[56px] flex-row items-center gap-3 rounded-card border border-dashed border-line-strong px-4 active:opacity-70"
          >
            <PlusIcon size={18} color="accent" />
            <Text className="font-ui-semibold text-body text-accent-strong">
              {t('saveToList.new_list_cta')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
