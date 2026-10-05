import { useMutation } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, useRouter } from 'expo-router'
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { EventTicket, useNow } from '@/components/events/EventTicket'
import { IconButton, MAX_SCALE } from '@/components/ui'
import { BookmarkFilledIcon, CloseIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { PlaceLine } from '@/components/ui/PlaceLine'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { invalidateAfterSavedDish, invalidateAfterSavedPlace } from '@/lib/invalidateAfterSocial'
import { imageUrl } from '@/lib/media'
import type { EventSummary, SavedDish, SavedPlace } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// A saved event is the same ticket card as in Explore, so its bookmark and "I'm going" work
// right here; the countdown keeps its own minute tick.
export function SavedEventTicket({ e, index }: { e: EventSummary; index: number }) {
  const now = useNow()
  return <EventTicket e={e} index={index} now={now} />
}

// A place you saved to try: a raised card with its picture, name and meta, a small solid Rank
// pill, and a close to un-save it. (No swipe-to-remove here: the swipeable clips its child, and a
// raised card's shadow lives outside its box.)
export const SavedPlaceRow = memo(function SavedPlaceRow({ saved }: { saved: SavedPlace }) {
  const router = useRouter()
  const t = useT()
  const lift = useLift()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/${saved.restaurant.id}`),
    onSuccess: () => invalidateAfterSavedPlace(saved.restaurant.id),
    onError: () =>
      toast({
        variant: 'error',
        message: t('restaurant.unsave_error'),
        action: { label: t('common.retry'), onClick: () => remove.mutate() },
      }),
  })
  return (
    <View
      className={`mb-2 flex-row items-center gap-2.5 rounded-group bg-surface px-3 py-2.5 ${remove.isPending ? 'opacity-60' : ''}`}
      style={lift}
    >
      <Link href={`/r/${saved.restaurant.id}`} asChild>
        <Pressable accessibilityRole="button" className="min-w-0 flex-1 active:opacity-80">
          <PlaceLine
            name={saved.restaurant.name}
            coverImageId={saved.restaurant.coverImageId}
            cuisine={saved.restaurant.cuisine}
            neighborhood={saved.neighborhood}
            priceTier={saved.restaurant.priceTier}
            picture={54}
          />
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/rank?restaurant=${saved.restaurant.id}`)}
        className="h-[34px] items-center justify-center rounded-pill bg-ink px-3.5 active:opacity-85"
      >
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-on-ink">
          {t('rankings.rank_button')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('rankings.remove')}
        disabled={remove.isPending}
        onPress={() => remove.mutate()}
        hitSlop={6}
        className="h-[34px] w-[30px] items-center justify-center active:opacity-60"
      >
        <CloseIcon size={16} color="text-muted" strokeWidth={2} />
      </Pressable>
    </View>
  )
})

// Two saved dishes side by side: a photo (else the dish's name on a card), its name in the
// serif, the place it is from. The filled bookmark on the photo un-saves it.
export function SavedDishPair({ a, b }: { a: SavedDish; b?: SavedDish }) {
  return (
    <View className="mb-4 flex-row gap-2.5">
      <SavedDishTile saved={a} />
      {b ? <SavedDishTile saved={b} /> : <View className="flex-1" />}
    </View>
  )
}

const SavedDishTile = memo(function SavedDishTile({ saved }: { saved: SavedDish }) {
  const t = useT()
  const remove = useMutation({
    mutationFn: () => api.del(`/saved/dishes/${saved.dish.id}`),
    onSuccess: () => invalidateAfterSavedDish(saved.dish.id),
    onError: () =>
      toast({
        variant: 'error',
        message: t('save.unsave_error'),
        action: { label: t('common.retry'), onClick: () => remove.mutate() },
      }),
  })
  const photo = imageUrl(saved.dish.imageId, { w: 500, h: 450 })
  return (
    <View className={`flex-1 ${remove.isPending ? 'opacity-60' : ''}`}>
      <Link href={`/dish/${saved.dish.id}`} asChild>
        <Pressable accessibilityRole="button" className="active:opacity-80">
          <View className="h-[150px] overflow-hidden rounded-group bg-bg-sunk">
            {photo ? (
              <Image
                source={{ uri: photo }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <PlaceCover
                name={saved.dish.name}
                size={{ w: 500, h: 450 }}
                className="h-full w-full rounded-none"
              />
            )}
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-[7px] font-serif text-serif-sm text-text"
          >
            {saved.dish.name}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui text-micro text-text-muted"
          >
            {saved.restaurant.name}
          </Text>
        </Pressable>
      </Link>
      <View className="absolute right-2 top-2">
        <IconButton
          size={30}
          accessibilityLabel={t('rankings.remove')}
          onPress={() => remove.mutate()}
          icon={<BookmarkFilledIcon size={14} color="accent" />}
        />
      </View>
    </View>
  )
})
