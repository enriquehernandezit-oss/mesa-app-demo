import { useRouter } from 'expo-router'
import { Alert, Pressable, Text, View } from 'react-native'

import { MAX_SCALE, SectionHeader } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useT } from '@/lib/i18n'
import { sixReasonLine } from '@/lib/sixReason'
import type { HomeResponse } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// "Your six": up to six places to go next, as a 2-column grid of small tiles — the place's
// picture (its photo, else its name card), its name, and WHY it is here in one line
// ("Diego · 9.6", "Saved · 2 friends"). Fewer than two and there is nothing to lay out,
// so the section hides; an odd count drops its last, lowest-ranked tile so the grid never
// ends on a lonely half-row.
export function YourSix({ six }: { six: HomeResponse['six'] }) {
  const t = useT()
  const shown = six.slice(0, six.length - (six.length % 2))
  if (shown.length < 2) return null
  const rows: HomeResponse['six'][] = []
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2))
  return (
    <View>
      <View className="px-5">
        <SectionHeader
          action={
            <Text
              accessibilityRole="button"
              onPress={() => Alert.alert(t('home.six_why_title'), t('home.six_why_body'))}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-medium text-pill text-text-muted"
            >
              {t('home.six_why')}
            </Text>
          }
        >
          {t('home.six_title')}
        </SectionHeader>
      </View>
      <View className="gap-2 px-4">
        {rows.map((row) => (
          <View key={row[0]?.restaurant.id} className="flex-row gap-2">
            {row.map((s) => (
              <SixTile key={s.restaurant.id} item={s} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function SixTile({ item }: { item: HomeResponse['six'][number] }) {
  const t = useT()
  const router = useRouter()
  const lift = useLift()
  const { restaurant: r, reason } = item
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/r/${r.id}`)}
      // min-h, not h: the text grows with Dynamic Type and the tile grows with it. The
      // picture is pinned to the tile's left edge (a percent height would have no parent
      // height to resolve against and the name card would stretch the tile).
      className="min-h-[62px] flex-1 justify-center rounded bg-surface py-1 pl-[68px] pr-2 active:opacity-90"
      style={lift}
    >
      <View className="absolute inset-y-0 left-0 w-[58px] overflow-hidden rounded-l">
        <PlaceCover
          name={r.name}
          coverImageId={r.coverImageId}
          size={{ w: 120, h: 130 }}
          className="h-full w-full rounded-none"
        />
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-serif text-serif-xs text-text"
      >
        {r.name}
      </Text>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-0.5 font-ui text-eyebrow text-text-muted"
      >
        {sixReasonLine(t, reason)}
      </Text>
    </Pressable>
  )
}
