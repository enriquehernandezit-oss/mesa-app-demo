import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { cuisineLabel, priceLabel } from '@/lib/display'

// A place as a row shows it (the rank flow's Find list and note step, Your list's saved places): its picture (the photo, else the name card), its
// name in the serif, one line of "cuisine · neighborhood · $$", and whatever belongs at the
// right (a score, "Not ranked"). `note` is an optional third line in the accent (what you
// ordered, an occasion).
export function PlaceLine({
  name,
  coverImageId,
  cuisine,
  neighborhood,
  priceTier,
  extra,
  note,
  picture = 52,
  nameClass = 'text-serif-sm',
  right,
}: {
  name: string
  coverImageId?: string | null
  cuisine?: string | null
  neighborhood?: string | null
  priceTier?: number | null
  // Appended to the meta line (e.g. the distance).
  extra?: string | null
  note?: string | null
  picture?: number
  nameClass?: string
  right?: ReactNode
}) {
  const meta = [cuisineLabel(cuisine), neighborhood, priceLabel(priceTier), extra]
    .filter(Boolean)
    .join(' · ')
  return (
    <View className="flex-row items-center gap-3">
      <View className="overflow-hidden rounded-[16px]" style={{ width: picture, height: picture }}>
        <PlaceCover
          name={name}
          coverImageId={coverImageId}
          size={{ w: picture * 3, h: picture * 3 }}
          className="h-full w-full rounded-none"
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className={`font-serif text-text ${nameClass}`}
        >
          {name}
        </Text>
        {meta ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-0.5 font-ui text-meta text-text-muted"
          >
            {meta}
          </Text>
        ) : null}
        {note ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-0.5 font-ui-semibold text-micro text-accent"
          >
            {note}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}
