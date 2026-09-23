import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Linking, Pressable, Share, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  CategoryIcon,
  FacesStack,
  RsvpButtons,
  SpotsLine,
  countdownLabel,
  useNow,
} from '@/components/events/EventTicket'
import { PulseDot, useStaggerEntering } from '@/components/events/motion'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Caption, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { GlassCircle } from '@/components/ui/GlassCircle'
import {
  BackIcon,
  CalendarIcon,
  ChevronIcon,
  ClockIcon,
  DirectionsIcon,
  ShareIcon,
  WebIcon,
  WhatsAppIcon,
} from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useEventRsvp } from '@/hooks/useEventRsvp'
import { ApiError, api } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { eventCategoryLabel, eventPriceLabel, eventWhenLabel } from '@/lib/display'
import { CAT_CLASSES, CAT_TOKEN, categoryKey } from '@/lib/eventCategory'
import { countdown, isImminent } from '@/lib/eventTime'
import { dateLocale, useT } from '@/lib/i18n'
import { shareTextWhatsAppFirst } from '@/lib/shareProfile'
import type { EventSummary, RestaurantProfileResponse } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// One Mesa-curated event (M21, redesigned for color + motion). A full-bleed
// photo hero that stretches on pull and drifts on scroll, the category's hue
// on the date and countdown, info cards that rise in, a live spots bar, and
// a sticky action bar (Voy / Me interesa / WhatsApp or tickets) that slides
// up from the bottom. Never member-editable (docs/EVENTS.md).
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
        <Skeleton height={340} />
        <View className="gap-3 px-5 pt-5">
          <Skeleton height={16} width={140} />
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

const HERO_H = 340

function EventDetail({ e, onBack }: { e: EventSummary; onBack: () => void }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const reduced = useReducedMotion()
  const now = useNow()
  const scrim = useColor('photo-scrim')
  const bg = useColor('bg')
  const cat = categoryKey(e.category, e.title)
  const cls = CAT_CLASSES[cat]
  const rsvpState = useEventRsvp(e)
  const cd = countdown(e.startsAt, e.endsAt, now)
  const live = cd.kind === 'live'
  const when = eventWhenLabel(e.startsAt)

  // Scroll-driven hero: stretches on overscroll, drifts up at half speed,
  // and a compact title bar fades in once the photo has scrolled away.
  const y = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((ev) => {
    y.value = ev.contentOffset.y
  })
  const heroStyle = useAnimatedStyle(() => {
    if (reduced) return {}
    return {
      transform: [
        { translateY: y.value < 0 ? y.value / 2 : y.value * 0.45 },
        { scale: y.value < 0 ? 1 + -y.value / HERO_H : 1 },
      ],
    }
  })
  // The photo's big title fades out as it scrolls up toward the status bar,
  // handing off to the compact bar below instead of sliding under the clock.
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, HERO_H - 170], [1, 0], Extrapolation.CLAMP),
  }))
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [HERO_H - 140, HERO_H - 80], [0, 1], Extrapolation.CLAMP),
  }))

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
  const whatsapp = e.bookingWhatsapp
    ? `https://wa.me/${e.bookingWhatsapp}?text=${encodeURIComponent(
        t('events.whatsapp_msg', { title: e.title, when }),
      )}`
    : null
  const facesLabel =
    e.friendsGoing.length > 0
      ? t('events.faces_label', {
          name: e.friendsGoing[0]?.name.split(' ')[0] ?? '',
          n: Math.max(0, rsvpState.goingCount - 1),
        })
      : rsvpState.goingCount > 0
        ? t('events.going_count', { n: rsvpState.goingCount })
        : t('events.be_first')

  return (
    <View className="flex-1 bg-bg">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 + insets.bottom }}
      >
        {/* Hero */}
        <View style={{ height: HERO_H, overflow: 'visible' }}>
          <Animated.View style={[{ height: HERO_H, width }, heroStyle]}>
            <PlaceCover
              seed={e.id}
              name={e.title}
              coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
              size={{ w: 1000, h: 700 }}
              className="h-full w-full rounded-none"
            />
          </Animated.View>
          <LinearGradient
            colors={['transparent', scrim]}
            locations={[0.35, 1]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <Animated.View style={titleStyle} className="absolute right-5 bottom-10 left-5">
            <View className="flex-row items-center gap-2">
              <View className={`flex-row items-center gap-1.5 rounded-pill px-2.5 py-1 ${cls.bg}`}>
                <CategoryIcon cat={cat} size={12} color="on-cat" />
                <Text className="font-ui-semibold text-micro text-on-cat">
                  {eventCategoryLabel(e.category) ?? t('events.cat_default')}
                </Text>
              </View>
              {e.priceLabel ? (
                <View className="rounded-pill bg-photo-scrim px-2.5 py-1">
                  <Text className="font-ui-semibold text-micro text-on-photo">
                    {eventPriceLabel(e.priceLabel)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-2 font-serif-semibold text-display leading-[46px] text-on-photo"
            >
              {e.title}
            </Text>
            <Text className="mt-1 font-ui-medium text-label text-on-photo-2">
              {e.restaurant.name} · {when}
            </Text>
          </Animated.View>
        </View>

        {/* Solid ground: the hero drifts DOWN as you scroll (parallax), so
            without this it showed through the gaps between the cards. */}
        <View className="bg-bg px-5">
          {/* Countdown banner */}
          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(300).delay(80)}
            className={`-mt-5 flex-row items-center gap-3 rounded-card px-4 py-3 ${live ? 'bg-live' : isImminent(cd) ? cls.bg : 'border border-line bg-surface'}`}
          >
            {live ? (
              <PulseDot color="on-live" size={9} />
            ) : isImminent(cd) ? (
              <PulseDot color="on-cat" size={8} />
            ) : (
              <ClockIcon size={18} color={CAT_TOKEN[cat]} />
            )}
            <View className="flex-1">
              <Caption
                className={live ? 'text-on-live' : isImminent(cd) ? 'text-on-cat' : undefined}
              >
                {live ? t('events.live_now') : t('events.starts_in')}
              </Caption>
              <Text
                className={`font-ui-semibold text-body ${live ? 'text-on-live' : isImminent(cd) ? 'text-on-cat' : cls.text}`}
              >
                {live
                  ? e.endsAt
                    ? t('events.live_until', {
                        time: new Intl.DateTimeFormat(dateLocale(), {
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(e.endsAt)),
                      })
                    : t('events.cd_live')
                  : countdownLabel(t, cd)}
              </Text>
            </View>
          </Animated.View>

          {/* The fuller sample-event sentence — sits right where the reader has
              accepted the event as real and is about to act on it. The cards
              above (EventTicket/EventHeroCard/EventMiniCard) carry the short
              "Evento de muestra" mark; this is the one place that explains it. */}
          {!e.venueConfirmed ? (
            <Caption className="mt-3 text-center">{t('events.sample_note')}</Caption>
          ) : null}

          {/* Info cards */}
          <InfoCard
            index={0}
            icon={<CalendarIcon size={18} color="text-muted" />}
            label={t('events.when')}
          >
            <Text className="font-ui-semibold text-body text-text">{when}</Text>
            {endTime ? <Caption>– {endTime}</Caption> : null}
          </InfoCard>

          <InfoCard index={1} label={t('events.where')}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/r/${e.restaurant.id}`)}
              className="flex-row items-center gap-3 active:opacity-70"
            >
              <PlaceCover
                seed={e.restaurant.id}
                name={e.restaurant.name}
                coverImageId={e.restaurant.coverImageId}
                size={{ w: 160, h: 160 }}
                className="h-12 w-12 rounded-sm"
              />
              <View className="flex-1">
                <Text className="font-ui-semibold text-body text-text">{e.restaurant.name}</Text>
                {e.restaurant.neighborhood ? <Caption>{e.restaurant.neighborhood}</Caption> : null}
              </View>
              <ChevronIcon size={14} color="text-faint" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={directions}
              className="mt-3 min-h-[40px] flex-row items-center justify-center gap-2 rounded-pill border border-line-strong active:opacity-70"
            >
              <DirectionsIcon size={16} />
              <Text className="font-ui-semibold text-label text-text">
                {t('events.directions')}
              </Text>
            </Pressable>
          </InfoCard>

          {e.description ? (
            <InfoCard index={2}>
              <Body>{e.description}</Body>
            </InfoCard>
          ) : null}

          {e.capacity != null && rsvpState.spotsLeft != null ? (
            <InfoCard index={3}>
              <SpotsLine capacity={e.capacity} spotsLeft={rsvpState.spotsLeft} cat={cat} />
            </InfoCard>
          ) : null}

          <InfoCard index={4} label={t('events.who_going')}>
            <FacesStack faces={e.friendsGoing} label={facesLabel} size={30} />
            <Pressable
              accessibilityRole="button"
              onPress={() => shareTextWhatsAppFirst(shareText)}
              className="mt-3 min-h-[40px] flex-row items-center justify-center gap-2 rounded-pill border border-line-strong active:opacity-70"
            >
              <WhatsAppIcon size={16} />
              <Text className="font-ui-semibold text-label text-text">
                {t('events.invite_friends')}
              </Text>
            </Pressable>
          </InfoCard>
        </View>
      </Animated.ScrollView>

      {/* Compact title bar — fades in once the hero is gone */}
      <Animated.View
        pointerEvents="none"
        style={[{ paddingTop: insets.top + 8, backgroundColor: bg }, barStyle]}
        className="absolute inset-x-0 top-0 border-line border-b px-16 pb-3"
      >
        <Text numberOfLines={1} className="text-center font-serif-semibold text-serif-md text-text">
          {e.title}
        </Text>
      </Animated.View>

      {/* Floating back / share */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 flex-row justify-between px-4"
        style={{ top: insets.top + 4 }}
      >
        <GlassCircle onPress={onBack} accessibilityLabel={t('common.back_plain')}>
          <BackIcon size={18} />
        </GlassCircle>
        <GlassCircle
          onPress={() => Share.share({ message: shareText }).catch(() => {})}
          accessibilityLabel={t('events.share')}
        >
          <ShareIcon size={18} />
        </GlassCircle>
      </View>

      {/* Sticky action bar — slides up once the screen is in */}
      <Animated.View
        entering={
          reduced
            ? undefined
            : FadeInDown.duration(320)
                .delay(180)
                .withInitialValues({
                  opacity: 0,
                  transform: [{ translateY: 60 }],
                })
        }
        className="absolute inset-x-0 bottom-0 gap-2 border-line border-t bg-bg px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <RsvpButtons e={e} rsvpState={rsvpState} size="md" />
        {whatsapp ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openURL(whatsapp).catch(() => {})}
            className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-pill border ${cls.border} active:opacity-70`}
          >
            <WhatsAppIcon size={16} />
            <Text className={`font-ui-semibold text-label ${cls.text}`}>
              {t('events.whatsapp')}
            </Text>
          </Pressable>
        ) : e.ticketUrl ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => e.ticketUrl && Linking.openURL(e.ticketUrl).catch(() => {})}
            className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-pill border ${cls.border} active:opacity-70`}
          >
            <WebIcon size={16} />
            <Text className={`font-ui-semibold text-label ${cls.text}`}>
              {t('events.buy_tickets')}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  )
}

function InfoCard({
  index,
  label,
  icon,
  children,
}: {
  index: number
  label?: string
  icon?: ReactNode
  children: ReactNode
}) {
  const entering = useStaggerEntering(index + 1)
  return (
    <Animated.View
      entering={entering}
      className="mt-3 rounded-card border border-line bg-surface p-4"
    >
      {label ? (
        <View className="mb-2 flex-row items-center gap-2">
          {icon}
          <Text className="font-ui-semibold text-eyebrow uppercase tracking-eyebrow text-text-muted">
            {label}
          </Text>
        </View>
      ) : null}
      {children}
    </Animated.View>
  )
}
