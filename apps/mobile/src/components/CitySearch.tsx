import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { type FocusEvent, Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { PinIcon, SearchIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { City } from '@/lib/locationFilter'
import { useDebounced } from '@/lib/useDebounced'

// Search for a city and tap one: a search field, and under it the cities Google knows by that name —
// Dominican ones first, each with its region or country so two Madrids can be told apart. Used by the
// location filter (add a city) and by Settings (choose the default city). `exclude` hides the cities already
// chosen; `disabled` greys the field out once nothing more can be added.
export function CitySearch({
  onPick,
  exclude,
  disabled,
  onCard,
  caption,
  onSearchFocus,
}: {
  onPick: (city: City) => void
  exclude?: ReadonlySet<string>
  disabled?: boolean
  onCard?: boolean
  // Shown under the field when `disabled` (e.g. "Up to 5 cities").
  caption?: string
  // The search field was focused — the page uses it to bring the field to the top (lib/bringToTop.ts).
  onSearchFocus?: (e: FocusEvent) => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const debounced = useDebounced(q.trim(), 250)
  const found = useQuery({
    queryKey: ['search-cities', debounced],
    queryFn: () =>
      api.get<{ cities: City[] }>(`/restaurants/search-cities?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 300_000,
  })
  const results = (found.data?.cities ?? []).filter((c) => !exclude?.has(c.placeId))

  return (
    <View className="gap-3">
      <Field
        onCard={onCard}
        icon={<SearchIcon size={18} color="text-muted" />}
        placeholder={t('location.search_placeholder')}
        value={q}
        onChangeText={setQ}
        onFocus={onSearchFocus}
        returnKeyType="search"
        autoCorrect={false}
        editable={!disabled}
      />
      {disabled && caption ? <Caption className="text-meta">{caption}</Caption> : null}
      {results.length > 0 ? (
        <View>
          {results.map((c) => (
            <Pressable
              key={c.placeId}
              accessibilityRole="button"
              onPress={() => {
                onPick(c)
                setQ('')
              }}
              className="min-h-[48px] flex-row items-center gap-3 border-line border-t py-2 active:opacity-70"
            >
              <PinIcon size={18} color="text-muted" />
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-pill text-text"
                >
                  {c.name}
                </Text>
                <Caption numberOfLines={1} className="text-meta">
                  {c.subtitle}
                </Caption>
              </View>
            </Pressable>
          ))}
        </View>
      ) : debounced.length >= 2 && found.isSuccess && !disabled ? (
        <Caption className="text-meta">{t('location.no_cities')}</Caption>
      ) : null}
    </View>
  )
}
