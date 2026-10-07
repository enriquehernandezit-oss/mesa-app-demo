import { type FocusEvent, Pressable, Text, View } from 'react-native'

import { CitySearch } from '@/components/CitySearch'
import { Caption, MAX_SCALE } from '@/components/ui'
import { CheckIcon, PinIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import { setDefaultLocation } from '@/lib/locationDefault'
import { useDefaultLocation } from '@/lib/locationFilter'
import { useLocationWords } from '@/lib/useLocationLabel'
import { useLift } from '@/theme/useLift'

// Settings → Preferences: the city every search starts from (Explore, the rank flow's find step). Santo
// Domingo until you change it. The current one is shown with a check; "Santo Domingo, RD" is always one tap
// away, and any other city is a search. Changing it also starts the search you are on from the new city.
export function DefaultCityPicker({
  onSearchFocus,
}: {
  // The search field was focused — the page uses it to bring the field to the top (lib/bringToTop.ts).
  onSearchFocus?: (e: FocusEvent) => void
}) {
  const t = useT()
  const lift = useLift()
  const words = useLocationWords()
  const [current] = useDefaultLocation()
  const isSd = current?.kind !== 'city'

  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-card bg-surface" style={lift}>
        <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-2">
          <PinIcon size={18} color="accent" />
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-body text-text"
            >
              {current?.kind === 'city' ? current.name : words.home}
            </Text>
            {current?.kind === 'city' ? (
              <Caption numberOfLines={1} className="text-meta">
                {current.subtitle}
              </Caption>
            ) : null}
          </View>
          <CheckIcon size={18} color="accent" />
        </View>
        {!isSd ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDefaultLocation({ kind: 'sd' })}
            className="min-h-[52px] flex-row items-center gap-3 border-line border-t px-4 py-2 active:opacity-70"
          >
            <PinIcon size={18} color="text-muted" />
            <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-body text-text">
              {words.home}
            </Text>
          </Pressable>
        ) : null}
        <View className="gap-1 border-line border-t p-4">
          <Caption className="pb-2 text-meta">{t('settings.default_city_pick')}</Caption>
          <CitySearch
            onCard
            onSearchFocus={onSearchFocus}
            onPick={(city) => setDefaultLocation({ kind: 'city', ...city })}
            exclude={new Set(current?.kind === 'city' ? [current.placeId] : [])}
          />
        </View>
      </View>
      <Caption className="px-1 text-meta">{t('settings.default_city_help')}</Caption>
    </View>
  )
}
