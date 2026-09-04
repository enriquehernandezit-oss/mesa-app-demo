import { Caption } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics } from '@/components/ui/patterns'
import { displayScore } from '@/lib/display'
import { DATA_FIGURES } from '@/theme/vars'
import { Pressable, Text, View } from 'react-native'

// The photo-topped comparison card shared by the rank flow's "¿Cuál estuvo
// mejor?" (B2). A photo over paper, the name + characteristics, an optional
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="overflow-hidden rounded border border-line bg-surface active:opacity-90"
    >
      <PlaceCover
        seed={item.id}
        name={item.name}
        coverImageId={item.coverImageId}
        size={{ w: 700, h: 340 }}
        className="h-28 w-full"
      />
      <View className="flex-row items-center gap-3 p-3">
        <View className="flex-1">
          <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
            {item.name}
          </Text>
          <Characteristics
            priceTier={item.priceTier}
            cuisine={item.cuisine}
            neighborhood={item.neighborhood}
          />
          {subline ? (
            <Caption className="mt-1 font-mono text-micro text-text-muted">{subline}</Caption>
          ) : null}
        </View>
        {score != null ? (
          <View className="h-11 w-11 items-center justify-center rounded-pill border border-accent">
            <Text style={DATA_FIGURES} className="font-serif text-serif-sm text-accent">
              {displayScore(score)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
