import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'

import { FacesStack, stubParts } from '@/components/events/EventTicket'
import { PhotoChip, photoChipText } from '@/components/feed/PhotoChip'
import { MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { BookmarkFilledIcon, BookmarkIcon, CheckIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { useEventSave } from '@/hooks/useEventSave'
import { eventPriceLabel } from '@/lib/display'
import { goingLabel } from '@/lib/eventGoing'
import { countdown } from '@/lib/eventTime'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { EventSummary } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// The big event card, one at a time: the event's photo with a glass "when" chip and a save button
// on it, and a frosted panel at the bottom — the title, where and what it costs, who's going, and
// "I'm going". Swipe for the next (a peek of it shows) with a row of dots below; tapping the card
// opens the event. Shared by Tonight (Feed) and Featured (Explore → Events).
const SIDE = 20
const GAP = 12

export function EventHeroPager({
  events,
  height,
  now,
  dated,
}: {
  events: EventSummary[]
  height: number
  now: Date
  // "Wed 30 Sep · 7 PM" instead of "7 PM · Piantini" — for a list that spans days.
  dated?: boolean
}) {
  const { width } = useWindowDimensions()
  const [page, setPage] = useState(0)
  if (events.length === 0) return null
  const cardWidth = width - SIDE * 2
  const step = cardWidth + GAP
  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / step))
  return (
    <View>
      <ScrollView
        horizontal
        scrollEnabled={events.length > 1}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onMomentumScrollEnd={onSettle}
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
      >
        {events.map((e) => (
          <EventHeroCard
            key={e.id}
            e={e}
            width={cardWidth}
            height={height}
            now={now}
            dated={dated}
          />
        ))}
      </ScrollView>
      {events.length > 1 ? (
        <View className="mt-3 flex-row justify-center gap-1.5">
          {events.map((e, i) => (
            <View
              key={e.id}
              className={`h-1.5 rounded-pill ${i === page ? 'w-[18px] bg-text' : 'w-1.5 bg-text-faint'}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function EventHeroCard({
  e,
  width,
  height,
  now,
  dated,
}: {
  e: EventSummary
  width: number
  height: number
  now: Date
  dated?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const scrim = useColor('photo-scrim')
  const rsvpState = useEventRsvp(e)
  const save = useEventSave(e)
  const going = rsvpState.rsvp === 'going'
  const { goingCount } = rsvpState
  const cover = e.coverImageId ?? e.restaurant.coverImageId
  const onPhoto = imageUrl(cover) !== null
  const live = countdown(e.startsAt, e.endsAt, now).kind === 'live'
  const parts = stubParts(e.startsAt)
  const when = live
    ? t('events.cd_live')
    : dated
      ? `${parts.dow} ${parts.day} ${parts.month} · ${parts.time}`
      : [parts.time, e.restaurant.neighborhood].filter(Boolean).join(' · ')
  // "32 friends going" (the exact count), else everyone going; tapping it opens who they are.
  const goingLine = goingLabel(t, { friendsGoingCount: e.friendsGoingCount, goingCount })

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/events/${e.id}`)}
      style={{ width, height }}
      className="overflow-hidden rounded-[32px] bg-bg-sunk active:opacity-95"
    >
      <PlaceCover
        name={e.restaurant.name}
        coverImageId={cover}
        size={{ w: 900, h: 900 }}
        className="absolute inset-0 h-full w-full rounded-none"
      />
      {onPhoto ? (
        <LinearGradient
          colors={['transparent', scrim]}
          locations={[0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.55 }}
        />
      ) : null}
      <PhotoChip
        onPhoto={onPhoto}
        radius={17}
        className="absolute left-3.5 top-3.5 h-[34px] justify-center px-3.5"
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className={`font-ui-semibold text-label ${photoChipText(onPhoto)}`}
        >
          {when}
        </Text>
      </PhotoChip>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={save.saved ? t('events.unsave_cta') : t('events.save_cta')}
        accessibilityState={{ selected: save.saved }}
        onPress={save.toggle}
        hitSlop={6}
        className="absolute right-3 top-3"
      >
        <PhotoChip onPhoto={onPhoto} radius={20} className="h-10 w-10 items-center justify-center">
          {save.saved ? (
            <BookmarkFilledIcon size={18} color={onPhoto ? 'on-photo' : 'on-ink'} />
          ) : (
            <BookmarkIcon size={18} color={onPhoto ? 'on-photo' : 'on-ink'} />
          )}
        </PhotoChip>
      </Pressable>

      <Glass
        variant="panel"
        radius={24}
        className="absolute inset-x-2.5 bottom-2.5 px-4 pb-3.5 pt-[15px]"
      >
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-serif text-title text-hglass-fg"
        >
          {e.title}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="mt-1 font-ui text-label text-hglass-fg opacity-70"
        >
          {[e.restaurant.name, eventPriceLabel(e.priceLabel)].filter(Boolean).join(' · ')}
        </Text>
        {!e.venueConfirmed ? (
          <Text numberOfLines={1} className="font-ui text-eyebrow text-hglass-fg opacity-60">
            {t('events.sample_mark')}
          </Text>
        ) : null}
        <View className="mt-3 flex-row items-center gap-2.5">
          <FacesStack faces={e.friendsGoing} size={26} />
          {e.friendsGoingCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/events/${e.id}/going`)}
              hitSlop={6}
              className="flex-1 active:opacity-70"
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui-semibold text-label text-hglass-fg"
              >
                {goingLine}
              </Text>
            </Pressable>
          ) : (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="flex-1 font-ui text-label text-hglass-fg"
            >
              {goingLine}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: going }}
            onPress={() => rsvpState.toggle('going')}
            hitSlop={6}
            className={`h-9 flex-row items-center justify-center gap-1.5 rounded-pill px-4 ${going ? 'bg-accent-fill' : 'bg-ink'}`}
          >
            {going ? <CheckIcon size={13} color="on-accent" strokeWidth={2.2} /> : null}
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className={`font-ui-semibold text-label ${going ? 'text-on-accent' : 'text-on-ink'}`}
            >
              {going ? t('events.going_done') : t('events.going_cta')}
            </Text>
          </Pressable>
        </View>
      </Glass>
    </Pressable>
  )
}
