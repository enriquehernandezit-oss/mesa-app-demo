import { useQuery } from '@tanstack/react-query'
import { memo, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import {
  Chip,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconButton,
  SectionHeader,
  Skeleton,
} from '@/components/ui'
import { CalendarIcon, CloseIcon } from '@/components/ui/icons'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'
import { api } from '@/lib/api'
import { CAT_ORDER, type CatKey, categoryKey } from '@/lib/eventCategory'
import {
  type DayRange,
  addDays,
  daysBetween,
  inDayRange,
  nextDays,
  sdDayKey,
} from '@/lib/eventTime'
import { tapSelect } from '@/lib/haptics'
import { dateLocale, useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'

import { EventDatePicker, rangeLabel } from './EventDatePicker'
import { EventHeroPager } from './EventHero'
import { CategoryIcon, EventTicket, useNow } from './EventTicket'
import { EASE } from './motion'

// Explore's Events (M21, Redesign 2): a calendar button and a day strip (All · Today · Tue …) whose
// selected circle slides to the tapped day, category pills — each with its own ICON, never its own
// colour — a Featured pager of the next few events as big photo cards, then ticket cards for everything that
// matches. One `upcoming` fetch; day/category filtering is client-side.
//
// The strip and the calendar are two views of ONE selection (`sel`, a DayRange): `null` is every
// upcoming day, `start === end` is the day the strip's circle sits on, and `start !== end` is a range
// the strip tints and the range bar names. Neither can drift from the other because neither owns its
// own state.

type Day = 'all' | string

// How far ahead the strip runs by default, and the ceiling it will grow to so
// a date picked further out still has a chip to land on. The calendar can't
// offer a day past that ceiling either — that's what keeps "the strip and the
// calendar are one selection" true rather than nearly true.
const STRIP_DAYS = 14
const STRIP_MAX_DAYS = 120

// A stable reference for the "no data yet" case — `data?.events ?? []` would
// otherwise hand `all` a fresh array every render, defeating catsByDay's memo.
const EMPTY_EVENTS: EventSummary[] = []

// memo'd: it stays mounted inside Explore's list header once visited, so
// every keystroke in the search bar (setQ updates that screen's state on each
// one, well before the debounced query fires) re-rendered this whole tree —
// day strip, category rail, featured carousel — for a query it doesn't read.
// It takes no props, so memo makes those re-renders free.
export const EventsBrowse = memo(function EventsBrowse() {
  const t = useT()
  const now = useNow()
  const [sel, setSel] = useState<DayRange>(null)
  const [picking, setPicking] = useState(false)
  const [cat, setCat] = useState<CatKey | 'all'>('all')
  const q = useUpcomingEvents()
  const all = q.data?.events ?? EMPTY_EVENTS
  // The member's own RSVPs. This used to be a fourth tab under Saved in
  // Rankings, which read as a list of places you'd bookmarked rather than
  // plans you'd made; events belong with events. Shares the ['events']
  // prefix useEventRsvp already invalidates, so an RSVP anywhere updates it.
  const mine = useQuery({
    queryKey: ['events', 'mine'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events/mine'),
  })
  const going = mine.data?.events ?? EMPTY_EVENTS

  // Keyed on the SD calendar day, not on `now` — useNow ticks every minute,
  // and a fresh array each tick re-rendered the whole strip for nothing.
  const today = sdDayKey(now)
  // The strip normally runs a fortnight, but a date chosen in the calendar
  // beyond that still has to be visible in it — one selection, two views.
  const dayCount = Math.min(
    STRIP_MAX_DAYS,
    Math.max(STRIP_DAYS, sel ? daysBetween(today, sel.end) + 1 : 0),
  )
  const days = useMemo(() => nextDays(dayCount, new Date(`${today}T16:00:00Z`)), [today, dayCount])
  // How many events fall on each day — a dot per event (up to two) under the day in the strip.
  const countByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of all) {
      const k = sdDayKey(e.startsAt)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [all])
  // The same days, as the calendar's "something is on" dots.
  const daysWithEvents = useMemo(() => new Set(countByDay.keys()), [countByDay])

  const matchesCat = (e: EventSummary) => cat === 'all' || categoryKey(e.category, e.title) === cat
  // `all` is already only the events the API considers upcoming — whether one
  // is over is its rule alone (docs/EVENTS.md), never re-judged here. This
  // only narrows that list to the picked day(s).
  const shown = all.filter((e) => matchesCat(e) && inDayRange(sdDayKey(e.startsAt), sel))
  const featured = sel === null && cat === 'all' ? all.slice(0, 3) : []
  const list = featured.length > 0 ? shown.slice(featured.length) : shown
  const nextDay =
    shown.length === 0 && sel !== null
      ? all.find((e) => matchesCat(e) && sdDayKey(e.startsAt) > sel.end)
      : undefined
  const isRange = sel !== null && sel.start !== sel.end
  const selKey = sel ? `${sel.start}_${sel.end}` : 'all'

  return (
    <View className="mt-3">
      <DayStrip
        days={days}
        sel={sel}
        onChange={setSel}
        onOpenPicker={() => setPicking(true)}
        countByDay={countByDay}
        today={today}
      />

      {/* A range can't be read off the strip's circle, so it gets said out
          loud — tap to re-edit it, × to go back to every upcoming day. */}
      {isRange ? (
        <View className="mt-3 min-h-[36px] flex-row items-center gap-2 self-start rounded-pill border border-accent bg-accent-fill py-2 pr-2 pl-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('events.dates_title')}
            onPress={() => setPicking(true)}
            className="flex-row items-center gap-2 active:opacity-70"
          >
            <CalendarIcon size={13} color="on-accent" />
            <Text className="font-ui-semibold text-micro text-on-accent">{rangeLabel(sel)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('events.dates_clear')}
            hitSlop={10}
            onPress={() => {
              tapSelect()
              setSel(null)
            }}
            className="h-5 w-5 items-center justify-center active:opacity-70"
          >
            <CloseIcon size={13} color="on-accent" />
          </Pressable>
        </View>
      ) : null}

      <EventDatePicker
        visible={picking}
        onClose={() => setPicking(false)}
        value={sel}
        onApply={setSel}
        today={today}
        lastDay={addDays(today, STRIP_MAX_DAYS - 1)}
        daysWithEvents={daysWithEvents}
      />

      {/* Category pills — each kind wears its own icon */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5 mt-3"
        contentContainerClassName="gap-2 px-5 pb-1"
      >
        <Chip
          state={cat === 'all' ? 'selected' : 'default'}
          onPress={() => {
            tapSelect()
            setCat('all')
          }}
        >
          {t('events.all_cats')}
        </Chip>
        {CAT_ORDER.map((c) => (
          <Chip
            key={c}
            state={cat === c ? 'selected' : 'default'}
            icon={<CategoryIcon cat={c} size={15} color={cat === c ? 'on-ink' : 'text'} />}
            onPress={() => {
              tapSelect()
              setCat(cat === c ? 'all' : c)
            }}
          >
            {t(`events.cat_${c}`)}
          </Chip>
        ))}
      </ScrollView>

      {q.isPending ? (
        <View className="mt-4 gap-3">
          <Skeleton height={240} />
          <Skeleton height={140} />
          <Skeleton height={140} />
        </View>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()}>{t('events.load_error')}</ErrorState>
      ) : all.length === 0 ? (
        <EmptyState>{t('events.empty')}</EmptyState>
      ) : (
        <>
          {/* Your own RSVPs, pinned above the browse list — but only in the
              default state, the same rule Featured follows: once a day or a
              category is picked, the answer on screen should be what was
              asked for, not a standing list. */}
          {going.length > 0 && sel === null && cat === 'all' ? (
            <View className="mt-2">
              <SectionHeader>{t('events.going_section')}</SectionHeader>
              {going.map((e, i) => (
                <EventTicket key={`going-${e.id}`} e={e} index={i} now={now} />
              ))}
            </View>
          ) : null}
          {featured.length > 0 ? (
            <View className="mt-4">
              <Eyebrow className="pb-2">{t('events.featured')}</Eyebrow>
              {/* The pager runs edge to edge; this list pads its content 20. */}
              <View className="-mx-5">
                <EventHeroPager events={featured} height={330} now={now} dated />
              </View>
            </View>
          ) : null}
          <View className="mt-4">
            {list.map((e, i) => (
              <EventTicket key={`${selKey}-${cat}-${e.id}`} e={e} index={i} now={now} />
            ))}
          </View>
          {shown.length === 0 ? (
            <View className="items-center">
              <EmptyState>
                {sel === null
                  ? t('events.no_match')
                  : isRange
                    ? t('events.empty_range')
                    : t('events.empty_day')}
              </EmptyState>
              {nextDay ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const k = sdDayKey(nextDay.startsAt)
                    setSel({ start: k, end: k })
                  }}
                  className="mt-3 min-h-[44px] justify-center rounded-pill bg-ink px-5 active:opacity-80"
                >
                  <Text className="font-ui-semibold text-label text-on-ink">
                    {t('events.jump_next')} ·{' '}
                    {new Intl.DateTimeFormat(dateLocale(), {
                      weekday: 'short',
                      day: 'numeric',
                    }).format(new Date(nextDay.startsAt))}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  )
})

// ── Day strip: a light calendar row ─────────────────────────────────────────
// Weekday over a serif date, like iOS Calendar's week header — no boxes, so it
// reads as Mesa's editorial type rather than a row of chunky buttons. Every
// item has the same fixed width, so the selected circle's position is plain
// arithmetic (index × STEP): nothing is measured, and nothing ever scrolls the
// strip except a tap — the old per-pill onLayout → scrollTo could yank the
// strip back to the selected day mid-swipe, which is what felt "frozen".
const ITEM_W = 46
const ITEM_GAP = 2
const STEP = ITEM_W + ITEM_GAP
const DOT = 40
// The strip's own left inset now that the calendar button sits outside it.
const STRIP_PAD = 6

const DayStrip = memo(function DayStrip({
  days,
  sel,
  onChange,
  onOpenPicker,
  countByDay,
  today,
}: {
  days: string[]
  sel: DayRange
  onChange: (s: DayRange) => void
  onOpenPicker: () => void
  countByDay: Map<string, number>
  today: string
}) {
  const t = useT()
  const reduced = useReducedMotion()
  const scrollRef = useRef<ScrollView>(null)
  const stripW = useRef(0)
  const items = useMemo(() => ['all', ...days] as Day[], [days])
  const indexOf = (d: Day) => Math.max(0, items.indexOf(d))
  // The one item the sliding circle can sit on: "Todo" when nothing is picked,
  // the picked day when it's a single one, and nowhere at all for a range —
  // which is why a range is tinted across the days instead.
  const single: Day | null = sel === null ? 'all' : sel.start === sel.end ? sel.start : null
  const rangeOn = single === null
  const x = useSharedValue(indexOf(single ?? 'all') * STEP)
  const target = useRef<Day | null>(single)

  const offset = useRef(0)

  const slideTo = (d: Day) => {
    target.current = d
    const i = indexOf(d)
    x.value = withTiming(i * STEP, { duration: reduced ? 0 : 240, easing: EASE })
    // Scroll only when the day sits off (or half off) the visible strip — a
    // tap on a day you can already see must never move the row under you.
    const w = stripW.current
    const left = STRIP_PAD + i * STEP
    if (w > 0 && (left < offset.current || left + ITEM_W > offset.current + w)) {
      scrollRef.current?.scrollTo({
        x: Math.max(0, left + ITEM_W / 2 - w / 2),
        animated: !reduced,
      })
    }
  }
  // A change from outside (the calendar picker, the empty day's "jump to
  // next" button, the range bar's ×).
  // oxlint-disable react/exhaustive-deps -- slideTo only reads refs + shared values
  useEffect(() => {
    if (single === target.current) return
    if (single === null) target.current = null
    else slideTo(single)
  }, [single])
  // oxlint-enable react/exhaustive-deps

  const ring = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const month = new Intl.DateTimeFormat(dateLocale(), { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${today}T16:00:00Z`))
    .replace('.', '')

  return (
    <View className="flex-row items-start">
      {/* The calendar, pinned outside the scroller so it's always the first
          thing on the row — a specific date, or a range, without swiping a
          fortnight of chips. Aligned with the day circles, not the row. */}
      <View style={{ marginTop: 18 }}>
        <IconButton
          size={DOT}
          kind={rangeOn ? 'accent' : 'chip'}
          accessibilityLabel={t('events.dates_title')}
          onPress={() => {
            tapSelect()
            onOpenPicker()
          }}
          icon={<CalendarIcon size={17} color={rangeOn ? 'on-accent' : 'text'} />}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mr-5 flex-1"
        contentContainerStyle={{ paddingLeft: STRIP_PAD, paddingRight: 20 }}
        decelerationRate="normal"
        scrollEventThrottle={32}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.x
        }}
        onLayout={(e) => {
          stripW.current = e.nativeEvent.layout.width
        }}
      >
        <View className="flex-row" style={{ gap: ITEM_GAP }}>
          {/* The selected circle — slides between dates on the UI thread.
              A range has no single day to sit on, so it steps aside. */}
          {!rangeOn ? (
            <Animated.View
              pointerEvents="none"
              className="absolute rounded-pill bg-ink"
              style={[{ left: (ITEM_W - DOT) / 2, top: 18, width: DOT, height: DOT }, ring]}
            />
          ) : null}
          {items.map((d) => {
            const on = d === single
            // Inside an active range: tinted rather than circled.
            const band = rangeOn && d !== 'all' && inDayRange(d, sel)
            const date = d === 'all' ? null : new Date(`${d}T16:00:00Z`)
            const top =
              d === 'all'
                ? month
                : d === today
                  ? t('events.today')
                  : new Intl.DateTimeFormat(dateLocale(), { weekday: 'short', timeZone: 'UTC' })
                      .format(date as Date)
                      .replace('.', '')
            const num =
              d === 'all'
                ? t('events.all_days')
                : new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', timeZone: 'UTC' }).format(
                    date as Date,
                  )
            const dots = d === 'all' ? 0 : Math.min(countByDay.get(d) ?? 0, 2)
            const fg = on ? 'text-on-ink' : band ? 'text-on-accent' : 'text-text'
            return (
              <Pressable
                key={d}
                accessibilityRole="tab"
                accessibilityState={{ selected: on || band }}
                accessibilityLabel={d === 'all' ? t('events.all_days') : `${top} ${num}`}
                onPress={() => {
                  if (on) return
                  tapSelect()
                  slideTo(d)
                  // A tap always collapses to this one day — including out of
                  // a range, which is the strip's own way to leave one.
                  startTransition(() => onChange(d === 'all' ? null : { start: d, end: d }))
                }}
                style={{ width: ITEM_W }}
                className="items-center pb-1"
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.1}
                  className={`h-[18px] font-ui-semibold text-[10px] uppercase tracking-eyebrow ${d === today ? 'text-accent' : 'text-text-faint'}`}
                >
                  {top}
                </Text>
                <View
                  style={{ width: DOT, height: DOT }}
                  className={`items-center justify-center ${band ? 'rounded-pill bg-accent-fill' : ''}`}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.1}
                    style={d === 'all' ? undefined : DATA_FIGURES}
                    className={
                      d === 'all'
                        ? `font-ui-semibold text-micro ${fg}`
                        : `font-serif text-serif-sm ${fg}`
                    }
                  >
                    {num}
                  </Text>
                </View>
                <View className="mt-1 h-1 flex-row gap-0.5">
                  {Array.from({ length: dots }, (_, n) => (
                    <View key={n} className="h-1 w-1 rounded-pill bg-accent" />
                  ))}
                </View>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
})
