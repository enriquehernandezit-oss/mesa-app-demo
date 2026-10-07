import { useEffect, useState } from 'react'
import { type FocusEvent, Pressable, Text, View } from 'react-native'

import { CitySearch } from '@/components/CitySearch'
import { Button, MAX_SCALE } from '@/components/ui'
import { ChevronIcon, CloseIcon, PinIcon } from '@/components/ui/icons'
import { useT } from '@/lib/i18n'
import {
  type LocationItem,
  MAX_LOCATIONS,
  addLocation,
  isDefaultLocation,
  itemKey,
  removeLocation,
  useLocationFilter,
} from '@/lib/locationFilter'
import { useLocationLabel, useLocationWords } from '@/lib/useLocationLabel'
import { useLift } from '@/theme/useLift'

// WHERE Mesa is searching — for Mesa's own places and Google's both. One field that says it
// ("Santo Domingo, RD"); tap it and it opens, inline, into the cities you have chosen — each a chip you
// can remove — and a search for any city to add, as many as you like. Your default city (Settings) is
// where it starts. That is Beli's location field, with several places at once.
//
// Inline, not a sheet: the rank flow is a native modal, and Mesa's sheets render underneath those.
// The value lives in lib/locationFilter (shared by every screen that searches).
export function LocationFilter({
  resetKey,
  onSearchFocus,
}: {
  resetKey?: number
  // The search field was focused — the page uses it to bring the field to the top (lib/bringToTop.ts).
  onSearchFocus?: (e: FocusEvent) => void
}) {
  const t = useT()
  const lift = useLift()
  const filter = useLocationFilter()
  const label = useLocationLabel()
  const [open, setOpen] = useState(false)
  // A reset from outside (Explore's tab pressed again) closes it too.
  useEffect(() => setOpen(false), [resetKey])
  const home = isDefaultLocation(filter)
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('location.label')}: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        className="min-h-[44px] flex-row items-center gap-2.5 rounded bg-surface px-4 active:opacity-80"
        style={lift}
      >
        <PinIcon size={18} color={home ? 'text-muted' : 'accent'} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="min-w-0 flex-1 font-ui text-body text-text"
        >
          {label}
        </Text>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }], opacity: 0.6 }}>
          <ChevronIcon size={14} color="text" />
        </View>
      </Pressable>
      {open ? <LocationPanel onDone={() => setOpen(false)} onSearchFocus={onSearchFocus} /> : null}
    </View>
  )
}

// A chosen place: a solid pill with a × that drops it.
function ChosenPlace({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const t = useT()
  const body = (
    <>
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-on-ink">
        {label}
      </Text>
      {onRemove ? <CloseIcon size={12} color="on-ink" strokeWidth={2.4} /> : null}
    </>
  )
  const box = 'min-h-[32px] flex-row items-center gap-1.5 rounded-pill bg-ink pl-3.5 pr-3'
  return onRemove ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('location.remove')}: ${label}`}
      onPress={onRemove}
      hitSlop={4}
      className={`${box} pr-2.5 active:scale-[0.97] active:opacity-80`}
    >
      {body}
    </Pressable>
  ) : (
    <View className={box}>{body}</View>
  )
}

function LocationPanel({
  onDone,
  onSearchFocus,
}: {
  onDone: () => void
  onSearchFocus?: (e: FocusEvent) => void
}) {
  const t = useT()
  const lift = useLift()
  const filter = useLocationFilter()
  const words = useLocationWords()
  const picked = new Set(filter.flatMap((i) => (i.kind === 'city' ? [i.placeId] : [])))
  const full = filter.length >= MAX_LOCATIONS
  // Never let the last place be removed into nothing: the lone default has no ×.
  const removable = !isDefaultLocation(filter)
  const nameOf = (i: LocationItem) => (i.kind === 'city' ? i.name : words.sd)

  return (
    <View className="mt-2 gap-3 rounded-card bg-surface p-4" style={lift}>
      <View className="flex-row flex-wrap gap-2">
        {filter.map((i) => (
          <ChosenPlace
            key={itemKey(i)}
            label={nameOf(i)}
            onRemove={removable ? () => removeLocation(itemKey(i)) : undefined}
          />
        ))}
      </View>
      <CitySearch
        onCard
        exclude={picked}
        disabled={full}
        caption={t('location.max_cities')}
        onSearchFocus={onSearchFocus}
        onPick={(city) => addLocation({ kind: 'city', ...city })}
      />
      <Button size="sm" variant="secondary" onPress={onDone}>
        {t('common.done')}
      </Button>
    </View>
  )
}
