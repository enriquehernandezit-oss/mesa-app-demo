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

import { Button, Caption, Chip, MAX_SCALE, Segmented } from '@/components/ui'
import { CloseIcon } from '@/components/ui/icons'
import { OCCASION_TAGS, cuisineLabel, tagLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { Neighborhood } from '@/lib/types'
import { BRASS_SHADOW } from '@/theme/vars'

export type ExploreFilterValues = {
  hood: string | null
  cuisine: string | null
  price: number | null
  occasion: string | null
  minScore: number | null
}

export const NO_EXPLORE_FILTERS: ExploreFilterValues = {
  hood: null,
  cuisine: null,
  price: null,
  occasion: null,
  minScore: null,
}

const PRICES = ['1', '2', '3', '4'] as const
const SCORES = [
  { value: 'all', label: '' },
  { value: '70', label: '7+' },
  { value: '80', label: '8+' },
  { value: '90', label: '9+' },
] as const

const EASE = Easing.out(Easing.cubic)

// Explore's filters as ONE panel (founder's mock, Sept 2026): every dimension
// visible at once — price and minimum score as segmented rows, neighborhood,
// cuisine and occasion as wrapping chips — edited as a draft, then applied
// with "Ver N lugares". The count is live: the panel runs the same
// ['explore', ...] query the screen will run on apply, so the number is real
// and applying lands on an already-warm cache (no second load).
//
// A floating card over a scrim, sliding up from the bottom edge. RN's own
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
  const { height } = useWindowDimensions()
  const [draft, setDraft] = useState(value)
  const [mounted, setMounted] = useState(visible)
  const progress = useSharedValue(0)
  // Read only when opening — edits stay a draft until applied, so a change to
  // `value` while the panel is open must not reset what's being edited.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (visible) {
      setDraft(valueRef.current)
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

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View
        pointerEvents={visible ? 'auto' : 'none'}
        className="flex-1 justify-end px-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <Animated.View style={scrim} className="absolute inset-0 bg-overlay-scrim">
          <Pressable
            className="flex-1"
            onPress={onClose}
            accessibilityLabel={t('comments.close')}
          />
        </Animated.View>
        <Animated.View
          className="overflow-hidden rounded-card border border-line bg-bg"
          style={[
            {
              maxHeight: height - insets.top - 24,
              shadowColor: BRASS_SHADOW,
              shadowOpacity: 0.25,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: -4 },
            },
            card,
          ]}
        >
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-pill bg-line-strong" />
          </View>
          <View className="flex-row items-center justify-center px-5 pt-2 pb-2">
            <Text className="font-ui-semibold text-subhead text-text">
              {t('explore.filters_title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('comments.close')}
              onPress={onClose}
              hitSlop={8}
              className="absolute right-4 h-10 w-10 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
            >
              <CloseIcon size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="px-5 pb-4" showsVerticalScrollIndicator={false}>
            <Group
              label={t('explore.price')}
              value={draft.price != null ? '$'.repeat(draft.price) : t('common.any')}
            >
              <Segmented
                value={
                  draft.price != null ? (String(draft.price) as (typeof PRICES)[number]) : null
                }
                onChange={(v) => set('price', Number(v))}
                onClear={() => set('price', null)}
                options={PRICES.map((p) => ({ value: p, label: '$'.repeat(Number(p)) }))}
              />
            </Group>

            <Group
              label={t('explore.min_score')}
              value={
                draft.minScore != null ? `${draft.minScore / 10}+` : t('explore.min_score_all')
              }
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
              value={
                draft.hood
                  ? (neighborhoods.find((n) => n.slug === draft.hood)?.name ?? draft.hood)
                  : t('common.any')
              }
            >
              <ChipWrap>
                {neighborhoods.map((n) => (
                  <Chip
                    key={n.slug}
                    size="sm"
                    state={draft.hood === n.slug ? 'selected' : 'default'}
                    onPress={() => set('hood', draft.hood === n.slug ? null : n.slug)}
                  >
                    {n.name}
                  </Chip>
                ))}
              </ChipWrap>
            </Group>

            <Group
              label={t('explore.cuisine')}
              value={
                draft.cuisine ? (cuisineLabel(draft.cuisine) ?? draft.cuisine) : t('common.any')
              }
            >
              <ChipWrap>
                {cuisines.map((c) => (
                  <Chip
                    key={c}
                    size="sm"
                    state={draft.cuisine === c ? 'selected' : 'default'}
                    onPress={() => set('cuisine', draft.cuisine === c ? null : c)}
                  >
                    {cuisineLabel(c) ?? c}
                  </Chip>
                ))}
              </ChipWrap>
            </Group>

            <Group
              label={t('explore.occasion')}
              value={draft.occasion ? tagLabel(draft.occasion) : t('common.any')}
            >
              <ChipWrap>
                {OCCASION_TAGS.map((tag) => (
                  <Chip
                    key={tag}
                    size="sm"
                    state={draft.occasion === tag ? 'selected' : 'default'}
                    onPress={() => set('occasion', draft.occasion === tag ? null : tag)}
                  >
                    {tagLabel(tag)}
                  </Chip>
                ))}
              </ChipWrap>
            </Group>
          </ScrollView>

          <View className="flex-row gap-3 border-line border-t px-5 pt-3 pb-4">
            <Button
              variant="secondary"
              className="flex-1 w-auto bg-surface"
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

function Group({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <View className="mt-4">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-text-2">
          {label}
        </Text>
        <Caption numberOfLines={1} className="ml-3 flex-shrink font-ui-semibold text-accent-strong">
          {value}
        </Caption>
      </View>
      {children}
    </View>
  )
}

function ChipWrap({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>
}
