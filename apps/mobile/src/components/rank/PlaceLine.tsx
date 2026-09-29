import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { cuisineLabel, priceLabel } from '@/lib/display'

// A place as the rank flow shows it in a row: its picture (the photo, else the name card), its
// name in the serif, one line of "cuisine · neighborhood · $$", and whatever belongs at the
// right (a score, "Not ranked"). Used by the Find list and the note step's header.
export function PlaceLine({
  name,
  coverImageId,
  cuisine,
  neighborhood,
  priceTier,
  extra,
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
      </View>
      {right}
    </View>
  )
}
