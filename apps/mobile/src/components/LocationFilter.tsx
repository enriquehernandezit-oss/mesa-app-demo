import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Button, Caption, MAX_SCALE } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { ChevronIcon, CloseIcon, PinIcon, PlusIcon, SearchIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import {
  type City,
  type LocationItem,
  MAX_CITIES,
  addLocation,
  cityCount,
  isDefaultLocation,
  itemKey,
  removeLocation,
  useLocationFilter,
} from '@/lib/locationFilter'
import { useDebounced } from '@/lib/useDebounced'
import { useLocationLabel, useLocationWords } from '@/lib/useLocationLabel'
import { useLift } from '@/theme/useLift'

// WHERE Mesa is searching — for Mesa's own places and Google's both. One field that says it
// ("Santo Domingo, RD"); tap it and it opens, inline, into the places you have chosen — each a chip
// you can remove — the quick additions (the whole Dominican Republic, the world), and a search for
// any city. That is Beli's location field, with several places at once.
//
// Inline, not a sheet: the rank flow is a native modal, and Mesa's sheets render underneath those.
// The value lives in lib/locationFilter (shared by every screen that searches).
export function LocationFilter({ resetKey }: { resetKey?: number }) {
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
      {open ? <LocationPanel onDone={() => setOpen(false)} /> : null}
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

// A place you can add in one tap (the Dominican Republic, the world): the ground colour, so it
// shows on the white panel.
function QuickAdd({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useT()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('location.add_quick')}: ${label}`}
      onPress={onPress}
      hitSlop={4}
      className="min-h-[32px] flex-row items-center gap-1.5 rounded-pill bg-bg pl-3 pr-3.5 active:scale-[0.97] active:opacity-80"
    >
      <PlusIcon size={12} color="text-2" strokeWidth={2.4} />
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-text">
        {label}
      </Text>
    </Pressable>
  )
}

function LocationPanel({ onDone }: { onDone: () => void }) {
  const t = useT()
  const lift = useLift()
  const filter = useLocationFilter()
  const words = useLocationWords()
  const [q, setQ] = useState('')
  const debounced = useDebounced(q.trim(), 250)
  const found = useQuery({
    queryKey: ['search-cities', debounced],
    queryFn: () =>
      api.get<{ cities: City[] }>(`/restaurants/search-cities?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 300_000,
  })

  const picked = new Set(filter.flatMap((i) => (i.kind === 'city' ? [i.placeId] : [])))
  const results = (found.data?.cities ?? []).filter((c) => !picked.has(c.placeId))
  const full = cityCount(filter) >= MAX_CITIES
  const has = (kind: LocationItem['kind']) => filter.some((i) => i.kind === kind)
  // What is worth offering: nothing the list already covers (the Dominican Republic contains
  // Santo Domingo; the world contains everything).
  const quick: { kind: 'sd' | 'do' | 'world' }[] = [
    ...(!has('sd') && !has('do') && !has('world') ? [{ kind: 'sd' } as const] : []),
    ...(!has('do') && !has('world') ? [{ kind: 'do' } as const] : []),
    ...(!has('world') ? [{ kind: 'world' } as const] : []),
  ]
  // Never let the last place be removed into nothing: the lone default has no ×.
  const removable = !isDefaultLocation(filter)
  const nameOf = (i: LocationItem) => (i.kind === 'city' ? i.name : words[i.kind])

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
      {quick.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {quick.map((i) => (
            <QuickAdd key={i.kind} label={words[i.kind]} onPress={() => addLocation(i)} />
          ))}
        </View>
      ) : null}
      <Field
        onCard
        icon={<SearchIcon size={18} color="text-muted" />}
        placeholder={t('location.search_placeholder')}
        value={q}
        onChangeText={setQ}
        returnKeyType="search"
        autoCorrect={false}
        editable={!full}
      />
      {full ? <Caption className="text-meta">{t('location.max_cities')}</Caption> : null}
      {results.length > 0 ? (
        <View>
          {results.map((c) => (
            <Pressable
              key={c.placeId}
              accessibilityRole="button"
              onPress={() => {
                addLocation({ kind: 'city', ...c })
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
      ) : debounced.length >= 2 && found.isSuccess && !full ? (
        <Caption className="text-meta">{t('location.no_cities')}</Caption>
      ) : null}
      <Button size="sm" variant="secondary" onPress={onDone}>
        {t('common.done')}
      </Button>
    </View>
  )
}
