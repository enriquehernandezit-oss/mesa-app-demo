import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { ChevronIcon } from '@/components/ui/icons'
import { ScoreBadge } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { cuisineLabel, priceLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { MapSpot } from '@/lib/types'

// The chosen spot, as a glass card over the map: its picture (the photo, else the name card), name,
// "cuisine · neighborhood · $$ · 1.2 km", the friends' score — and a chevron into the place.
export function SpotCard({
  spot,
  distance,
  bottom,
}: {
  spot: MapSpot
  distance: string | null
  bottom: number
}) {
  const t = useT()
  const meta = [cuisineLabel(spot.cuisine), spot.neighborhood, priceLabel(spot.priceTier), distance]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link href={`/r/${spot.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spot.name}
        className="absolute inset-x-4 active:opacity-90"
        style={{ bottom }}
      >
        <Glass variant="bar" radius={28} className="flex-row items-center gap-3 p-2.5">
          <View className="h-[72px] w-[72px] overflow-hidden rounded-[20px]">
            <PlaceCover
              name={spot.name}
              coverImageId={spot.coverImageId}
              size={{ w: 220, h: 220 }}
              className="h-full w-full rounded-none"
            />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-serif text-serif-md text-text"
            >
              {spot.name}
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
            {spot.friendCount > 0 && spot.friendAvg != null ? (
              <View className="mt-1.5 items-start">
                <ScoreBadge
                  size="sm"
                  score={spot.friendAvg}
                  attribution={{ kind: 'friends', count: spot.friendCount }}
                />
              </View>
            ) : (
              <Caption numberOfLines={1} className="mt-1">
                {t('map.nobody_ranked')}
              </Caption>
            )}
          </View>
          {/* Not a button of its own: the whole card is the link. */}
          <View className="h-[38px] w-[38px] items-center justify-center rounded-pill bg-chip">
            <ChevronIcon size={16} color="text" />
          </View>
        </Glass>
      </Pressable>
    </Link>
  )
}
