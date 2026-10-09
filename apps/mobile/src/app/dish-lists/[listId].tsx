import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { MentionText } from '@/components/MentionText'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  Button,
  Caption,
  EmptyState,
  ErrorState,
  IconButton,
  MAX_SCALE,
  Skeleton,
} from '@/components/ui'
import { ShareIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { cuisineLabel, priceLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import { shareListCard } from '@/lib/shareCardStore'
import { dishListShareText } from '@/lib/shareList'
import type { DishListDetail, DishListEntry } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'

// One dish list's full contents (M20) — "Your best carbonara". Ranked entries show their
// position; anything in `unranked` (a place that's posted this dish since the last ranking, or
// before the member got to a nudge) sits below, dimmed, with a CTA back into the pairwise flow.
// Redesign 2: a large serif title with the count under it, flat hairline rows (a serif numeral,
// the picture, the place, your words about the dish), then "N to rank".
export default function DishListDetailScreen() {
  const t = useT()
  const router = useRouter()
  const { listId } = useLocalSearchParams<{ listId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/dish-lists'))

  const q = useQuery({
    queryKey: ['dish-list', listId],
    queryFn: () => api.get<DishListDetail>(`/dish-lists/${listId}`),
    retry: false,
  })

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
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <ErrorState onRetry={() => q.refetch()}>{t('dishLists.load_error')}</ErrorState>
      </View>
    )
  }

  const { label, ranked, unranked, owner } = q.data
  // Someone else's list, opened from a shared link: their ranked order, nothing to act on.
  const isOwner = q.data.isOwner !== false
  const title = isOwner
    ? t('dishLists.your_best', { label })
    : t('dishLists.their_best', { label, name: owner?.name ?? '' })
  const shareDishList = () =>
    shareListCard({
      eyebrow: title,
      subtitle: t('dishLists.ranked_count', { n: ranked.length }),
      items: ranked.map((entry) => ({ position: entry.position, name: entry.restaurant.name })),
      coverUrl: imageUrl(ranked[0]?.dish.imageId ?? ranked[0]?.restaurant.coverImageId, {
        w: 1080,
        h: 780,
      }),
      text: dishListShareText(label, listId),
    })

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        onBack={goBack}
        backLabel={t('common.back_plain')}
        right={
          ranked.length > 0 ? (
            <IconButton
              accessibilityLabel={t('dishLists.share_label')}
              onPress={shareDishList}
              icon={<ShareIcon size={18} color="text" />}
            />
          ) : undefined
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="px-5">
          <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-display text-text">
            {title}
          </Text>
          {ranked.length > 0 ? (
            <Caption className="mt-1.5 text-pill">
              {t('dishLists.ranked_count', { n: ranked.length })}
            </Caption>
          ) : null}
        </View>

        <View className="mt-3">
          {ranked.length === 0 ? (
            <EmptyState>{t('dishLists.not_ranked_yet')}</EmptyState>
          ) : (
            ranked.map((entry) => <RankedRow key={entry.restaurant.id} entry={entry} />)
          )}
        </View>

        {unranked.length > 0 && (
          <View className="mt-4">
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="px-5 pb-2 font-ui-semibold text-label text-text-muted"
            >
              {t('dishLists.unranked_count', { n: unranked.length })}
            </Text>
            {unranked.map((entry) => (
              <View
                key={entry.restaurant.id}
                className="flex-row items-center gap-3 px-5 py-2 opacity-70"
              >
                <View className="h-[48px] w-[48px] overflow-hidden rounded-[14px]">
                  <PlaceCover
                    name={entry.restaurant.name}
                    coverImageId={entry.dish.imageId ?? entry.restaurant.coverImageId}
                    size={{ w: 150, h: 150 }}
                    className="h-full w-full rounded-none"
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-serif text-serif-sm text-text"
                  >
                    {entry.restaurant.name}
                  </Text>
                  <EntryMeta entry={entry} />
                </View>
              </View>
            ))}
            <View className="px-4 pt-3">
              <Button onPress={() => router.push(`/dish-lists/rank?listId=${listId}`)}>
                {t('dishLists.rank_more_button', { n: unranked.length })}
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function EntryMeta({ entry }: { entry: DishListEntry }) {
  const { restaurant } = entry
  const meta = [
    cuisineLabel(restaurant.cuisine),
    restaurant.neighborhood,
    priceLabel(restaurant.priceTier),
  ]
    .filter(Boolean)
    .join(' · ')
  if (!meta) return null
  return (
    <Text
      numberOfLines={2}
      maxFontSizeMultiplier={MAX_SCALE}
      className="mt-0.5 font-ui text-meta text-text-muted"
    >
      {meta}
    </Text>
  )
}

function RankedRow({ entry }: { entry: DishListEntry & { position: number } }) {
  const { restaurant, dish, position } = entry
  return (
    <Link href={`/r/${restaurant.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mx-5 flex-row items-center gap-3 border-line border-b py-2.5 active:opacity-80"
      >
        <Text
          style={DATA_FIGURES}
          maxFontSizeMultiplier={MAX_SCALE}
          className="w-[28px] font-serif text-serif-xl text-text-muted"
        >
          {position}
        </Text>
        <View className="h-[56px] w-[56px] overflow-hidden rounded-[16px]">
          <PlaceCover
            name={restaurant.name}
            coverImageId={dish.imageId ?? restaurant.coverImageId}
            size={{ w: 168, h: 168 }}
            className="h-full w-full rounded-none"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {restaurant.name}
          </Text>
          <EntryMeta entry={entry} />
          {dish.caption ? (
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-ui text-label text-text-2"
            >
              <MentionText text={dish.caption} />
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  )
}
