import { Link } from 'expo-router'
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { ScoreStack } from '@/components/ui/patterns'
import { PlaceLine } from '@/components/ui/PlaceLine'
import { useT } from '@/lib/i18n'
import type { ExploreHit } from '@/lib/types'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// One place in Explore's results: a raised card — its rank, its picture (the photo, else the name
// card), its name over "cuisine · neighborhood · $$" and how many friends ranked it, and the score
// of those friends at the right (or "Be the first" when no one has).
//
// Wrapped in memo(): `setQ` (the native search bar's onChangeText) updates the screen's state on
// every keystroke, well before the debounced query refires, so without this every mounted row
// re-renders under a finger that's still on the glass.
export const HitRow = memo(function HitRow({ r, index }: { r: ExploreHit; index: number }) {
  const t = useT()
  const lift = useLift()
  const ranked = r.friendCount > 0 && r.friendAvg != null
  return (
    <Link href={`/r/${r.id}`} asChild>
      <Pressable
        className="mb-2 flex-row items-center gap-3 rounded-group bg-surface py-2.5 pr-3.5 pl-3 active:opacity-80"
        style={lift}
      >
        {/* No adjustsFontSizeToFit: iOS binary-searches a font size on the UI thread for every
            layout pass it's on, and this column holds 1–3 digits. */}
        <Text
          style={[DATA_FIGURES, { minWidth: 18 }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
          className="text-center font-serif text-serif-sm text-text-muted"
        >
          {index + 1}
        </Text>
        <View className="min-w-0 flex-1">
          <PlaceLine
            name={r.name}
            coverImageId={r.coverImageId}
            cuisine={r.cuisine}
            // Imported rows often carry an address but no mapped sector — fall back so the row
            // still says where the place is.
            neighborhood={r.neighborhood ?? r.address}
            priceTier={r.priceTier}
            picture={54}
            sub={ranked ? t('friends.count_badge', { n: r.friendCount }) : null}
            right={
              ranked ? (
                <ScoreStack score={r.friendAvg as number} />
              ) : r.isNew ? (
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-eyebrow text-text"
                >
                  {t('explore.be_first')}
                </Text>
              ) : null
            }
          />
        </View>
      </Pressable>
    </Link>
  )
})
