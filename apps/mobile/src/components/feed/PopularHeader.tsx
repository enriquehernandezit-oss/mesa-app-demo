import { ScrollView, Text, View } from 'react-native'

import { Chip, MAX_SCALE, Serif } from '@/components/ui'
import { useT } from '@/lib/i18n'
import type { Neighborhood } from '@/lib/types'

// The top of the Popular view: "Popular this week", what it counts, and a row of
// neighborhood pills — All first — that narrow the list to one part of the city.
export function PopularHeader({
  hoods,
  hood,
  onHood,
}: {
  hoods: Neighborhood[]
  hood: string | null
  onHood: (slug: string | null) => void
}) {
  const t = useT()
  return (
    <View>
      <View className="px-5 pb-1 pt-[18px]">
        <Serif className="text-title text-text">{t('popular.title')}</Serif>
        <Text maxFontSizeMultiplier={MAX_SCALE} className="mt-1 font-ui text-label text-text-muted">
          {t('popular.subtitle')}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2 px-5 pb-1.5 pt-3"
      >
        <Chip size="sm" state={hood === null ? 'selected' : 'default'} onPress={() => onHood(null)}>
          {t('popular.all_hoods')}
        </Chip>
        {hoods.map((h) => (
          <Chip
            key={h.slug}
            size="sm"
            state={hood === h.slug ? 'selected' : 'default'}
            onPress={() => onHood(h.slug)}
          >
            {h.name}
          </Chip>
        ))}
      </ScrollView>
    </View>
  )
}
