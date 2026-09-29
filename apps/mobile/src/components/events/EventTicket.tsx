import { LinearGradient } from 'expo-linear-gradient'
import { Link } from 'expo-router'
import { useState, useSyncExternalStore } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeInLeft,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated'

import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import {
  BookmarkFilledIcon,
  BookmarkIcon,
  CheckIcon,
  CocktailIcon,
  ForkKnifeIcon,
  MusicIcon,
  SparkleIcon,
  SunIcon,
  WineGlassIcon,
} from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { useEventSave } from '@/hooks/useEventSave'
import { eventCategoryLabel, eventPriceLabel } from '@/lib/display'
import { CAT_ICON, type CatKey, categoryKey } from '@/lib/eventCategory'
import { goingLabel } from '@/lib/eventGoing'
import { type Countdown, countdown, isImminent } from '@/lib/eventTime'
import { dateLocale, useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

import { AnimatedBar, BurstDots, PulseDot, usePop, useStaggerEntering } from './motion'

// Eventos' building blocks (Redesign 2): a ticket-stub list card and a compact rail card, sharing the
// category ICON (lib/eventCategory — kinds are told apart by icon, never by colour), the live
// countdown (lib/eventTime) and the optimistic RSVP (hooks/useEventRsvp). The big photo card is
// EventHero.tsx.

const CAT_LAYOUT = LinearTransition.springify().damping(18)

export function CategoryIcon({
  cat,
  size = 14,
  color = 'accent',
}: {
  cat: CatKey
  size?: number
  color?: Parameters<typeof WineGlassIcon>[0]['color']
}) {
  const icon = CAT_ICON[cat]
  if (icon === 'wine') return <WineGlassIcon size={size} color={color} />
  if (icon === 'music') return <MusicIcon size={size} color={color} />
  if (icon === 'sun') return <SunIcon size={size} color={color} />
  if (icon === 'fork') return <ForkKnifeIcon size={size} color={color} />
  if (icon === 'cocktail') return <CocktailIcon size={size} color={color} />
  return <SparkleIcon size={size} color={color} />
}

// Re-render once a minute so countdowns stay honest while a screen is open.
// ONE ticker for the whole app, not one per caller. This used to open its own
// setInterval inside every component that called it — and two of those callers
// are per-ROW ticket cards (Rankings' saved events, Profile's "you're going"),
// so a long list ran a timer per row, each waking the JS thread on its own
// schedule for a label that changes once a minute. A shared subscription also
// means the interval stops entirely when nothing is mounted that needs it.
let sharedNow = new Date()
let ticker: ReturnType<typeof setInterval> | null = null
const tickListeners = new Set<() => void>()

function subscribeToNow(onTick: () => void): () => void {
  tickListeners.add(onTick)
  if (!ticker) {
    ticker = setInterval(() => {
      sharedNow = new Date()
      for (const listener of tickListeners) listener()
    }, 60_000)
  }
  return () => {
    tickListeners.delete(onTick)
    if (tickListeners.size === 0 && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }
}

export function useNow(): Date {
  // The snapshot is the same Date object between ticks, which is what keeps
  // useSyncExternalStore from re-rendering on every commit.
  return useSyncExternalStore(subscribeToNow, () => sharedNow)
}

export function countdownLabel(t: ReturnType<typeof useT>, c: Countdown): string {
  if (c.kind === 'live') return t('events.cd_live')
  if (c.kind === 'ended') return t('events.cd_ended')
  if (c.kind === 'minutes') return t('events.cd_minutes', { n: c.n })
  if (c.kind === 'hours')
    return c.m > 0 ? t('events.cd_hours_min', { h: c.h, m: c.m }) : t('events.cd_hours', { h: c.h })
  if (c.kind === 'tomorrow') return t('events.cd_tomorrow')
  return t('events.cd_days', { n: c.n })
}

// When it starts. Quiet muted text ("In 5 days") until it matters — imminent (a pulsing dot) or
// happening now ("Live · until 4:00 PM") turns it into the accent pill — and a dark glass pill over a
// photo.
export function CountdownChip({
  e,
  now,
  onPhoto,
}: {
  e: EventSummary
  now: Date
  onPhoto?: boolean
}) {
  const t = useT()
  const c = countdown(e.startsAt, e.endsAt, now)
  const live = c.kind === 'live'
  const hot = isImminent(c)
  const label = live ? liveLabel(t, e) : countdownLabel(t, c)
  if (!live && !hot && !onPhoto) {
    return (
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-micro text-text-muted">
        {label}
      </Text>
    )
  }
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-pill px-2.5 py-1 ${live || hot ? 'bg-accent-fill' : 'bg-photo-scrim'}`}
    >
      {live || hot ? <PulseDot color="on-accent" size={6} /> : null}
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold text-micro ${live || hot ? 'text-on-accent' : 'text-on-photo'}`}
      >
        {label}
      </Text>
    </View>
  )
}

// "Live · until 4:00 PM" (or just "Live now" when there's no end time).
export function liveLabel(t: ReturnType<typeof useT>, e: EventSummary): string {
  if (!e.endsAt) return t('events.live_now')
  const time = new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).format(
    new Date(e.endsAt),
  )
  return t('events.live_chip', { time })
}

export function stubParts(iso: string) {
  const d = new Date(iso)
  const loc = dateLocale()
  return {
    dow: new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(d).replace('.', ''),
    day: new Intl.DateTimeFormat(loc, { day: 'numeric' }).format(d),
    month: new Intl.DateTimeFormat(loc, { month: 'short' }).format(d).replace('.', ''),
    time: new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(d),
  }
}

// "12/16 spots" line + animated bar. Turns urgent at ≤3 left.
export function SpotsLine({
  capacity,
  spotsLeft,
  compact,
}: {
  capacity: number
  spotsLeft: number
  compact?: boolean
}) {
  const t = useT()
  const taken = capacity - spotsLeft
  const urgent = spotsLeft <= 3
  const label =
    spotsLeft === 0
      ? t('events.sold_out')
      : urgent
        ? t('events.last_spots', { n: spotsLeft })
        : t('events.spots_left', { n: spotsLeft })
  return (
    <View className={compact ? 'mt-2' : 'mt-3'}>
      <View className="mb-1 flex-row items-baseline justify-between">
        <Caption
          className={`font-ui-semibold text-micro ${urgent ? 'text-danger' : 'text-accent'}`}
        >
          {label}
        </Caption>
        <Caption style={DATA_FIGURES} className="text-micro">
          {taken}/{capacity}
        </Caption>
      </View>
      <AnimatedBar
        ratio={taken / capacity}
        fillClass={urgent ? 'bg-danger' : 'bg-accent-fill'}
        trackClass="bg-bg-sunk"
        height={compact ? 4 : 6}
      />
    </View>
  )
}

// Overlapping friend faces that slide in one after another.
export function FacesStack({
  faces,
  label,
  size = 22,
}: {
  faces: EventSummary['friendsGoing']
  label?: string
  size?: number
}) {
  const reduced = useReducedMotion()
  if (faces.length === 0 && !label) return null
  return (
    <View className="flex-row items-center">
      {faces.slice(0, 4).map((f, i) => (
        <Animated.View
          key={f.id}
          entering={reduced ? FadeIn.duration(160) : FadeInLeft.duration(260).delay(120 + i * 70)}
          style={{ marginLeft: i === 0 ? 0 : -size / 3, zIndex: 10 - i }}
          className="rounded-pill border-2 border-surface"
        >
          <Avatar name={f.name} src={f.image} size={size} />
        </Animated.View>
      ))}
      {label ? <Caption className="ml-2 text-micro">{label}</Caption> : null}
    </View>
  )
}
// The two RSVP controls, with pop + burst + haptic.
export function RsvpButtons({
  e,
  rsvpState,
  size = 'sm',
}: {
  e: EventSummary
  // The owner's useEventRsvp — shared so the card's spots bar and these
  // buttons move together on the same tap.
  rsvpState: ReturnType<typeof useEventRsvp>
  size?: 'sm' | 'md'
}) {
  const t = useT()
  const { rsvp, toggle } = rsvpState
  const going = rsvp === 'going'
  const save = useEventSave(e)
  const goingPop = usePop()
  const heartPop = usePop()
  const [burst, setBurst] = useState(0)
  const md = size === 'md'
  return (
    <View className="flex-row items-center gap-2">
      {/* Save (bookmark) — into Saved → Events. A save is independent of going, and it's
          how an event gets kept (events never go into custom lists). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={save.saved ? t('events.unsave_cta') : t('events.save_cta')}
        accessibilityState={{ selected: save.saved }}
        hitSlop={6}
        onPress={() => {
          heartPop.pop()
          save.toggle()
        }}
        className={`items-center justify-center rounded-pill border ${md ? 'h-12 w-12' : 'h-[34px] w-[34px]'} ${save.saved ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}
      >
        <Animated.View style={heartPop.style}>
          {save.saved ? (
            <BookmarkFilledIcon size={md ? 20 : 16} color="accent" />
          ) : (
            <BookmarkIcon size={md ? 20 : 16} color="text-muted" />
          )}
        </Animated.View>
      </Pressable>
      <Animated.View style={goingPop.style} className={md ? 'flex-1' : undefined}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: going }}
          onPress={() => {
            goingPop.pop()
            if (!going) setBurst((b) => b + 1)
            toggle('going')
          }}
          className={`flex-row items-center justify-center gap-1.5 rounded-pill ${md ? 'h-12 px-6' : 'h-[34px] px-4'} ${going ? 'bg-accent-fill' : 'bg-ink'}`}
        >
          {going ? <CheckIcon size={md ? 16 : 13} color="on-accent" strokeWidth={2.2} /> : null}
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className={`font-ui-semibold ${md ? 'text-body' : 'text-label'} ${going ? 'text-on-accent' : 'text-on-ink'}`}
          >
            {going ? t('events.going_done') : t('events.going_cta')}
          </Text>
          <BurstDots trigger={burst} color="accent" />
        </Pressable>
      </Animated.View>
    </View>
  )
}

// An honesty mark, not a feature badge — the seeded/mock events sit on real
// Santo Domingo restaurants that haven't confirmed them (e.venueConfirmed),
// so every card and the detail page say so in plain, quiet text: no pill, no
// border, no icon, and never an accent (it would read as
// promotion, the opposite of the point). `tone="on-photo"` for the two cards
// that render this over a photo; the plain-card default otherwise.
function SampleMark({ tone = 'muted' }: { tone?: 'muted' | 'on-photo' }) {
  const t = useT()
  return (
    <Text
      numberOfLines={1}
      className={`font-ui text-micro ${tone === 'on-photo' ? 'text-on-photo-2' : 'text-text-muted'}`}
    >
      {t('events.sample_mark')}
    </Text>
  )
}

// ── Ticket card (the list) ────────────────────────────────────────────────
// A raised r26 card: the date set like a ticket on a stub at the left (a dashed seam), and at the
// right the kind (icon + word), when, the title, where, how many spots are left, who is going —
// and the two actions (save, I'm going).
export function EventTicket({ e, index = 0, now }: { e: EventSummary; index?: number; now: Date }) {
  const t = useT()
  const lift = useLift()
  const cat = categoryKey(e.category, e.title)
  const s = stubParts(e.startsAt)
  const rsvpState = useEventRsvp(e)
  const { goingCount, spotsLeft } = rsvpState
  const entering = useStaggerEntering(index)
  return (
    <Animated.View entering={entering} layout={CAT_LAYOUT} className="mb-2.5">
      <Link href={`/events/${e.id}`} asChild>
        <Pressable
          className="flex-row overflow-hidden rounded-[26px] bg-surface active:opacity-90"
          style={lift}
        >
          {/* The stub — the date, in the accent */}
          <View className="w-[84px] items-center justify-center py-3">
            <Text
              maxFontSizeMultiplier={1.1}
              className="font-ui-semibold text-micro uppercase tracking-eyebrow text-accent"
            >
              {s.dow}
            </Text>
            <Text
              style={DATA_FIGURES}
              maxFontSizeMultiplier={1.1}
              className="font-serif text-rank leading-[48px] text-accent"
            >
              {s.day}
            </Text>
            <Text
              maxFontSizeMultiplier={1.1}
              className="font-ui-semibold text-micro uppercase tracking-eyebrow text-accent"
            >
              {s.month}
            </Text>
            <Text maxFontSizeMultiplier={1.1} className="mt-1 font-ui text-eyebrow text-text-muted">
              {s.time}
            </Text>
          </View>
          <View className="my-3 w-0 border-l border-dashed border-line-strong" />
          <View className="min-w-0 flex-1 px-3.5 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                <CategoryIcon cat={cat} size={13} />
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="shrink font-ui-semibold text-micro text-accent"
                >
                  {eventCategoryLabel(e.category) ?? t('events.cat_default')}
                </Text>
              </View>
              <CountdownChip e={e} now={now} />
            </View>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1.5 font-serif text-serif-md text-text"
            >
              {e.title}
            </Text>
            <Caption numberOfLines={1} className="mt-0.5 text-meta">
              {[e.restaurant.name, eventPriceLabel(e.priceLabel)].filter(Boolean).join(' · ')}
            </Caption>
            {!e.venueConfirmed ? <SampleMark /> : null}
            {e.capacity != null && spotsLeft != null ? (
              <SpotsLine capacity={e.capacity} spotsLeft={spotsLeft} compact />
            ) : null}
            <View className="mt-2.5 flex-row items-center gap-2">
              <View className="min-w-0 flex-1">
                <FacesStack
                  faces={e.friendsGoing}
                  label={goingLabel(t, { friendsGoingCount: e.friendsGoingCount, goingCount })}
                />
              </View>
              <RsvpButtons e={e} rsvpState={rsvpState} />
            </View>
          </View>
        </Pressable>
      </Link>
    </Animated.View>
  )
}

// ── Mini card (feed "This weekend", restaurant "Upcoming events") ───────────
export function EventMiniCard({ e, now }: { e: EventSummary; now: Date }) {
  const lift = useLift()
  const cat = categoryKey(e.category, e.title)
  const s = stubParts(e.startsAt)
  const scrim = useColor('photo-scrim')
  return (
    <Link href={`/events/${e.id}`} asChild>
      <Pressable className="w-48 rounded-card bg-surface active:opacity-85" style={lift}>
        <View className="overflow-hidden rounded-card">
          <View className="h-28 w-full">
            <PlaceCover
              name={e.title}
              coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
              size={{ w: 400, h: 240 }}
              className="h-full w-full rounded-none"
            />
            <LinearGradient
              colors={['transparent', scrim]}
              locations={[0.4, 1]}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            <View className="absolute top-2 left-2 items-center rounded-sm bg-accent-fill px-2 py-1">
              <Text style={DATA_FIGURES} className="font-serif text-serif-sm text-on-accent">
                {s.day}
              </Text>
              <Text className="font-ui-semibold text-micro uppercase text-on-accent">
                {s.month}
              </Text>
            </View>
            <View className="absolute bottom-2 left-2">
              <CountdownChip e={e} now={now} onPhoto />
            </View>
          </View>
          <View className="px-3 pt-2 pb-3">
            <View className="flex-row items-center gap-1 pr-1">
              <CategoryIcon cat={cat} size={12} />
              <Text numberOfLines={1} className="shrink font-ui-semibold text-micro text-accent">
                {eventCategoryLabel(e.category)}
              </Text>
            </View>
            <Text numberOfLines={1} className="mt-0.5 font-serif text-serif-sm text-text">
              {e.title}
            </Text>
            <Caption numberOfLines={1} className="text-micro">
              {e.restaurant.name} · {s.time}
            </Caption>
            {!e.venueConfirmed ? <SampleMark /> : null}
          </View>
        </View>
      </Pressable>
    </Link>
  )
}
