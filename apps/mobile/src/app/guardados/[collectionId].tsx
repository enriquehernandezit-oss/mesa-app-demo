import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, EmptyState, ErrorState, Skeleton, Title } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { ListIcon } from '@/components/ui/icons'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { pickDishPhoto } from '@/lib/dishPhoto'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { cloudinaryUrl } from '@/lib/media'
import type { CollectionDetail, CollectionItem } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

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

  const placeholder = useColor('text-muted')
  const [editingBio, setEditingBio] = useState(false)
  const [bio, setBio] = useState('')
  const update = useMutation({
    mutationFn: (patch: { description?: string | null; coverImageId?: string | null }) =>
      api.patch(`/collections/${collectionId}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
    onError: () => toast({ variant: 'error', message: t('guardados.update_error') }),
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

  const { name, items, description, coverImageId } = q.data
  // Cover: the list's own photo, else its first item's — same fallback the
  // lists rail uses (the API's previewImageId).
  const firstImage = items.find((i) => i.restaurant?.coverImageId)?.restaurant?.coverImageId ?? null
  const cover = cloudinaryUrl(coverImageId ?? firstImage, { w: 480, h: 480 })

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pb-10"
      >
        {/* Playlist-style header: a big cover (tap to change it), the name,
            and an optional description edited in place. */}
        <View className="mb-4 items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('guardar.cover_label')}
            onPress={async () => {
              const uri = await pickDishPhoto()
              if (uri) update.mutate({ coverImageId: uri })
            }}
            className="h-40 w-40 items-center justify-center overflow-hidden rounded-card border border-line bg-bg-sunk active:opacity-80"
          >
            {cover ? (
              <Image
                source={{ uri: cover }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : (
              <>
                <ListIcon size={28} color="text-muted" />
                <Caption className="mt-2">{t('guardar.cover_add')}</Caption>
              </>
            )}
          </Pressable>
          <Title className="mt-4 text-center">{name}</Title>
          <Caption className="mt-1">{t('guardar.item_count', { n: items.length })}</Caption>
          {editingBio ? (
            <View className="mt-3 w-full">
              <TextInput
                autoFocus
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={300}
                placeholder={t('guardar.description_placeholder')}
                placeholderTextColor={placeholder}
                className="min-h-[72px] w-full rounded-sm border border-line bg-surface px-3 py-3 font-ui text-body text-text"
              />
              {/* Explicit Save / Cancel — it used to save silently on blur,
                  with nothing on screen saying how to commit the edit. */}
              <View className="mt-3 flex-row gap-3">
                <Button
                  variant="secondary"
                  className="w-auto flex-1"
                  onPress={() => setEditingBio(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  className="w-auto flex-1"
                  loading={update.isPending}
                  onPress={() =>
                    update.mutate(
                      { description: bio.trim() || null },
                      { onSuccess: () => setEditingBio(false) },
                    )
                  }
                >
                  {t('rankings.save')}
                </Button>
              </View>
            </View>
          ) : description ? (
            <Pressable
              onPress={() => {
                setBio(description)
                setEditingBio(true)
              }}
              className="active:opacity-70"
            >
              <Body className="mt-3 text-center">{description}</Body>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setBio('')
                setEditingBio(true)
              }}
              className="mt-2 min-h-[36px] justify-center active:opacity-60"
            >
              <Caption className="font-ui-semibold text-accent-strong">
                {t('guardados.add_description')}
              </Caption>
            </Pressable>
          )}
        </View>
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
        <Pressable className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80">
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
              accessibilityState={{ disabled: removing }}
              hitSlop={8}
              // Not RN's `disabled` prop: this Pressable is nested inside a
              // `Link asChild` Pressable, and a `disabled` inner one lets the
              // tap fall through to the outer Link — which then navigated to
              // the restaurant instead of doing nothing, right as the row was
              // mid-delete. Guarding inside the handler keeps the tap here.
              onPress={() => {
                if (!removing) onRemove()
              }}
              className={`min-h-[36px] justify-center px-2 active:opacity-60 ${removing ? 'opacity-40' : ''}`}
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
        <Pressable className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80">
          <View className="flex-1">
            <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
              {d.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: removing }}
            hitSlop={8}
            onPress={() => {
              if (!removing) onRemove()
            }}
            className={`min-h-[36px] justify-center px-2 active:opacity-60 ${removing ? 'opacity-40' : ''}`}
          >
            <Caption className="text-status-packed">{t('rankings.remove')}</Caption>
          </Pressable>
        </Pressable>
      </Link>
    )
  }
  return null
}
