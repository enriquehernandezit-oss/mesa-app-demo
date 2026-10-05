import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { ScreenHeader } from '@/components/ScreenHeader'
import {
  Body,
  Button,
  Caption,
  EmptyState,
  ErrorState,
  IconButton,
  MAX_SCALE,
  Skeleton,
} from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { CameraIcon, MoreIcon, ShareIcon } from '@/components/ui/icons'
import { ScoreStack } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { pickDishPhoto } from '@/lib/dishPhoto'
import { cuisineLabel, priceLabel } from '@/lib/display'
import { captureError } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import { shareListCard } from '@/lib/shareCardStore'
import { collectionShareText } from '@/lib/shareList'
import type { CollectionDetail, CollectionItem } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// One named list's full contents (M19). Restaurant items show "Already went ·
// #N" once ranked since being added — see routes/collections.ts's own
// header for why ranking a place never drops it from a named list the way
// it clears the master saved_places one. Redesign 2: the cover big and centred (tap it to change
// it), the name in the serif, how many are saved, its description edited in place, then the
// places as raised rows; share and "···" (delete) are round chips in the header.
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      // The counts and covers on "Tus listas".
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
    onError: () => toast({ variant: 'error', message: t('saveToList.toggle_error') }),
  })

  const lift = useLift('float')
  const [editingBio, setEditingBio] = useState(false)
  const [bio, setBio] = useState('')
  const update = useMutation({
    mutationFn: (patch: { description?: string | null; coverImageId?: string | null }) =>
      api.patch(`/collections/${collectionId}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
    onError: () => toast({ variant: 'error', message: t('collections.update_error') }),
  })

  const deleteList = useMutation({
    mutationFn: () => api.del(`/collections/${collectionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      goBack()
    },
    onError: (err) => {
      captureError(err, 'collections.deleteList')
      toast({ variant: 'error', message: t('collections.delete_error') })
    },
  })

  // The "···" menu: Mesa's own chooser, then — for delete — the native single-destructive confirm.
  async function openMenu() {
    const i = await showSheet({
      title: q.data?.name,
      options: [{ label: t('collections.delete_list'), destructive: true }],
    })
    if (i === 0) await confirmDeleteList()
  }

  async function confirmDeleteList() {
    const picked = await showActionSheet({
      title: t('collections.delete_confirm_title'),
      options: [{ label: t('collections.delete_button'), destructive: true }],
    })
    if (picked === 0) deleteList.mutate()
  }

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="items-center gap-3 px-5">
          <Skeleton height={160} width={160} />
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
          <EmptyState>{t('collections.not_found')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('collections.load_error')}</ErrorState>
        )}
      </View>
    )
  }

  const { name, items, description, coverImageId } = q.data
  // Cover: the list's own photo, else its first item's — same fallback the
  // lists grid uses (the API's previewImageId).
  const firstImage = items.find((i) => i.restaurant?.coverImageId)?.restaurant?.coverImageId ?? null
  const shareCollection = () =>
    shareListCard({
      eyebrow: name,
      subtitle: t('saveToList.item_count', { n: items.length }),
      items: items.map((item, i) => ({
        position: i + 1,
        name: item.restaurant?.name ?? item.dish?.name ?? '',
        score: item.restaurant?.myRanking?.score,
      })),
      coverUrl: imageUrl(coverImageId ?? firstImage, { w: 1080, h: 780 }),
      text: collectionShareText(name, collectionId),
    })

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        onBack={goBack}
        backLabel={t('common.back_plain')}
        right={
          <View className="flex-row items-center gap-2">
            {items.length > 0 && (
              <IconButton
                accessibilityLabel={t('collections.share_label')}
                onPress={shareCollection}
                icon={<ShareIcon size={18} color="text" />}
              />
            )}
            <IconButton
              accessibilityLabel={t('rankings.more_actions')}
              onPress={openMenu}
              icon={<MoreIcon size={18} color="text" />}
            />
          </View>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="pb-10"
      >
        {/* Playlist-style header: a big cover (tap to change it), the name, and an optional
            description edited in place. */}
        <View className="items-center px-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('saveToList.cover_label')}
            onPress={async () => {
              const uri = await pickDishPhoto()
              if (uri) update.mutate({ coverImageId: uri })
            }}
            className="active:opacity-80"
          >
            <View className="rounded-[30px] bg-surface" style={lift}>
              <View className="h-[160px] w-[160px] overflow-hidden rounded-[30px]">
                <PlaceCover
                  name={name}
                  coverImageId={coverImageId ?? firstImage}
                  size={{ w: 480, h: 480 }}
                  className="h-full w-full rounded-none"
                />
              </View>
            </View>
            <View className="absolute -right-0.5 bottom-1 h-[30px] w-[30px] items-center justify-center rounded-pill border-2 border-bg bg-ink">
              <CameraIcon size={15} color="on-ink" />
            </View>
          </Pressable>
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-4 text-center font-serif text-serif-lg text-text"
          >
            {name}
          </Text>
          <Caption className="mt-1 text-pill">
            {t('saveToList.item_count', { n: items.length })}
          </Caption>
        </View>

        <View className="mt-2 px-5">
          {editingBio ? (
            <View className="w-full">
              <Field
                autoFocus
                value={bio}
                onChangeText={setBio}
                multiline
                multilineBox
                maxLength={300}
                placeholder={t('saveToList.description_placeholder')}
              />
              {/* Explicit Save / Cancel — it used to save silently on blur,
                  with nothing on screen saying how to commit the edit. */}
              <View className="mt-3 flex-row gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-[44px] flex-1"
                  onPress={() => setEditingBio(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  className="min-h-[44px] flex-1"
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
              <Body className="mt-1 text-center text-subhead">{description}</Body>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setBio('')
                setEditingBio(true)
              }}
              className="min-h-[36px] items-center justify-center active:opacity-60"
            >
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui-semibold text-pill text-accent"
              >
                {t('collections.add_description')}
              </Text>
            </Pressable>
          )}
        </View>

        <View className="mt-4 px-4">
          {items.length === 0 ? (
            <EmptyState>{t('collections.empty_list')}</EmptyState>
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
        </View>
      </ScrollView>
    </View>
  )
}

// A raised row: the place's (or dish's) picture, its name and meta, and at the right either the
// score you gave it since adding it ("Already went · #41") or a quiet red Remove.
function CollectionItemRow({
  item,
  removing,
  onRemove,
}: {
  item: CollectionItem
  // Guards the "Remove" Pressable below — removeItem is one shared mutation
  // for the whole list, so this goes true for every row while ANY of them is
  // mid-delete. A fast double-tap otherwise fired two overlapping DELETEs
  // with no feedback in between, reading as "nothing happened, tap again."
  removing: boolean
  onRemove: () => void
}) {
  const t = useT()
  const lift = useLift()
  const place = item.restaurant
  const dish = item.dish
  if (!place && !dish) return null
  const name = place?.name ?? dish?.name ?? ''
  const meta = place
    ? [cuisineLabel(place.cuisine), place.neighborhood, priceLabel(place.priceTier)]
        .filter(Boolean)
        .join(' · ')
    : null
  const remove = (
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
      className={`min-h-[36px] justify-center px-1 active:opacity-60 ${removing ? 'opacity-40' : ''}`}
    >
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-danger">
        {t('rankings.remove')}
      </Text>
    </Pressable>
  )
  return (
    <Link href={place ? `/r/${place.id}` : `/dish/${dish?.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mb-2 flex-row items-center gap-3 rounded-group bg-surface py-2.5 pl-3 pr-3.5 active:opacity-80"
        style={lift}
      >
        <View className="h-[50px] w-[50px] overflow-hidden rounded-[15px]">
          <PlaceCover
            name={name}
            coverImageId={place?.coverImageId ?? dish?.imageId}
            size={{ w: 150, h: 150 }}
            className="h-full w-full rounded-none"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {name}
          </Text>
          {meta ? (
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-ui text-meta text-text-muted"
            >
              {meta}
            </Text>
          ) : null}
        </View>
        {place?.myRanking ? (
          <ScoreStack
            score={place.myRanking.score}
            size="sm"
            label={t('collections.already_went', { n: place.myRanking.position })}
          />
        ) : (
          remove
        )}
      </Pressable>
    </Link>
  )
}
