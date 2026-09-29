import { useRouter } from 'expo-router'
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { ScoreStack } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useT } from '@/lib/i18n'
import { friendLine } from '@/lib/popularFriends'
import type { PopularItem } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'

// One place on the Popular list: its rank, its picture (the photo, else the name card),
// its name — with a "New" pill when it was added in the last three weeks — then
// "cuisine · neighborhood", the line about the friends who ranked it, and its score at the
// right. A row, not a card: hairline between rows, the whole row opens the place.
export const PopularRow = memo(function PopularRow({
  item,
  rank,
}: {
  item: PopularItem
  rank: number
}) {
  const t = useT()
  const router = useRouter()
  const { restaurant: r } = item
  const friends = friendLine(t, item.friends)
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/r/${r.id}`)}
      className="mx-5 flex-row items-center gap-3 border-b border-line py-2.5 active:opacity-80"
    >
      <Text
        style={DATA_FIGURES}
        maxFontSizeMultiplier={MAX_SCALE}
        className="w-5 font-serif text-serif-md text-text-muted"
      >
        {rank}
      </Text>
      <View className="h-[54px] w-[54px] overflow-hidden rounded-[16px]">
        <PlaceCover
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 120, h: 120 }}
          className="h-full w-full rounded-none"
        />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="shrink font-serif text-serif-sm text-text"
          >
            {r.name}
          </Text>
          {item.isNew ? (
            <View className="h-[18px] justify-center rounded-[9px] bg-accent-fill px-[7px]">
              <Text className="font-ui-semibold text-eyebrow text-on-accent">
                {t('home.new_badge')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="mt-0.5 font-ui text-meta text-text-muted"
        >
          {[r.cuisine, r.neighborhood].filter(Boolean).join(' · ')}
        </Text>
        {friends ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-0.5 font-ui text-micro text-text-2"
          >
            {friends}
          </Text>
        ) : null}
      </View>
      <ScoreStack score={item.score} />
    </Pressable>
  )
})
