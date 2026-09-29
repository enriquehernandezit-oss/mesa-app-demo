import { Pressable, Text, View } from 'react-native'

import { Caption } from '@/components/ui'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useLift } from '@/theme/useLift'

// The photo-topped comparison card (r28) shared by the rank flow's "¿Cuál estuvo
// mejor?" and onboarding's. A photo over paper, the name + characteristics, an optional
// subline ("nuevo en tu lista" / "#4 en tu lista"), and — for an already-ranked
// incumbent — its score circle. Ported from apps/app/src/components/ui/
// CompareCard.tsx.
export interface CompareCardItem {
  id: string
  name: string
  cuisine: string | null
  neighborhood: string | null
  coverImageId?: string | null
  priceTier?: number | null
}

export function CompareCard({
  item,
  subline,
  score,
  onPress,
}: {
  item: CompareCardItem
  subline?: string | null
  score?: number | null
  onPress?: () => void
}) {
  const lift = useLift()
  return (
    // Two views: the outer carries the lift (a shadow is clipped by an overflow
    // on its own view), the inner rounds the photo's corners.
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-[28px] bg-surface active:opacity-90"
      style={lift}
    >
      <View className="overflow-hidden rounded-[28px]">
        <PlaceCover
          seed={item.id}
          name={item.name}
          coverImageId={item.coverImageId}
          size={{ w: 700, h: 340 }}
          className="h-[132px] w-full"
        />
        <View className="flex-row items-center gap-3 px-4 pb-3.5 pt-3">
          <View className="flex-1">
            <Text className="font-serif text-serif-xl text-text" numberOfLines={1}>
              {item.name}
            </Text>
            <Characteristics
              priceTier={item.priceTier}
              cuisine={item.cuisine}
              neighborhood={item.neighborhood}
            />
            {subline ? (
              <Caption className="mt-1 text-micro text-text-muted">{subline}</Caption>
            ) : null}
          </View>
          {score != null ? (
            <ScoreBadge size="sm" score={score} attribution={{ kind: 'stated' }} />
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}
