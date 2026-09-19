import { EmptyState, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { CAT_CLASSES, CAT_ORDER, type CatKey, categoryKey } from '@/lib/eventCategory'
import { nextDays, sdDayKey } from '@/lib/eventTime'
import { tapSelect } from '@/lib/haptics'
import { dateLocale, useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { CategoryIcon, EventHeroCard, EventTicket, useNow } from './EventTicket'
import { EASE } from './motion'

// Explore's "Eventos" (M21, redesigned for color + motion): a day strip
// (Todo · Hoy · Mañana · Dom 20 …) whose filled pill slides to the tapped
// day, category chips with their own hue, a "Destacados" carousel of the next
// few events as full-bleed photo cards, then ticket-stub cards for everything
// that matches. One `upcoming` fetch; day/category filtering is client-side.

type Day = 'all' | string

export function EventsBrowse() {
  const t = useT()
  const now = useNow()
  const [day, setDay] = useState<Day>('all')
  const [cat, setCat] = useState<CatKey | 'all'>('all')
  const q = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events?when=upcoming'),
  })
  const all = q.data?.events ?? []

  const days = useMemo(() => nextDays(14, now), [now])
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
      <DayStrip days={days} value={day} onChange={setDay} catsByDay={catsByDay} now={now} />

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

// ── Day strip with a sliding selected fill ──────────────────────────────────
function DayStrip({
  days,
  value,
  onChange,
  catsByDay,
  now,
}: {
  days: string[]
  value: Day
  onChange: (d: Day) => void
  catsByDay: Map<string, CatKey[]>
  now: Date
}) {
  const t = useT()
  const reduced = useReducedMotion()
  const scrollRef = useRef<ScrollView>(null)
  const layouts = useRef<Record<string, { x: number; w: number }>>({})
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  const [stripW, setStripW] = useState(0)
  const today = sdDayKey(now)

  const moveTo = (key: Day, animate: boolean) => {
    const l = layouts.current[key]
    if (!l) return
    const cfg = { duration: reduced || !animate ? 0 : 260, easing: EASE }
    x.value = withTiming(l.x, cfg)
    w.value = withTiming(l.w, cfg)
    if (stripW > 0)
      scrollRef.current?.scrollTo({ x: Math.max(0, l.x - stripW / 2 + l.w / 2), animated: animate })
  }
  const fill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }))

  const label = (d: string) => {
    if (d === today) return { top: t('events.today'), bottom: '' }
    const date = new Date(`${d}T16:00:00Z`)
    const dow = new Intl.DateTimeFormat(dateLocale(), { weekday: 'short', timeZone: 'UTC' })
      .format(date)
      .replace('.', '')
    const num = new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', timeZone: 'UTC' }).format(
      date,
    )
    const tomorrow = nextDays(2, now)[1]
    return { top: d === tomorrow ? t('events.tomorrow') : dow, bottom: num }
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerClassName="px-5"
      onLayout={(e) => setStripW(e.nativeEvent.layout.width)}
    >
      <View className="flex-row gap-1.5">
        <Animated.View
          pointerEvents="none"
          className="absolute top-0 bottom-0 rounded-card bg-btn-primary-bg"
          style={fill}
        />
        {(['all', ...days] as Day[]).map((d) => {
          const on = d === value
          const l = d === 'all' ? { top: t('events.all_days'), bottom: '' } : label(d)
          const dots = d === 'all' ? [] : (catsByDay.get(d) ?? []).slice(0, 3)
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onLayout={(e) => {
                layouts.current[d] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }
                if (d === value) moveTo(d, false)
              }}
              onPress={() => {
                if (on) return
                tapSelect()
                moveTo(d, true)
                onChange(d)
              }}
              className={`min-h-[60px] min-w-[52px] items-center justify-center rounded-card px-3 py-2 ${on ? '' : 'bg-surface border border-line'}`}
            >
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className={`font-ui-semibold text-micro uppercase ${on ? 'text-btn-primary-fg' : 'text-text-muted'}`}
              >
                {l.top}
              </Text>
              {l.bottom ? (
                <Text
                  maxFontSizeMultiplier={1.1}
                  className={`font-serif-semibold text-serif-md ${on ? 'text-btn-primary-fg' : 'text-text'}`}
                >
                  {l.bottom}
                </Text>
              ) : null}
              <View className="mt-0.5 h-1.5 flex-row gap-0.5">
                {dots.map((c) => (
                  <Animated.View
                    key={c}
                    entering={FadeIn.duration(220)}
                    className={`h-1.5 w-1.5 rounded-pill ${CAT_CLASSES[c].bg}`}
                  />
                ))}
              </View>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

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
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="-mx-5"
        contentContainerStyle={{ paddingHorizontal: 20, gap }}
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
