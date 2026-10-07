import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button, Caption, Chip, IconButton, MAX_SCALE, Segmented } from '@/components/ui'
import { ChevronIcon, CloseIcon } from '@/components/ui/icons'
import { HIGHLIGHT_TAGS, OCCASION_TAGS, cuisineLabel, tagLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { Neighborhood } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// Every facet but the minimum score takes several values: a place shows when it matches ANY of a
// facet's picks, and every facet that has picks (Japanese or American, in Piantini). The score is a
// floor, so it stays one value.
export type ExploreFilterValues = {
  hood: string[]
  cuisine: string[]
  price: number[]
  occasion: string[]
  highlight: string[]
  minScore: number | null
}

type ListKey = 'hood' | 'cuisine' | 'occasion' | 'highlight'

export const NO_EXPLORE_FILTERS: ExploreFilterValues = {
  hood: [],
  cuisine: [],
  price: [],
  occasion: [],
  highlight: [],
  minScore: null,
}

// How many picks are applied in total — what the Filters chip counts.
export const exploreFilterCount = (v: ExploreFilterValues) =>
  v.hood.length +
  v.cuisine.length +
  v.price.length +
  v.occasion.length +
  v.highlight.length +
  (v.minScore != null ? 1 : 0)

const PRICES = [1, 2, 3, 4] as const
const SCORES = [
  { value: 'all', label: '' },
  { value: '70', label: '7+' },
  { value: '80', label: '8+' },
  { value: '90', label: '9+' },
] as const

const EASE = Easing.out(Easing.cubic)

// A category is open with the sheet exactly when it already carries a
// selection — an active filter is never hidden behind a collapsed header.
// Everything else starts closed; that is the whole point of the disclosure.
type SectionKey = keyof ExploreFilterValues
const openSections = (v: ExploreFilterValues): Record<SectionKey, boolean> => ({
  price: v.price.length > 0,
  minScore: v.minScore != null,
  hood: v.hood.length > 0,
  cuisine: v.cuisine.length > 0,
  occasion: v.occasion.length > 0,
  highlight: v.highlight.length > 0,
})

// Explore's filters as ONE panel (founder's mock, Sept 2026): every dimension
// reachable at once — the minimum score as a segmented row, price, neighborhood,
// cuisine, occasion and highlights as wrapping chips that each take several picks — edited as a draft, then applied
// with "Ver N lugares". The count is live: the panel runs the same
// ['explore', ...] query the screen will run on apply, so the number is real
// and applying lands on an already-warm cache (no second load).
//
// Each dimension is a DISCLOSURE row, not an always-open block (founder, on
// device: "each category has to have a drop down so it doesn't look so
// messy") — five option sets expanded at once read as a wall of chips. The
// controls and the filter model are untouched; only what's visible changed.
//
// A bottom sheet (r34 top corners, a grabber, a title and a close chip) over a scrim, sliding up from
// the bottom edge, its rows in one raised group. RN's own
// <Modal> is fine here (Explore is a tab, never itself a native modal); its
// built-in animation is off and one shared value drives the scrim fade + card
// slide both ways, so opening and closing are the same smooth curve.
export function ExploreFilters({
  visible,
  onClose,
  value,
  onApply,
  neighborhoods,
  cuisines,
  countQuery,
}: {
  visible: boolean
  onClose: () => void
  value: ExploreFilterValues
  onApply: (v: ExploreFilterValues) => void
  neighborhoods: Neighborhood[]
  cuisines: string[]
  // Builds the same query the screen uses, for the draft — see the header.
  countQuery: (draft: ExploreFilterValues) => {
    queryKey: unknown[]
    queryFn: () => Promise<{ restaurants: unknown[] }>
  }
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const lift = useLift()
  const { height } = useWindowDimensions()
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState<Record<SectionKey, boolean>>(() => openSections(value))
  const [mounted, setMounted] = useState(visible)
  const progress = useSharedValue(0)
  // Read only when opening — edits stay a draft until applied, so a change to
  // `value` while the panel is open must not reset what's being edited.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (visible) {
      setDraft(valueRef.current)
      setOpen(openSections(valueRef.current))
      setMounted(true)
      progress.value = withTiming(1, { duration: 260, easing: EASE })
    } else {
      // Short: the native Modal keeps covering the screen (and taking its
      // touches) until this fade finishes and it unmounts.
      progress.value = withTiming(0, { duration: 140, easing: EASE }, (done) => {
        if (done) runOnJS(setMounted)(false)
      })
    }
  }, [visible, progress])

  const q = useQuery({ ...countQuery(draft), enabled: visible })
  const count = q.data?.restaurants.length

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value }))
  const card = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 40 }],
  }))

  const set = <K extends keyof ExploreFilterValues>(k: K, v: ExploreFilterValues[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))
  const toggle = (k: SectionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  // A chip adds its value to the facet, or takes it out again.
  const flip = (k: ListKey, v: string) =>
    setDraft((d) => ({
      ...d,
      [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v],
    }))
  const flipPrice = (v: number) =>
    setDraft((d) => ({
      ...d,
      price: d.price.includes(v) ? d.price.filter((x) => x !== v) : [...d.price, v].sort(),
    }))
  // The header's summary: the one pick, or the first and how many more.
  const summary = (labels: string[]) =>
    labels.length === 0
      ? t('common.any')
      : labels.length === 1
        ? labels[0]
        : `${labels[0]} +${labels.length - 1}`
  const hoodName = (slug: string) => neighborhoods.find((n) => n.slug === slug)?.name ?? slug

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View pointerEvents={visible ? 'auto' : 'none'} className="flex-1 justify-end">
        <Animated.View style={scrim} className="absolute inset-0 bg-overlay-scrim">
          <Pressable
            className="flex-1"
            onPress={onClose}
            accessibilityLabel={t('comments.close')}
          />
        </Animated.View>
        <Animated.View
          className="overflow-hidden rounded-t-sheet bg-bg"
          style={[
            { maxHeight: height - insets.top - 24, paddingBottom: Math.max(insets.bottom, 12) },
            card,
          ]}
        >
          <View className="items-center pt-2.5">
            <View className="h-1 w-10 rounded-pill bg-line-strong" />
          </View>
          <View className="h-12 flex-row items-center justify-center px-4">
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-body text-text"
            >
              {t('explore.filters_title')}
            </Text>
            <View className="absolute right-4">
              <IconButton
                size={34}
                accessibilityLabel={t('comments.close')}
                onPress={onClose}
                icon={<CloseIcon size={16} color="text" />}
              />
            </View>
          </View>

          <ScrollView contentContainerClassName="px-4 pb-3" showsVerticalScrollIndicator={false}>
            <View className="overflow-hidden rounded-group bg-surface" style={lift}>
              <Group
                first
                label={t('explore.price')}
                value={summary(draft.price.map((n) => '$'.repeat(n)))}
                active={draft.price.length > 0}
                open={open.price}
                onToggle={() => toggle('price')}
              >
                <ChipWrap>
                  {PRICES.map((n) => (
                    <Chip
                      key={n}
                      size="sm"
                      state={draft.price.includes(n) ? 'selected' : 'default'}
                      onPress={() => flipPrice(n)}
                    >
                      {'$'.repeat(n)}
                    </Chip>
                  ))}
                </ChipWrap>
              </Group>

              <Group
                label={t('explore.min_score')}
                value={
                  draft.minScore != null ? `${draft.minScore / 10}+` : t('explore.min_score_all')
                }
                active={draft.minScore != null}
                open={open.minScore}
                onToggle={() => toggle('minScore')}
              >
                <Segmented
                  value={
                    draft.minScore == null
                      ? 'all'
                      : (String(draft.minScore) as (typeof SCORES)[number]['value'])
                  }
                  onChange={(v) => set('minScore', v === 'all' ? null : Number(v))}
                  options={SCORES.map((s) => ({
                    value: s.value,
                    label: s.value === 'all' ? t('explore.min_score_all') : s.label,
                  }))}
                />
              </Group>

              <Group
                label={t('explore.sector')}
                value={summary(draft.hood.map(hoodName))}
                active={draft.hood.length > 0}
                open={open.hood}
                onToggle={() => toggle('hood')}
              >
                <ChipWrap>
                  {neighborhoods.map((n) => (
                    <Chip
                      key={n.slug}
                      size="sm"
                      state={draft.hood.includes(n.slug) ? 'selected' : 'default'}
                      onPress={() => flip('hood', n.slug)}
                    >
                      {n.name}
                    </Chip>
                  ))}
                </ChipWrap>
              </Group>

              <Group
                label={t('explore.cuisine')}
                value={summary(draft.cuisine.map((c) => cuisineLabel(c) ?? c))}
                active={draft.cuisine.length > 0}
                open={open.cuisine}
                onToggle={() => toggle('cuisine')}
              >
                <ChipWrap>
                  {cuisines.map((c) => (
                    <Chip
                      key={c}
                      size="sm"
                      state={draft.cuisine.includes(c) ? 'selected' : 'default'}
                      onPress={() => flip('cuisine', c)}
                    >
                      {cuisineLabel(c) ?? c}
                    </Chip>
                  ))}
                </ChipWrap>
              </Group>

              <Group
                label={t('explore.occasion')}
                value={summary(draft.occasion.map(tagLabel))}
                active={draft.occasion.length > 0}
                open={open.occasion}
                onToggle={() => toggle('occasion')}
              >
                <ChipWrap>
                  {OCCASION_TAGS.map((tag) => (
                    <Chip
                      key={tag}
                      size="sm"
                      state={draft.occasion.includes(tag) ? 'selected' : 'default'}
                      onPress={() => flip('occasion', tag)}
                    >
                      {tagLabel(tag)}
                    </Chip>
                  ))}
                </ChipWrap>
              </Group>

              <Group
                label={t('explore.highlights')}
                value={summary(draft.highlight.map(tagLabel))}
                active={draft.highlight.length > 0}
                open={open.highlight}
                onToggle={() => toggle('highlight')}
              >
                <ChipWrap>
                  {HIGHLIGHT_TAGS.map((tag) => (
                    <Chip
                      key={tag}
                      size="sm"
                      state={draft.highlight.includes(tag) ? 'selected' : 'default'}
                      onPress={() => flip('highlight', tag)}
                    >
                      {tagLabel(tag)}
                    </Chip>
                  ))}
                </ChipWrap>
              </Group>
            </View>
          </ScrollView>

          <View className="flex-row gap-2.5 px-4 pt-1">
            <Button
              variant="secondary"
              className="flex-1 w-auto"
              onPress={() => setDraft(NO_EXPLORE_FILTERS)}
            >
              {t('explore.clear')}
            </Button>
            <Button
              className="flex-1 w-auto"
              onPress={() => {
                onApply(draft)
                onClose()
              }}
            >
              {count == null ? t('explore.show_results') : t('explore.show_n_places', { n: count })}
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

// One category: a tappable header row (name · current selection · chevron)
// over a body that is clipped to a measured height, so open/close is a single
// height+opacity timing running on the UI thread. The body is measured from an
// absolutely-positioned child — it must not dictate the row's own height, or
// there is nothing left to animate.
function Group({
  label,
  value,
  active,
  open,
  onToggle,
  first,
  children,
}: {
  label: string
  value: string
  active: boolean
  open: boolean
  onToggle: () => void
  first?: boolean
  children: ReactNode
}) {
  const [h, setH] = useState(0)
  const p = useSharedValue(open ? 1 : 0)
  // The first measure LANDS on the default (no animation) — a category that
  // opens with the sheet must already be open on its first visible frame.
  const settled = useRef(false)
  useEffect(() => {
    if (h === 0) return
    if (settled.current) {
      p.value = withTiming(open ? 1 : 0, { duration: 180, easing: EASE })
      return
    }
    settled.current = true
    p.value = open ? 1 : 0
  }, [open, h, p])

  const body = useAnimatedStyle(() => ({ height: h * p.value, opacity: p.value }))
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 90}deg` }] }))

  return (
    <View className={first ? undefined : 'border-line border-t'}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${value}`}
        onPress={onToggle}
        className="min-h-[56px] flex-row items-center px-4 py-3 active:opacity-60"
      >
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-body text-text">
          {label}
        </Text>
        <Caption
          numberOfLines={1}
          className={`ml-3 flex-1 text-right text-subhead ${active ? 'font-ui-semibold text-accent' : ''}`}
        >
          {value}
        </Caption>
        <Animated.View style={chevron} className="ml-2">
          <ChevronIcon size={16} color="text-muted" />
        </Animated.View>
      </Pressable>
      <Animated.View
        className="overflow-hidden"
        style={body}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <View
          className="absolute top-0 right-0 left-0 px-4 pb-4"
          onLayout={(e) => setH(e.nativeEvent.layout.height)}
        >
          {children}
        </View>
      </Animated.View>
    </View>
  )
}

function ChipWrap({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>
}
