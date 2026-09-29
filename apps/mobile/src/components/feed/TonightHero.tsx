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

import { FacesStack, stubParts, useNow } from '@/components/events/EventTicket'
import { PhotoChip, photoChipText } from '@/components/feed/PhotoChip'
import { Caption, MAX_SCALE, SectionHeader } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { BookmarkFilledIcon, BookmarkIcon, CheckIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { useEventSave } from '@/hooks/useEventSave'
import { eventPriceLabel } from '@/lib/display'
import { countdown } from '@/lib/eventTime'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { EventSummary } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// "Tonight": the events on tonight, as one big photo card at a time — swipe for the next,
// with a peek of it showing and a row of dots below. Each card is the event's photo with
// a glass time chip and a save button on it, and a frosted panel at the bottom: the title,
// where and what it costs, who's going, and "I'm going". Tapping the card opens the event.
//
// The list is the server's, cached until 5 AM (lib/homeCache.ts), so an event that has
// ended since is dropped here rather than waiting for a refetch.
const SIDE = 20
const GAP = 12
const HEIGHT = 372

export function TonightHero({ events }: { events: EventSummary[] }) {
  const t = useT()
  const now = useNow()
  const { width } = useWindowDimensions()
  const [page, setPage] = useState(0)
  const upcoming = events.filter((e) => countdown(e.startsAt, e.endsAt, now).kind !== 'ended')
  if (upcoming.length === 0) return null
  const cardWidth = width - SIDE * 2
  const step = cardWidth + GAP
  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / step))
  return (
    <View>
      <View className="px-5">
        <SectionHeader
          action={<Caption>{t('home.tonight_events', { n: upcoming.length })}</Caption>}
        >
          {t('home.tonight')}
        </SectionHeader>
      </View>
      <ScrollView
        horizontal
        scrollEnabled={upcoming.length > 1}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onMomentumScrollEnd={onSettle}
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
      >
        {upcoming.map((e) => (
          <HeroCard key={e.id} e={e} width={cardWidth} now={now} />
        ))}
      </ScrollView>
      {upcoming.length > 1 ? (
        <View className="mt-3 flex-row justify-center gap-1.5">
          {upcoming.map((e, i) => (
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

function HeroCard({ e, width, now }: { e: EventSummary; width: number; now: Date }) {
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
  const when = live
    ? t('events.cd_live')
    : [stubParts(e.startsAt).time, e.restaurant.neighborhood].filter(Boolean).join(' · ')
  // Faces are capped at three by the API, so "N friends going" is only said when every
  // one going is a friend; otherwise the plain count.
  const allFriends = e.friendsGoing.length > 0 && e.friendsGoing.length === goingCount
  const goingLine = allFriends
    ? t('events.friends_going_count', { n: goingCount })
    : goingCount > 0
      ? t('events.going_count', { n: goingCount })
      : t('events.be_first')

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/events/${e.id}`)}
      style={{ width, height: HEIGHT }}
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
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="flex-1 font-ui text-label text-hglass-fg"
          >
            {goingLine}
          </Text>
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
