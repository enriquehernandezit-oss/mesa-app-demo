import { useQuery } from '@tanstack/react-query'
import { memo, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { CAT_CLASSES, CAT_ORDER, type CatKey, categoryKey } from '@/lib/eventCategory'
import { nextDays, sdDayKey } from '@/lib/eventTime'
import { tapSelect } from '@/lib/haptics'
import { dateLocale, useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'

import { CategoryIcon, EventHeroCard, EventTicket, useNow } from './EventTicket'
import { EASE } from './motion'

// Explore's "Eventos" (M21, redesigned for color + motion): a day strip
// (Todo · Hoy · Mañana · Dom 20 …) whose selected circle slides to the
// tapped day, category chips with their own hue, a "Destacados" carousel of the next
// few events as full-bleed photo cards, then ticket-stub cards for everything
// that matches. One `upcoming` fetch; day/category filtering is client-side.

type Day = 'all' | string

// A stable reference for the "no data yet" case — `data?.events ?? []` would
// otherwise hand `all` a fresh array every render, defeating catsByDay's memo.
const EMPTY_EVENTS: EventSummary[] = []

export function EventsBrowse() {
  const t = useT()
  const now = useNow()
  const [day, setDay] = useState<Day>('all')
  const [cat, setCat] = useState<CatKey | 'all'>('all')
  const q = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events?when=upcoming'),
  })
  const all = q.data?.events ?? EMPTY_EVENTS

  // Keyed on the SD calendar day, not on `now` — useNow ticks every minute,
  // and a fresh array each tick re-rendered the whole strip for nothing.
  const today = sdDayKey(now)
  const days = useMemo(() => nextDays(14, new Date(`${today}T16:00:00Z`)), [today])
  // Which categories fall on each day — the little colored dots in the strip.
  const catsByDay = useMemo(() => {
    const m = new Map<string, CatKey[]>()
    for (const e of all) {
      const k = sdDayKey(e.startsAt)
      const c = categoryKey(e.category, e.title)
      const cur = m.get(k) ?? []
      if (!cur.includes(c)) cur.push(c)
      m.set(k, cur)
    }
    return m
  }, [all])

  const matchesCat = (e: EventSummary) => cat === 'all' || categoryKey(e.category, e.title) === cat
  const shown = all.filter((e) => matchesCat(e) && (day === 'all' || sdDayKey(e.startsAt) === day))
  const featured = day === 'all' && cat === 'all' ? all.slice(0, 3) : []
  const list = featured.length > 0 ? shown.slice(featured.length) : shown
  const nextDay =
    shown.length === 0 && day !== 'all'
      ? all.find((e) => matchesCat(e) && sdDayKey(e.startsAt) > day)
      : undefined

  return (
    <View className="mt-3">
      <DayStrip days={days} value={day} onChange={setDay} catsByDay={catsByDay} today={today} />

      {/* Category chips — each one wears its own hue */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5 mt-3"
        contentContainerClassName="gap-2 px-5"
      >
        <CatChip
          label={t('events.all_cats')}
          active={cat === 'all'}
          onPress={() => setCat('all')}
        />
        {CAT_ORDER.map((c) => (
          <CatChip
            key={c}
            cat={c}
            label={t(`events.cat_${c}`)}
            active={cat === c}
            onPress={() => setCat(cat === c ? 'all' : c)}
          />
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
          {featured.length > 0 ? <Featured events={featured} now={now} /> : null}
          <View className="mt-4">
            {list.map((e, i) => (
              <EventTicket key={`${day}-${cat}-${e.id}`} e={e} index={i} now={now} />
            ))}
          </View>
          {shown.length === 0 ? (
            <View className="items-center">
              <EmptyState>
                {day === 'all' ? t('events.no_match') : t('events.empty_day')}
              </EmptyState>
              {nextDay ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDay(sdDayKey(nextDay.startsAt))}
                  className="mt-3 min-h-[44px] justify-center rounded-pill bg-btn-primary-bg px-5 active:opacity-80"
                >
                  <Text className="font-ui-semibold text-label text-btn-primary-fg">
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
}

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
const DOT = 36
const STRIP_PAD = 20

const DayStrip = memo(function DayStrip({
  days,
  value,
  onChange,
  catsByDay,
  today,
}: {
  days: string[]
  value: Day
  onChange: (d: Day) => void
  catsByDay: Map<string, CatKey[]>
  today: string
}) {
  const t = useT()
  const reduced = useReducedMotion()
  const scrollRef = useRef<ScrollView>(null)
  const stripW = useRef(0)
  const items = useMemo(() => ['all', ...days] as Day[], [days])
  const indexOf = (d: Day) => Math.max(0, items.indexOf(d))
  const x = useSharedValue(indexOf(value) * STEP)
  const target = useRef(value)

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
  // A change from outside (the empty day's "jump to next" button).
  // oxlint-disable react/exhaustive-deps -- slideTo only reads refs + shared values
  useEffect(() => {
    if (value !== target.current) slideTo(value)
  }, [value])
  // oxlint-enable react/exhaustive-deps

  const ring = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const month = new Intl.DateTimeFormat(dateLocale(), { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${today}T16:00:00Z`))
    .replace('.', '')

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerStyle={{ paddingHorizontal: STRIP_PAD }}
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
        {/* The selected circle — slides between dates on the UI thread */}
        <Animated.View
          pointerEvents="none"
          className="absolute rounded-pill bg-btn-primary-bg"
          style={[{ left: (ITEM_W - DOT) / 2, top: 18, width: DOT, height: DOT }, ring]}
        />
        {items.map((d) => {
          const on = d === value
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
          const dots = d === 'all' ? [] : (catsByDay.get(d) ?? []).slice(0, 3)
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={d === 'all' ? t('events.all_days') : `${top} ${num}`}
              onPress={() => {
                if (on) return
                tapSelect()
                slideTo(d)
                startTransition(() => onChange(d))
              }}
              style={{ width: ITEM_W }}
              className="items-center pb-1"
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
                className={`h-[18px] font-ui-semibold text-[10px] uppercase tracking-eyebrow ${d === today ? 'text-accent-strong' : 'text-text-faint'}`}
              >
                {top}
              </Text>
              <View style={{ width: DOT, height: DOT }} className="items-center justify-center">
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.1}
                  style={d === 'all' ? undefined : DATA_FIGURES}
                  className={
                    d === 'all'
                      ? `font-ui-semibold text-micro ${on ? 'text-btn-primary-fg' : 'text-text'}`
                      : `font-serif-semibold text-serif-sm ${on ? 'text-btn-primary-fg' : 'text-text'}`
                  }
                >
                  {num}
                </Text>
              </View>
              <View className="mt-1 h-1 flex-row gap-0.5">
                {dots.map((c) => (
                  <View key={c} className={`h-1 w-1 rounded-pill ${CAT_CLASSES[c].bg}`} />
                ))}
              </View>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
})

function CatChip({
  cat,
  label,
  active,
  onPress,
}: {
  cat?: CatKey
  label: string
  active: boolean
  onPress: () => void
}) {
  const cls = cat ? CAT_CLASSES[cat] : CAT_CLASSES.default
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        tapSelect()
        onPress()
      }}
      className={`min-h-[36px] flex-row items-center gap-1.5 rounded-pill border px-3 active:scale-[0.97] ${active ? `${cls.bg} ${cls.border}` : 'border-line-strong bg-surface'}`}
    >
      {cat ? <CategoryIcon cat={cat} size={13} color={active ? 'on-cat' : undefined} /> : null}
      <Text
        className={`font-ui-semibold text-micro ${active ? (cat ? 'text-on-cat' : 'text-on-accent') : 'text-text'}`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// ── "Destacados" carousel: centered card full size, neighbours shrink/dim ───
function Featured({ events, now }: { events: EventSummary[]; now: Date }) {
  const t = useT()
  const { width } = useWindowDimensions()
  const cardW = Math.round(width * 0.82)
  const gap = 12
  const step = cardW + gap
  const scrollX = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x
  })
  return (
    <View className="mt-5">
      <Text className="mb-2 font-ui-semibold text-eyebrow uppercase tracking-eyebrow text-accent-strong">
        {t('events.featured')}
      </Text>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        // One card per swipe, and a trailing pad so the LAST card can reach
        // its snap point too — without it the final offset was shorter than
        // 2 × step, so the carousel fought the finger at the end.
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="-mx-5"
        contentContainerStyle={{ paddingLeft: 20, paddingRight: width - cardW - 20, gap }}
      >
        {events.map((e, i) => (
          <FeaturedSlot key={e.id} index={i} step={step} scrollX={scrollX}>
            <EventHeroCard e={e} width={cardW} now={now} />
          </FeaturedSlot>
        ))}
      </Animated.ScrollView>
    </View>
  )
}

function FeaturedSlot({
  index,
  step,
  scrollX,
  children,
}: {
  index: number
  step: number
  scrollX: SharedValue<number>
  children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  const style = useAnimatedStyle(() => {
    if (reduced) return {}
    const d = Math.abs(scrollX.value - index * step) / step
    return {
      opacity: interpolate(d, [0, 1], [1, 0.72], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.94], Extrapolation.CLAMP) }],
    }
  })
  return <Animated.View style={style}>{children}</Animated.View>
}
