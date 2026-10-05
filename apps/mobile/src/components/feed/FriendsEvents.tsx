import { LinearGradient } from 'expo-linear-gradient'
import { Link, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import {
  CountdownChip,
  FacesStack,
  RsvpButtons,
  stubParts,
  useNow,
} from '@/components/events/EventTicket'
import {
  Caption,
  EmptyState,
  ErrorState,
  MAX_SCALE,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { ChevronIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { useMyEvents } from '@/hooks/useMyEvents'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'
import { eventPriceLabel } from '@/lib/display'
import { friendsNamedLine } from '@/lib/eventGoing'
import { sdDayKey } from '@/lib/eventTime'
import { dayOffset, eventDays, friendsGoingEvents } from '@/lib/friendsEvents'
import { dateLocale, useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

// The Feed's Events pill: events as PLANS, who is doing what. Explore → Events is the catalogue
// (date strip, categories, Featured); this is the social view of the same events —
//   1. the ones your friends are going to, the most friends first, with their faces and names;
//   2. the ones you are going to;
//   3. the coming week, a day at a time (the first day open, the rest a tap away).
// What belongs in each is lib/friendsEvents; this only draws it.
const MAX_FRIENDS_CARDS = 8

type T = ReturnType<typeof useT>

// "Today", "Tomorrow", then the weekday and date: "Saturday 10".
function dayLabel(t: T, dayKey: string, now: Date): string {
  const n = dayOffset(dayKey, now)
  if (n === 0) return t('events.when_today')
  if (n === 1) return t('events.when_tomorrow')
  const label = new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dayKey}T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// "Today · 9:00 PM", "Saturday 10 · 9:00 PM".
function whenLabel(t: T, e: EventSummary, now: Date): string {
  return `${dayLabel(t, sdDayKey(e.startsAt), now)} · ${stubParts(e.startsAt).time}`
}

export function FriendsEvents() {
  const t = useT()
  const router = useRouter()
  const now = useNow()
  const upcoming = useUpcomingEvents()
  const mine = useMyEvents()
  const all = upcoming.data?.events
  const friends = useMemo(
    () => friendsGoingEvents(all ?? [], now).slice(0, MAX_FRIENDS_CARDS),
    [all, now],
  )
  const days = useMemo(() => eventDays(all ?? [], now), [all, now])
  const going = mine.data?.events ?? []
  // Days opened by hand; until one is, the first day with something on is open.
  const [opened, setOpened] = useState<Record<string, boolean>>({})

  if (upcoming.isPending) return <RowsSkeleton rows={4} thumb={64} className="mt-4" />
  // A failed load is not "nothing on": say so, and let them retry.
  if (upcoming.isError && !all) {
    return <ErrorState onRetry={() => upcoming.refetch()}>{t('events.load_error')}</ErrorState>
  }

  if (friends.length === 0 && going.length === 0 && days.length === 0) {
    return (
      <EmptyState
        body={t('feed.fe_nothing_body')}
        action={<SeeAll onPress={() => router.push('/explore?view=events')} />}
      >
        {t('feed.fe_nothing_title')}
      </EmptyState>
    )
  }

  return (
    <View className="mt-3 pb-4">
      <View className="px-1">
        <SectionHeader>{t('feed.fe_friends_title')}</SectionHeader>
      </View>
      {friends.length > 0 ? (
        friends.map((e) => <FriendEventCard key={e.id} e={e} now={now} />)
      ) : (
        <Caption className="px-1 pb-2">{t('feed.fe_friends_empty')}</Caption>
      )}

      {going.length > 0 ? (
        <View className="mt-3">
          <View className="px-1">
            <SectionHeader>{t('feed.fe_going_title')}</SectionHeader>
          </View>
          <AgendaGroup events={going} now={now} />
        </View>
      ) : null}

      {days.length > 0 ? (
        <View className="mt-3">
          <View className="px-1">
            <SectionHeader>{t('feed.fe_week_title')}</SectionHeader>
          </View>
          <View className="gap-2.5">
            {days.map((d, i) => {
              const open = opened[d.dayKey] ?? i === 0
              return (
                <View key={d.dayKey}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    onPress={() => setOpened((cur) => ({ ...cur, [d.dayKey]: !open }))}
                    className="min-h-[44px] flex-row items-center justify-between px-1 active:opacity-70"
                  >
                    <Text
                      maxFontSizeMultiplier={MAX_SCALE}
                      className="font-ui-semibold text-body text-text"
                    >
                      {dayLabel(t, d.dayKey, now)}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Caption>{t('feed.fe_day_count', { n: d.events.length })}</Caption>
                      <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
                        <ChevronIcon size={14} color="text-faint" />
                      </View>
                    </View>
                  </Pressable>
                  {open ? <AgendaGroup events={d.events} now={now} /> : null}
                </View>
              )
            })}
          </View>
        </View>
      ) : null}

      <View className="mt-4 items-center">
        <SeeAll onPress={() => router.push('/explore?view=events')} />
      </View>
    </View>
  )
}

function SeeAll({ onPress }: { onPress: () => void }) {
  const t = useT()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[44px] flex-row items-center gap-1.5 px-3 active:opacity-70"
    >
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-pill text-accent">
        {t('feed.fe_see_all')}
      </Text>
      <ChevronIcon size={13} color="accent" />
    </Pressable>
  )
}

// An event your friends are going to: its photo, when, the title, where, their faces and names, and
// the two actions.
function FriendEventCard({ e, now }: { e: EventSummary; now: Date }) {
  const t = useT()
  const lift = useLift()
  const scrim = useColor('photo-scrim')
  const rsvpState = useEventRsvp(e)
  const named = friendsNamedLine(t, e)
  return (
    <Link href={`/events/${e.id}`} asChild>
      <Pressable
        className="mb-3 overflow-hidden rounded-card bg-surface active:opacity-90"
        style={lift}
      >
        <View className="h-36 w-full">
          <PlaceCover
            name={e.title}
            coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
            size={{ w: 800, h: 288 }}
            className="h-full w-full rounded-none"
          />
          <LinearGradient
            colors={['transparent', scrim]}
            locations={[0.45, 1]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <View className="absolute bottom-2.5 left-3">
            <CountdownChip e={e} now={now} onPhoto />
          </View>
        </View>
        <View className="px-4 pb-3.5 pt-3">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-md text-text"
          >
            {e.title}
          </Text>
          <Caption numberOfLines={1} className="mt-0.5 text-meta">
            {[whenLabel(t, e, now), e.restaurant.name, eventPriceLabel(e.priceLabel)]
              .filter(Boolean)
              .join(' · ')}
          </Caption>
          <View className="mt-3 flex-row items-center gap-2">
            <View className="min-w-0 flex-1">
              <FacesStack faces={e.friendsGoing} size={26} />
              {named ? (
                <Caption numberOfLines={2} className="mt-1 text-meta">
                  {named}
                </Caption>
              ) : null}
            </View>
            <RsvpButtons e={e} rsvpState={rsvpState} />
          </View>
        </View>
      </Pressable>
    </Link>
  )
}

// A short list of events as one white card: a thumbnail, the title, when and where — and, when
// friends are going, their faces. A tap opens the event.
function AgendaGroup({ events, now }: { events: EventSummary[]; now: Date }) {
  const lift = useLift()
  return (
    <View className="mt-1 rounded-group bg-surface px-4" style={lift}>
      {events.map((e, i) => (
        <AgendaRow key={e.id} e={e} now={now} last={i === events.length - 1} />
      ))}
    </View>
  )
}

function AgendaRow({ e, now, last }: { e: EventSummary; now: Date; last: boolean }) {
  const t = useT()
  return (
    <Link href={`/events/${e.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className={`flex-row items-center gap-3 py-3 active:opacity-80 ${last ? '' : 'border-line border-b'}`}
      >
        <PlaceCover
          name={e.title}
          coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
          size={{ w: 160, h: 160 }}
          className="h-[54px] w-[54px] rounded-sm"
        />
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {e.title}
          </Text>
          <Caption numberOfLines={1} className="text-meta">
            {[whenLabel(t, e, now), e.restaurant.name].join(' · ')}
          </Caption>
        </View>
        {e.friendsGoing.length > 0 ? <FacesStack faces={e.friendsGoing} size={22} /> : null}
      </Pressable>
    </Link>
  )
}
