import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SaveButton } from '@/components/SaveButton'
import { MAX_SCALE } from '@/components/ui'
import { DirectionsIcon, PlusIcon } from '@/components/ui/icons'
import { openDirections } from '@/lib/directions'
import { useT } from '@/lib/i18n'
import { useLift } from '@/theme/useLift'

// The place page's floating bar: a dark pill in both themes holding the one ranking action —
// burgundy "Rank it" ("Rank again" once you have) — a cream save circle, and Directions.
// Nothing else on the page repeats the ranking action. Absolutely placed over the scroll.
//
// Three things share one 370pt row, so the copy has to be short: Directions has its own short
// label here (Spanish "Ruta", not "Cómo llegar" — with "Rankear otra vez" beside it the letters
// ran out of the pill), and the ranking label may shrink and truncate inside its pill rather
// than ever spill out of it, at any text size.
export const RANK_BAR_HEIGHT = 70

export function useRankBarBottom(): number {
  const insets = useSafeAreaInsets()
  return Math.max(insets.bottom - 10, 16)
}

export function RankBar({
  restaurantId,
  name,
  ranked,
  saved,
  lat,
  lng,
}: {
  restaurantId: string
  name: string
  ranked: boolean
  saved: boolean
  lat: number
  lng: number
}) {
  const t = useT()
  const router = useRouter()
  const bottom = useRankBarBottom()
  const lift = useLift('float')
  return (
    <View
      className="absolute inset-x-4 flex-row items-center gap-2 rounded-pill bg-bar px-[9px]"
      style={[{ bottom, height: RANK_BAR_HEIGHT }, lift]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/rank?restaurant=${restaurantId}`)}
        className="h-[52px] min-w-0 flex-1 flex-row items-center justify-center gap-2 overflow-hidden rounded-pill bg-accent-fill px-3 active:opacity-85"
      >
        <PlusIcon size={18} color="on-accent" strokeWidth={2.2} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="shrink font-ui-semibold text-body text-on-accent"
        >
          {ranked ? t('restaurant.rank_again_button') : t('place.rank_it')}
        </Text>
      </Pressable>
      <SaveButton
        variant="bar"
        target={{ kind: 'restaurant', id: restaurantId }}
        initial={saved}
        name={name}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => openDirections(lat, lng, name)}
        className="h-[52px] flex-row items-center gap-[7px] rounded-pill bg-bar-chip px-[15px] active:opacity-80"
      >
        <DirectionsIcon size={16} color="on-bar" />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-semibold text-pill text-on-bar"
        >
          {t('place.directions_short')}
        </Text>
      </Pressable>
    </View>
  )
}
