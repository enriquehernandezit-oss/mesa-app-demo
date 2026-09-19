import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import {
  CheckIcon,
  CocktailIcon,
  ForkKnifeIcon,
  HeartFilledIcon,
  HeartIcon,
  MusicIcon,
  SparkleIcon,
  SunIcon,
  WineGlassIcon,
} from '@/components/ui/icons'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { CAT_CLASSES, CAT_TOKEN, type CatKey, categoryKey } from '@/lib/eventCategory'
import { type Countdown, countdown, isImminent } from '@/lib/eventTime'
import { dateLocale, useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { DATA_FIGURES } from '@/theme/vars'
import { LinearGradient } from 'expo-linear-gradient'
import { Link } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeInLeft,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated'
import { AnimatedBar, BurstDots, PulseDot, usePop, useStaggerEntering } from './motion'

// Eventos' building blocks (the redesign — color, motion, one-tap actions):
// a ticket-stub list card, a full-bleed hero card, and a compact rail card,
// all sharing the category color (lib/eventCategory), the live countdown
// (lib/eventTime) and the optimistic RSVP (hooks/useEventRsvp).

const CAT_LAYOUT = LinearTransition.springify().damping(18)

export function CategoryIcon({
  cat,
  size = 14,
  color,
}: {
  cat: CatKey
  size?: number
  color?: Parameters<typeof WineGlassIcon>[0]['color']
}) {
  const c = color ?? CAT_TOKEN[cat]
  if (cat === 'cata') return <WineGlassIcon size={size} color={c} />
  if (cat === 'musica') return <MusicIcon size={size} color={c} />
  if (cat === 'brunch') return <SunIcon size={size} color={c} />
  if (cat === 'food') return <ForkKnifeIcon size={size} color={c} />
  if (cat === 'happy') return <CocktailIcon size={size} color={c} />
  return <SparkleIcon size={size} color={c} />
}

// Re-render once a minute so countdowns stay honest while a screen is open.
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
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

// "¡Hoy · en 3 h!" pill. Pulsing dot when it's imminent.
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
  const cat = categoryKey(e.category, e.title)
  const c = countdown(e.startsAt, e.endsAt, now)
  const hot = isImminent(c)
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-pill px-2.5 py-1 ${hot ? CAT_CLASSES[cat].bg : onPhoto ? 'bg-photo-scrim' : CAT_CLASSES[cat].soft}`}
    >
      {hot ? <PulseDot color="on-cat" size={6} /> : null}
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold text-micro ${hot ? 'text-on-cat' : onPhoto ? 'text-on-photo' : CAT_CLASSES[cat].text}`}
      >
        {countdownLabel(t, c)}
      </Text>
    </View>
  )
}

function stubParts(iso: string) {
  const d = new Date(iso)
  const loc = dateLocale()
  return {
    dow: new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(d).replace('.', ''),
    day: new Intl.DateTimeFormat(loc, { day: 'numeric' }).format(d),
    month: new Intl.DateTimeFormat(loc, { month: 'short' }).format(d).replace('.', ''),
    time: new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(d),
  }
}

// "12/16 cupos" line + animated bar. Turns urgent at ≤3 left.
export function SpotsLine({
  capacity,
  spotsLeft,
  cat,
  compact,
}: {
  capacity: number
  spotsLeft: number
  cat: CatKey
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
          className={`font-ui-semibold text-micro ${urgent ? 'text-status-packed' : CAT_CLASSES[cat].text}`}
        >
          {label}
        </Caption>
        <Caption style={DATA_FIGURES} className="text-micro">
          {taken}/{capacity}
        </Caption>
      </View>
      <AnimatedBar
        ratio={taken / capacity}
        fillClass={urgent ? 'bg-status-packed' : CAT_CLASSES[cat].bg}
        trackClass={CAT_CLASSES[cat].soft}
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
  const cat = categoryKey(e.category, e.title)
  const { rsvp, toggle } = rsvpState
  const going = rsvp === 'going'
  const interested = rsvp === 'interested'
  const goingPop = usePop()
  const heartPop = usePop()
  const [burst, setBurst] = useState(0)
  const md = size === 'md'
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('events.interested_cta')}
        accessibilityState={{ selected: interested }}
        hitSlop={6}
        onPress={() => {
          heartPop.pop()
          toggle('interested')
        }}
        className={`items-center justify-center rounded-pill border ${md ? 'h-12 w-12' : 'h-9 w-9'} ${interested ? `${CAT_CLASSES[cat].border} ${CAT_CLASSES[cat].soft}` : 'border-line-strong'}`}
      >
        <Animated.View style={heartPop.style}>
          {interested ? (
            <HeartFilledIcon size={md ? 20 : 16} color={CAT_TOKEN[cat]} />
          ) : (
            <HeartIcon size={md ? 20 : 16} color="text-muted" />
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
          className={`flex-row items-center justify-center gap-1.5 rounded-pill ${md ? 'h-12 px-6' : 'h-9 px-4'} ${going ? CAT_CLASSES[cat].bg : 'bg-btn-primary-bg'}`}
        >
          {going ? <CheckIcon size={md ? 16 : 13} color="on-cat" strokeWidth={2.2} /> : null}
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className={`font-ui-semibold ${md ? 'text-body' : 'text-label'} ${going ? 'text-on-cat' : 'text-btn-primary-fg'}`}
          >
            {going ? t('events.going_done') : t('events.going_cta')}
          </Text>
          <BurstDots trigger={burst} color={CAT_TOKEN[cat]} />
        </Pressable>
      </Animated.View>
    </View>
  )
}

// ── Ticket card (the list) ────────────────────────────────────────────────
export function EventTicket({ e, index = 0, now }: { e: EventSummary; index?: number; now: Date }) {
  const t = useT()
  const cat = categoryKey(e.category, e.title)
  const cls = CAT_CLASSES[cat]
  const s = stubParts(e.startsAt)
  const rsvpState = useEventRsvp(e)
  const { goingCount, spotsLeft } = rsvpState
  const entering = useStaggerEntering(index)
  const surface = useColor('bg')
  return (
    <Animated.View entering={entering} layout={CAT_LAYOUT} className="mb-3">
      <Link href={`/eventos/${e.id}`} asChild>
        <Pressable className="flex-row overflow-hidden rounded-card border border-line bg-surface active:opacity-90">
          {/* The stub — category wash, the date set like a ticket */}
          <View className={`w-[74px] items-center justify-center py-3 ${cls.soft}`}>
            <Text className={`font-ui-semibold text-micro uppercase tracking-eyebrow ${cls.text}`}>
              {s.dow}
            </Text>
            <Text
              style={DATA_FIGURES}
              maxFontSizeMultiplier={1.1}
              className={`font-serif-semibold text-rank leading-[42px] ${cls.text}`}
            >
              {s.day}
            </Text>
            <Text className={`font-ui-semibold text-micro uppercase ${cls.text}`}>{s.month}</Text>
            <Text className="mt-1 font-ui-medium text-micro text-text-muted">{s.time}</Text>
          </View>
          {/* Perforation: a dashed seam with two notches punched out */}
          <View className="w-0 border-line-strong border-l border-dashed" />
          <View
            style={{ backgroundColor: surface }}
            className="absolute top-[-8px] left-[66px] h-4 w-4 rounded-pill border border-line"
          />
          <View
            style={{ backgroundColor: surface }}
            className="absolute bottom-[-8px] left-[66px] h-4 w-4 rounded-pill border border-line"
          />
          <View className="flex-1 p-3">
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-row items-center gap-1.5">
                <CategoryIcon cat={cat} size={13} />
                <Text
                  className={`font-ui-semibold text-micro uppercase tracking-eyebrow ${cls.text}`}
                >
                  {e.category ?? t('events.cat_default')}
                </Text>
              </View>
              <CountdownChip e={e} now={now} />
            </View>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1.5 font-serif-semibold text-serif-md text-text"
            >
              {e.title}
            </Text>
            <Caption numberOfLines={1}>
              {[e.restaurant.name, e.restaurant.neighborhood, e.priceLabel]
                .filter(Boolean)
                .join(' · ')}
            </Caption>
            {e.capacity != null && spotsLeft != null ? (
              <SpotsLine capacity={e.capacity} spotsLeft={spotsLeft} cat={cat} compact />
            ) : null}
            <View className="mt-3 flex-row items-center justify-between">
              <FacesStack
                faces={e.friendsGoing}
                label={
                  goingCount > 0 ? t('events.going_count', { n: goingCount }) : t('events.be_first')
                }
              />
              <RsvpButtons e={e} rsvpState={rsvpState} />
            </View>
          </View>
        </Pressable>
      </Link>
    </Animated.View>
  )
}

// ── Hero card (the "Destacados" carousel) ───────────────────────────────────
export function EventHeroCard({ e, width, now }: { e: EventSummary; width: number; now: Date }) {
  const cat = categoryKey(e.category, e.title)
  const cls = CAT_CLASSES[cat]
  const s = stubParts(e.startsAt)
  const scrim = useColor('photo-scrim')
  const rsvpState = useEventRsvp(e)
  return (
    <Link href={`/eventos/${e.id}`} asChild>
      <Pressable style={{ width }} className="h-60 overflow-hidden rounded-card active:opacity-95">
        <PlaceCover
          seed={e.id}
          name={e.title}
          coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
          size={{ w: 900, h: 620 }}
          className="absolute inset-0 h-full w-full rounded-none"
        />
        <LinearGradient
          colors={['transparent', scrim]}
          locations={[0.25, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {/* Date block top-left, category chip top-right */}
        <View className={`absolute top-3 left-3 items-center rounded-sm px-2.5 py-1.5 ${cls.bg}`}>
          <Text
            style={DATA_FIGURES}
            maxFontSizeMultiplier={1.1}
            className="font-serif-semibold text-serif-lg leading-[26px] text-on-cat"
          >
            {s.day}
          </Text>
          <Text className="font-ui-semibold text-micro uppercase text-on-cat">{s.month}</Text>
        </View>
        <View className="absolute top-3 right-3 flex-row items-center gap-1.5 rounded-pill bg-photo-scrim px-2.5 py-1">
          <CategoryIcon cat={cat} size={12} color="on-photo" />
          <Text className="font-ui-semibold text-micro text-on-photo">{e.category}</Text>
        </View>
        <View className="absolute right-3 bottom-3 left-3">
          <CountdownChip e={e} now={now} onPhoto />
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-2 font-serif-semibold text-title text-on-photo"
          >
            {e.title}
          </Text>
          <View className="mt-1 flex-row items-end justify-between gap-3">
            <Text numberOfLines={1} className="flex-1 font-ui text-label text-on-photo-2">
              {e.restaurant.name} · {s.time}
            </Text>
            <RsvpButtons e={e} rsvpState={rsvpState} />
          </View>
        </View>
      </Pressable>
    </Link>
  )
}

// ── Mini card (feed "Este finde", restaurant "Próximos eventos") ────────────
export function EventMiniCard({ e, now }: { e: EventSummary; now: Date }) {
  const cat = categoryKey(e.category, e.title)
  const cls = CAT_CLASSES[cat]
  const s = stubParts(e.startsAt)
  const scrim = useColor('photo-scrim')
  return (
    <Link href={`/eventos/${e.id}`} asChild>
      <Pressable className="w-48 overflow-hidden rounded-card border border-line bg-surface active:opacity-85">
        <View className="h-28 w-full">
          <PlaceCover
            seed={e.id}
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
          <View className={`absolute top-2 left-2 items-center rounded-sm px-2 py-1 ${cls.bg}`}>
            <Text style={DATA_FIGURES} className="font-serif-semibold text-serif-sm text-on-cat">
              {s.day}
            </Text>
            <Text className="font-ui-semibold text-micro uppercase text-on-cat">{s.month}</Text>
          </View>
          <View className="absolute bottom-2 left-2">
            <CountdownChip e={e} now={now} onPhoto />
          </View>
        </View>
        <View className="px-3 pt-2 pb-3">
          <View className="flex-row items-center gap-1">
            <CategoryIcon cat={cat} size={11} />
            <Text className={`font-ui-semibold text-micro uppercase tracking-eyebrow ${cls.text}`}>
              {e.category}
            </Text>
          </View>
          <Text numberOfLines={1} className="mt-0.5 font-serif-semibold text-serif-sm text-text">
            {e.title}
          </Text>
          <Caption numberOfLines={1} className="text-micro">
            {e.restaurant.name} · {s.time}
          </Caption>
        </View>
      </Pressable>
    </Link>
  )
}
