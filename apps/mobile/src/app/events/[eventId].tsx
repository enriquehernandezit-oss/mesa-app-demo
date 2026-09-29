import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useRef } from 'react'
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'

import { EVENT_BAR_HEIGHT, EventBar } from '@/components/events/EventBar'
import {
  CategoryIcon,
  FacesStack,
  SpotsLine,
  countdownLabel,
  liveLabel,
  spotsLabel,
  useNow,
} from '@/components/events/EventTicket'
import { PlaceHero, type PlaceTag } from '@/components/place/PlaceHero'
import { PlaceTopChrome, usePhotoPageScroll } from '@/components/place/PlaceTopChrome'
import { useRankBarBottom } from '@/components/place/RankBar'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, ErrorState, Skeleton } from '@/components/ui'
import {
  CalendarIcon,
  ChevronIcon,
  ClockIcon,
  DirectionsIcon,
  PeopleIcon,
  PinIcon,
  SendIcon,
  WebIcon,
  WhatsAppIcon,
} from '@/components/ui/icons'
import { PlaceLine } from '@/components/ui/PlaceLine'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { ApiError, api } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { eventCategoryLabel, eventPriceLabel, eventWhenLabel } from '@/lib/display'
import { categoryKey } from '@/lib/eventCategory'
import { goingLabel } from '@/lib/eventGoing'
import { countdown, isImminent } from '@/lib/eventTime'
import { dateLocale, useT } from '@/lib/i18n'
import { imageUrl, mapboxStaticUrl } from '@/lib/media'
import { shareTextWhatsAppFirst } from '@/lib/shareProfile'
import type { EventSummary, RestaurantProfileResponse } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

// One Mesa-curated event (Redesign 2). The same shape as the place page: the photo IS the page —
// the event's own, else its venue's — with a frosted title panel and a panel of what matters at a
// glance (when it starts, spots left, who is going), and a details sheet that rises over it
// (when, where, what, spots, who). One floating bar holds the two actions: save and "I'm going".
// Never member-editable (docs/EVENTS.md).
//
// The scroll choreography is r/[restaurantId].tsx's: a transparent hero block one screen tall
// scrolls away over a fixed backdrop, and the top chrome trades glass controls for a solid bar.
const SHEET_RADIUS = 32

export default function EventDetailScreen() {
  const t = useT()
  const router = useRouter()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/explore'))

  const q = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.get<{ event: EventSummary }>(`/events/${eventId}`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="gap-3 px-5 pt-4">
          <Skeleton height={340} />
          <Skeleton height={28} width="80%" />
          <Skeleton height={90} />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <ErrorState onRetry={notFound ? undefined : () => q.refetch()}>
          {notFound ? t('events.not_found') : t('events.load_error')}
        </ErrorState>
      </View>
    )
  }
  return <EventDetail e={q.data.event} onBack={goBack} />
}

function EventDetail({ e, onBack }: { e: EventSummary; onBack: () => void }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { height: winH } = useWindowDimensions()
  const now = useNow()
  const theme = useResolvedTheme()
  const scrim = useColor('photo-scrim')
  const lift = useLift()
  const barBottom = useRankBarBottom()
  const heroH = winH
  const cat = categoryKey(e.category, e.title)
  const rsvpState = useEventRsvp(e)
  const cd = countdown(e.startsAt, e.endsAt, now)
  const live = cd.kind === 'live'
  const hot = live || isImminent(cd)
  const when = eventWhenLabel(e.startsAt)

  // The scroll drives the top chrome's cross-fade (see usePhotoPageScroll).
  const { scrollY, onScroll, setCondensedRef, condensedAt } = usePhotoPageScroll(heroH)
  const scrollRef = useRef<ScrollView>(null)
  const heroFade = scrollY.interpolate({
    inputRange: [0, heroH * 0.35],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const photo = imageUrl(e.coverImageId ?? e.restaurant.coverImageId, { w: 1200, h: 2000 })
  // With no photo of its own or its venue's the page opens on a map of where it is (as the place
  // page does). The venue's coordinates come from its profile — the same query Directions uses,
  // so it is fetched once — and only when there is no photo to show.
  const venue = useQuery({
    queryKey: ['restaurant', e.restaurant.id],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${e.restaurant.id}`),
    staleTime: 5 * 60_000,
    enabled: !photo,
  })
  const backdropMap =
    !photo && venue.data
      ? mapboxStaticUrl(venue.data.restaurant.lat, venue.data.restaurant.lng, {
          w: 600,
          h: 1000,
          theme,
        })
      : null
  const endTime = e.endsAt
    ? new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).format(
        new Date(e.endsAt),
      )
    : null

  async function directions() {
    const r = await queryClient.fetchQuery({
      queryKey: ['restaurant', e.restaurant.id],
      queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${e.restaurant.id}`),
      staleTime: 5 * 60_000,
    })
    await openDirections(r.restaurant.lat, r.restaurant.lng, e.restaurant.name)
  }
  const shareText = t('events.share_text', { title: e.title, when, place: e.restaurant.name })
  const share = () => Share.share({ message: shareText }).catch(() => {})
  const whatsapp = e.bookingWhatsapp
    ? `https://wa.me/${e.bookingWhatsapp}?text=${encodeURIComponent(
        t('events.whatsapp_msg', { title: e.title, when }),
      )}`
    : null
  const facesLabel = goingLabel(t, {
    friendsGoingCount: e.friendsGoingCount,
    goingCount: rsvpState.goingCount,
  })

  // What matters at a glance, on the photo: when it starts (the accent once it is imminent or
  // live), what is left, who is going. A cancelled event shows none of it — the bar and the
  // first card in the sheet say so.
  const tags: PlaceTag[] = e.cancelled
    ? []
    : [
        {
          key: 'when',
          icon: <ClockIcon size={14} color={hot ? 'on-accent' : 'hglass-fg'} />,
          label: live ? liveLabel(t, e) : countdownLabel(t, cd),
          hot,
        },
        ...(e.capacity != null && rsvpState.spotsLeft != null
          ? [
              {
                key: 'spots',
                icon: <PeopleIcon size={14} color="hglass-fg" />,
                label: spotsLabel(t, rsvpState.spotsLeft),
              },
            ]
          : []),
        ...(e.friendsGoingCount > 0 || rsvpState.goingCount > 0
          ? [
              {
                key: 'going',
                icon: <PeopleIcon size={14} color="hglass-fg" />,
                label: facesLabel,
                onPress:
                  e.friendsGoingCount > 0 ? () => router.push(`/events/${e.id}/going`) : undefined,
              },
            ]
          : []),
      ]

  const chip = [
    eventCategoryLabel(e.category) ?? t('events.cat_default'),
    e.priceLabel ? eventPriceLabel(e.priceLabel) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View className="flex-1 bg-bg">
      {/* The backdrop: fixed, one screen tall, beneath everything — the photo, else a map, else
          (no Mapbox token) the plain ground with the frosted panels carrying the page. */}
      <View className="absolute inset-x-0 top-0 bg-surface-raised" style={{ height: winH }}>
        {photo || backdropMap ? (
          <Image
            source={{ uri: photo ?? backdropMap ?? undefined }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : null}
        {photo ? (
          <>
            <LinearGradient
              colors={[scrim, 'transparent']}
              locations={[0, 0.2]}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.4 }}
            />
            <LinearGradient
              colors={['transparent', scrim]}
              locations={[0.52, 1]}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.5 }}
            />
          </>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        <View style={{ height: heroH }}>
          <Animated.View style={{ flex: 1, opacity: heroFade }}>
            <PlaceHero
              name={e.title}
              category={chip}
              icon={<CategoryIcon cat={cat} size={15} color="text" />}
              titleClass="text-display"
              sub={`${e.restaurant.name} · ${when}`}
              tags={tags}
              hint={t('events.hint')}
              bottom={barBottom + EVENT_BAR_HEIGHT + 14}
            />
          </Animated.View>
        </View>

        <View
          className="bg-bg"
          style={{
            minHeight: winH,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            paddingBottom: barBottom + EVENT_BAR_HEIGHT + 24,
          }}
        >
          <View className="mb-1.5 mt-2 h-[5px] w-[38px] self-center rounded-[3px] bg-text-faint opacity-80" />

          <View className="gap-2.5 px-4 pt-3">
            {e.cancelled ? (
              <InfoCard
                lift={lift}
                label={t('events.cancelled_title')}
                icon={<ClockIcon size={15} color="text-muted" />}
              >
                <Body className="mt-2 text-text">{t('events.cancelled_body')}</Body>
              </InfoCard>
            ) : null}

            <InfoCard
              lift={lift}
              label={t('events.when')}
              icon={<CalendarIcon size={15} color="text-muted" />}
            >
              <Text className="mt-2 font-ui-semibold text-section text-text">{when}</Text>
              {endTime ? (
                <Caption className="mt-0.5">{t('events.until', { time: endTime })}</Caption>
              ) : null}
            </InfoCard>

            <InfoCard
              lift={lift}
              label={t('events.where')}
              icon={<PinIcon size={15} color="text-muted" />}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/r/${e.restaurant.id}`)}
                className="mt-2.5 active:opacity-70"
              >
                <PlaceLine
                  name={e.restaurant.name}
                  coverImageId={e.restaurant.coverImageId}
                  neighborhood={e.restaurant.neighborhood}
                  picture={48}
                  nameClass="text-serif-md"
                  right={<ChevronIcon size={16} color="text-faint" />}
                />
              </Pressable>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 min-h-[42px]"
                icon={<DirectionsIcon size={16} />}
                onPress={directions}
              >
                {t('events.directions')}
              </Button>
            </InfoCard>

            {e.description ? (
              <InfoCard lift={lift}>
                <Body className="leading-[23px] text-text">{e.description}</Body>
              </InfoCard>
            ) : null}

            {e.capacity != null && rsvpState.spotsLeft != null ? (
              <InfoCard lift={lift}>
                <SpotsLine capacity={e.capacity} spotsLeft={rsvpState.spotsLeft} compact />
              </InfoCard>
            ) : null}

            <InfoCard
              lift={lift}
              label={t('events.who_going')}
              icon={<PeopleIcon size={15} color="text-muted" />}
            >
              <View className="mt-2.5">
                {/* With friends going the whole line opens WHO — the exact list of them. */}
                {e.friendsGoingCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('events.friends_going_title')}
                    onPress={() => router.push(`/events/${e.id}/going`)}
                    className="flex-row items-center justify-between active:opacity-70"
                  >
                    <FacesStack faces={e.friendsGoing} label={facesLabel} size={30} />
                    <ChevronIcon size={16} color="text-faint" />
                  </Pressable>
                ) : (
                  <FacesStack faces={e.friendsGoing} label={facesLabel} size={30} />
                )}
              </View>
              {!e.cancelled ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 min-h-[42px]"
                  icon={<SendIcon size={16} />}
                  onPress={() => shareTextWhatsAppFirst(shareText)}
                >
                  {t('events.invite_friends')}
                </Button>
              ) : null}
            </InfoCard>

            {!e.cancelled && whatsapp ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<WhatsAppIcon size={16} />}
                onPress={() => Linking.openURL(whatsapp).catch(() => {})}
              >
                {t('events.whatsapp')}
              </Button>
            ) : !e.cancelled && e.ticketUrl ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<WebIcon size={16} />}
                onPress={() => e.ticketUrl && Linking.openURL(e.ticketUrl).catch(() => {})}
              >
                {t('events.buy_tickets')}
              </Button>
            ) : null}

            {/* The fuller sample-event sentence — sits right where the reader has accepted the
                event as real and is about to act on it. The cards elsewhere carry the short
                "Sample event" mark; this is the one place that explains it. */}
            {!e.venueConfirmed ? (
              <Caption className="mt-1 text-center">{t('events.sample_note')}</Caption>
            ) : null}
          </View>
        </View>
      </Animated.ScrollView>

      <PlaceTopChrome
        name={e.title}
        score={null}
        onBack={onBack}
        onShare={share}
        onTop={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        scrollY={scrollY}
        fadeStart={condensedAt - 80}
        fadeEnd={condensedAt}
        setterRef={setCondensedRef}
      />

      <EventBar e={e} rsvpState={rsvpState} />
    </View>
  )
}

// One card of the details sheet: r24, lifted on Day (`lift` comes from the page so the cards
// don't each subscribe), with an optional small label and icon over its content.
function InfoCard({
  lift,
  label,
  icon,
  children,
}: {
  lift: ReturnType<typeof useLift>
  label?: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <View className="rounded-card bg-surface px-4 py-3.5" style={lift}>
      {label ? (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className="font-ui-semibold text-meta text-text-muted">{label}</Text>
        </View>
      ) : null}
      {children}
    </View>
  )
}
