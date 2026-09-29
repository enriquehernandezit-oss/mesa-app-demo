import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { Group } from '@/components/SettingsRow'
import {
  Button,
  Caption,
  Card,
  Chip,
  ErrorState,
  IconButton,
  MAX_SCALE,
  RowsSkeleton,
} from '@/components/ui'
import { CheckCircle } from '@/components/ui/CheckCircle'
import { CloseIcon, PlusIcon } from '@/components/ui/icons'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { pickDishPhoto } from '@/lib/dishPhoto'
import { captureError } from '@/lib/errors'
import { useLanguage, useT } from '@/lib/i18n'
import type { CollectionSummary } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
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
// it's a plain page sheet now, with the create form inline. Redesign 2: the item's name over a
// serif title, the lists as one grouped card with a check circle each, and the new-list form a
// card with a dashed cover square, a serif name line, suggestion pills and a solid Create.
const SUGGESTIONS = {
  es: ['Pizza', 'Date night', 'Brunch', 'Con amigos', 'Para impresionar'],
  en: ['Pizza', 'Date night', 'Brunch', 'With friends', 'To impress'],
} as const

export default function SaveToListSheet() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const placeholder = useColor('text-muted')
  const accent = useColor('accent')
  const keyboard = useResolvedTheme() === 'night' ? 'dark' : 'light'
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
      <View className="flex-row items-start justify-between gap-3 px-5 pt-5">
        <View className="min-w-0 flex-1">
          {itemName ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-label text-text-muted"
            >
              {itemName}
            </Text>
          ) : null}
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-1 font-serif text-serif-lg text-text"
          >
            {hasItem ? t('saveToList.title') : t('saveToList.new_list_title')}
          </Text>
          {hasItem ? (
            <Caption className="mt-1.5 text-pill">{t('saveToList.subtitle')}</Caption>
          ) : null}
        </View>
        <IconButton
          accessibilityLabel={t('comments.close')}
          onPress={() => router.back()}
          icon={<CloseIcon size={18} color="text" />}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pt-5 pb-10"
      >
        {hasItem ? (
          q.isPending ? (
            <RowsSkeleton rows={3} />
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()}>{t('saveToList.load_error')}</ErrorState>
          ) : lists.length > 0 ? (
            <Group>
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
                    className={`min-h-[60px] flex-row items-center gap-3 py-2.5 active:opacity-70 ${i === lists.length - 1 ? '' : 'border-line border-b'}`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={MAX_SCALE}
                        className="font-ui-semibold text-body text-text"
                      >
                        {list.name}
                      </Text>
                      <Caption className="text-meta">
                        {t('saveToList.item_count', { n: list.itemCount })}
                      </Caption>
                    </View>
                    <CheckCircle on={checked} />
                  </Pressable>
                )
              })}
            </Group>
          ) : (
            <Caption className="mb-1 px-1">{t('saveToList.no_lists')}</Caption>
          )
        ) : null}

        {toggle.isError ? (
          <Caption className="mt-2 px-1 text-danger">{t('saveToList.toggle_error')}</Caption>
        ) : null}

        {creating ? (
          <Card className="mt-3 px-4 py-4">
            {hasItem ? (
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui-semibold text-label text-text-muted"
              >
                {t('saveToList.new_list_title')}
              </Text>
            ) : null}
            {/* Cover + name side by side, like a playlist: the photo is
                optional (a list without one shows its latest spot's photo). */}
            <View className={`${hasItem ? 'mt-3' : ''} flex-row items-center gap-3`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('saveToList.cover_label')}
                onPress={async () => {
                  const uri = await pickDishPhoto()
                  if (uri) setCover(uri)
                }}
                className="h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-[18px] border-[1.5px] border-dashed border-line-strong active:opacity-70"
              >
                {cover ? (
                  <Image
                    source={{ uri: cover }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <>
                    <PlusIcon size={18} color="text-2" />
                    <Text
                      maxFontSizeMultiplier={1}
                      className="mt-0.5 font-ui text-eyebrow text-text-muted"
                    >
                      {t('saveToList.cover_add')}
                    </Text>
                  </>
                )}
              </Pressable>
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                placeholder={t('saveToList.name_placeholder')}
                placeholderTextColor={placeholder}
                selectionColor={accent}
                keyboardAppearance={keyboard}
                maxLength={40}
                returnKeyType="next"
                maxFontSizeMultiplier={MAX_SCALE}
                className="min-h-[48px] flex-1 border-line border-b font-serif text-serif-md text-text"
              />
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('saveToList.description_placeholder')}
              placeholderTextColor={placeholder}
              selectionColor={accent}
              keyboardAppearance={keyboard}
              maxLength={300}
              multiline
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-4 min-h-[72px] rounded-sm bg-bg px-3 py-3 font-ui text-body text-text"
            />
            <View className="mt-3 flex-row flex-wrap gap-1.5">
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
            {createError ? <Caption className="mt-3 text-danger">{createError}</Caption> : null}
            <Button
              size="sm"
              className="mt-4 w-full"
              disabled={!trimmed}
              loading={create.isPending}
              onPress={() => create.mutate(trimmed)}
            >
              {create.isPending ? t('saveToList.creating') : t('saveToList.create_button')}
            </Button>
          </Card>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCreating(true)}
            className="mt-3 min-h-[56px] flex-row items-center justify-center gap-2 rounded-group border-[1.5px] border-dashed border-line-strong px-4 active:opacity-70"
          >
            <PlusIcon size={18} color="text-2" />
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-pill text-text-2"
            >
              {t('saveToList.new_list_cta')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
