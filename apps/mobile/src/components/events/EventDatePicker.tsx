import { useEffect, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button, MAX_SCALE } from '@/components/ui'
import { ChevronIcon, CloseIcon } from '@/components/ui/icons'
import { type DayRange, monthCells, monthOf, shiftMonth } from '@/lib/eventTime'
import { tapSelect } from '@/lib/haptics'
import { dateLocale, useT } from '@/lib/i18n'
import { BRASS_SHADOW, DATA_FIGURES } from '@/theme/vars'

import { EASE } from './motion'

// Eventos' date picker (the calendar button at the left of the day strip): a
// month grid that picks EITHER one day or an inclusive range, edited as a
// draft and committed with "Aplicar". Mesa's own tokened surface rather than
// the native UIDatePicker — this lives inside a scrolling page, so it's
// content, not chrome (CLAUDE.md), and the native picker can't do a range or
// mark the days that actually have events.
//
// TIMEZONE, deliberately: every date here is a Santo Domingo day KEY
// ("2026-09-22") — a label, never an instant. The grid is built by
// lib/eventTime's pure UTC math and compared as a string, and an event joins a
// cell only via sdDayKey(e.startsAt), the single place the fixed UTC-4 offset
// is applied. Nothing ever reconstructs an instant from a picked cell, which
// is why a tap on "22" cannot filter to the 21st on a phone set to Madrid.
// Formatting follows the same rule: a key is rendered from `${key}T12:00:00Z`
// with `timeZone: 'UTC'`, so Intl spells the label back literally.
function keyDate(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`)
}

// "22 sept" / "22 sept – 28 sept" — shared with the browse screen's range bar.
export function rangeLabel(r: NonNullable<DayRange>): string {
  const fmt = new Intl.DateTimeFormat(dateLocale(), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const one = (k: string) => fmt.format(keyDate(k)).replace('.', '')
  return r.start === r.end ? one(r.start) : `${one(r.start)} – ${one(r.end)}`
}

// Monday-first weekday initials, from the locale. 2024-01-01 was a Monday.
function weekdayInitials(): string[] {
  const fmt = new Intl.DateTimeFormat(dateLocale(), { weekday: 'narrow', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))))
}

export function EventDatePicker({
  visible,
  onClose,
  value,
  onApply,
  today,
  lastDay,
  daysWithEvents,
}: {
  visible: boolean
  onClose: () => void
  value: DayRange
  onApply: (r: DayRange) => void
  today: string
  // The pickable window, both ends inclusive. Past days can never match (the
  // list is `when=upcoming`, and whether an event is over is the API's one
  // rule — docs/EVENTS.md — never re-judged here), and `lastDay` is as far as
  // the day strip will grow, so everything offered here is reachable there too.
  lastDay: string
  // Which day keys have at least one upcoming event — the dots under the
  // numbers. Already computed by the strip, so no extra work here.
  daysWithEvents: Set<string>
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<DayRange>(value)
  const [month, setMonth] = useState(() => monthOf(value?.start ?? today))
  const [mounted, setMounted] = useState(visible)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      progress.value = withTiming(1, { duration: 220, easing: EASE })
    } else {
      progress.value = withTiming(0, { duration: 140, easing: EASE }, (done) => {
        if (done) runOnJS(setMounted)(false)
      })
    }
  }, [visible, progress])

  // Re-open on what's actually applied — edits are a draft until "Aplicar",
  // so a cancelled session must not leak into the next one.
  useEffect(() => {
    if (visible) {
      setDraft(value)
      setMonth(monthOf(value?.start ?? today))
    }
    // oxlint-disable-next-line react/exhaustive-deps -- read only on open
  }, [visible])

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value }))
  const card = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + progress.value * 0.04 }],
  }))

  // One day, then a second tap to close a range. A tap before the open start
  // (or on top of a finished range) starts over as a single day — no modes,
  // no "start/end" toggle to get wrong.
  const tapDay = (d: string) => {
    tapSelect()
    setDraft((cur) =>
      !cur || cur.start !== cur.end || d < cur.start
        ? { start: d, end: d }
        : {
            start: cur.start,
            end: d,
          },
    )
  }

  const cells = monthCells(month)
  const canGoBack = month > monthOf(today)
  const canGoOn = month < monthOf(lastDay)
  const monthTitle = new Intl.DateTimeFormat(dateLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(keyDate(`${month}-01`))

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View
        pointerEvents={visible ? 'auto' : 'none'}
        className="flex-1 items-center justify-center px-5"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Animated.View style={scrim} className="absolute inset-0 bg-overlay-scrim">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('events.dates_close')}
            onPress={onClose}
            className="flex-1"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          className="w-full overflow-hidden rounded-card border border-line bg-surface"
          style={[
            {
              maxWidth: 380,
              shadowColor: BRASS_SHADOW,
              shadowOpacity: 0.25,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 8 },
            },
            card,
          ]}
        >
          <View className="flex-row items-center justify-center border-line border-b px-5 pt-4 pb-3">
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-subhead text-text"
            >
              {t('events.dates_title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('events.dates_close')}
              onPress={onClose}
              hitSlop={8}
              className="absolute right-4 h-10 w-10 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
            >
              <CloseIcon size={16} />
            </Pressable>
          </View>

          {/* Month header */}
          <View className="flex-row items-center justify-between px-4 pt-3">
            <MonthStep
              label={t('events.dates_prev_month')}
              disabled={!canGoBack}
              back
              onPress={() => setMonth(shiftMonth(month, -1))}
            />
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              numberOfLines={1}
              className="flex-1 text-center font-serif-semibold text-serif-md text-text"
            >
              {monthTitle}
            </Text>
            <MonthStep
              label={t('events.dates_next_month')}
              disabled={!canGoOn}
              onPress={() => setMonth(shiftMonth(month, 1))}
            />
          </View>

          {/* Weekday header */}
          <View className="mt-2 flex-row px-4">
            {weekdayInitials().map((w, i) => (
              <View key={`${i}-${w}`} className="flex-1 items-center">
                <Text className="font-ui-semibold text-[10px] uppercase tracking-eyebrow text-text-faint">
                  {w}
                </Text>
              </View>
            ))}
          </View>

          {/* The grid */}
          <View className="px-4 pt-1 pb-2">
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <View key={row} className="flex-row">
                {cells.slice(row * 7, row * 7 + 7).map((d, i) => (
                  <DayCell
                    key={d ?? `pad-${row}-${i}`}
                    day={d}
                    draft={draft}
                    // Outside the pickable window — see `lastDay` above.
                    out={d != null && (d < today || d > lastDay)}
                    today={today}
                    hasEvents={d != null && daysWithEvents.has(d)}
                    onPress={tapDay}
                  />
                ))}
              </View>
            ))}
          </View>

          <Text className="px-5 pb-3 text-center font-ui text-micro text-text-muted">
            {draft ? rangeLabel(draft) : t('events.dates_hint')}
          </Text>

          <View className="flex-row gap-3 border-line border-t px-5 pt-3 pb-4">
            <Button
              variant="secondary"
              className="w-auto flex-1 bg-surface"
              disabled={value === null && draft === null}
              onPress={() => {
                onApply(null)
                onClose()
              }}
            >
              {t('events.dates_clear')}
            </Button>
            <Button
              className="w-auto flex-1"
              onPress={() => {
                onApply(draft)
                onClose()
              }}
            >
              {t('events.dates_apply')}
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

function MonthStep({
  label,
  onPress,
  disabled,
  back,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  back?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      className={`h-10 w-10 items-center justify-center rounded-pill active:bg-bg-sunk ${disabled ? 'opacity-30' : ''}`}
    >
      <View style={back ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <ChevronIcon size={18} color="text-2" />
      </View>
    </Pressable>
  )
}

function DayCell({
  day,
  draft,
  out,
  today,
  hasEvents,
  onPress,
}: {
  day: string | null
  draft: DayRange
  out: boolean
  today: string
  hasEvents: boolean
  onPress: (d: string) => void
}) {
  if (day === null) return <View className="h-11 flex-1" />
  // A range reads as a run of adjacent circles: its two ends filled, the days
  // between them tinted. Comparing day keys as strings is chronological — see
  // the header, and lib/eventTime's note on why they're labels, not instants.
  const edge = draft != null && (day === draft.start || day === draft.end)
  const within = draft != null && day > draft.start && day < draft.end
  const fill = edge ? 'bg-btn-primary-bg' : within ? 'bg-accent-fill' : ''
  const fg = edge
    ? 'text-btn-primary-fg'
    : within
      ? 'text-on-accent'
      : out
        ? 'text-text-faint'
        : day === today
          ? 'text-accent-strong'
          : 'text-text'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: edge || within, disabled: out }}
      disabled={out}
      onPress={() => onPress(day)}
      className="h-11 flex-1 items-center justify-center"
    >
      <View className={`h-9 w-9 items-center justify-center rounded-pill ${fill}`}>
        <Text
          maxFontSizeMultiplier={1.1}
          style={DATA_FIGURES}
          className={`font-ui-medium text-label ${out ? 'opacity-50' : ''} ${fg}`}
        >
          {Number(day.slice(8))}
        </Text>
      </View>
      <View
        className={`mt-px h-1 w-1 rounded-pill ${hasEvents && !edge && !within ? 'bg-accent' : ''}`}
      />
    </Pressable>
  )
}
