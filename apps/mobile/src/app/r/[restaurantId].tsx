import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Animated, ScrollView, View, useWindowDimensions } from 'react-native'

import { EventMiniCard } from '@/components/events/EventTicket'
import { FriendNotes } from '@/components/place/FriendNotes'
import { PlaceDishes } from '@/components/place/PlaceDishes'
import { PlaceHero, type PlaceTag } from '@/components/place/PlaceHero'
import { PlaceInfo } from '@/components/place/PlaceInfo'
import { PlaceStats, type Stat } from '@/components/place/PlaceStats'
import { PlaceTopChrome, usePhotoPageScroll } from '@/components/place/PlaceTopChrome'
import { RANK_BAR_HEIGHT, RankBar, useRankBarBottom } from '@/components/place/RankBar'
import { ReportControl } from '@/components/ReportControl'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { BookmarkIcon, ListIcon, PeopleIcon, TrophyIcon } from '@/components/ui/icons'
import { SpotCard, SpotRail } from '@/components/ui/patterns'
import { ApiError, api, apiOrigin } from '@/lib/api'
import { cuisineLabel, tagLabel } from '@/lib/display'
import { closesLabel } from '@/lib/hours'
import { useT } from '@/lib/i18n'
import { imageUrl, mapboxStaticUrl } from '@/lib/media'
import { placeWhere } from '@/lib/placeWhere'
import { useFriendsOnlyScores } from '@/lib/prefs'
import { shareSpotCard } from '@/lib/shareCardStore'
import type {
  EventSummary,
  RestaurantMenu as RestaurantMenuData,
  RestaurantProfileResponse,
} from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'

// The place page (Redesign 2): the photo IS the page. A fixed full-bleed backdrop — the
// place's photo, else a map of where it is — with a frosted name panel and tag panel laid over
// it and a hint that there is more below; scrolling raises a details sheet (stats, what friends
// said, dishes, the practical bits, the map) over the photo, while the top chrome trades glass
// controls for a solid bar. One floating rank bar holds the ranking action throughout.
//
// The layout is one scroll: a transparent hero block one screen tall (the overlay lives here and
// scrolls away), then the sheet. The backdrop is NOT in the scroll, so it stays put beneath.
const SHEET_RADIUS = 32

export default function RestaurantProfile() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useT()
  const { height: winH } = useWindowDimensions()
  const theme = useResolvedTheme()
  const friendsOnly = useFriendsOnlyScores()
  const scrim = useColor('photo-scrim')
  const barBottom = useRankBarBottom()
  const heroH = winH

  // The scroll drives the top chrome's cross-fade (see usePhotoPageScroll).
  const { scrollY, onScroll, setCondensedRef, condensedAt } = usePhotoPageScroll(heroH)
  const scrollRef = useRef<ScrollView>(null)
  const friendsY = useRef(0)
  const heroFade = scrollY.interpolate({
    inputRange: [0, heroH * 0.35],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })
  // "Próximos eventos" — its own query: events are Mesa-curated and change on their own
  // schedule, unrelated to the restaurant row itself.
  const eventsQ = useQuery({
    queryKey: ['events', 'restaurant', restaurantId],
    queryFn: () => api.get<{ events: EventSummary[] }>(`/events/restaurant/${restaurantId}`),
    enabled: Boolean(restaurantId),
  })

  // Warms the menu screen's own query before the "Menu" tile is ever tapped, so the push
  // usually opens straight to the loaded list.
  useEffect(() => {
    if (!q.data?.restaurant.hasMenu) return
    queryClient.prefetchQuery({
      queryKey: ['menu', restaurantId],
      queryFn: () => api.get<RestaurantMenuData>(`/restaurants/${restaurantId}/menu`),
    })
  }, [q.data?.restaurant.hasMenu, restaurantId, queryClient])

  if (q.isPending) {
    // Skeleton, not a spinner: hold the sheet's shape under the back button.
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="px-5">
          <Skeleton height={36} width="70%" className="mt-4" />
          <Skeleton height={12} width="45%" className="mt-3" />
          <View className="mt-6 flex-row gap-2">
            <View className="flex-1">
              <Skeleton height={70} />
            </View>
            <View className="flex-1">
              <Skeleton height={70} />
            </View>
            <View className="flex-1">
              <Skeleton height={70} />
            </View>
          </View>
          <Skeleton height={16} width="30%" className="mt-8" />
          <Skeleton height={60} className="mt-3" />
          <Skeleton height={60} className="mt-2" />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    // A missing spot and a failed request are different: 404 is a dead end (no retry),
    // anything else is worth trying again.
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="px-5">
          {notFound ? (
            <EmptyState>{t('restaurant.not_found')}</EmptyState>
          ) : (
            <ErrorState onRetry={() => q.refetch()}>{t('restaurant.load_error')}</ErrorState>
          )}
        </View>
      </View>
    )
  }

  const {
    restaurant,
    friendsRankings,
    friendAvg,
    occasionTags,
    allMesa,
    lists,
    similar,
    friendsWantToTry,
    myRanking,
    saved,
  } = q.data

  // "Friends-only scores" (Settings) hides the all-of-Mesa aggregate, so you only see your
  // circle. Client-side because it's purely a display filter.
  const showMesa = !friendsOnly && allMesa.avg != null
  const hood = restaurant.neighborhood?.name
  const where = placeWhere(hood, restaurant.neighborhood?.city)
  const closes = closesLabel(restaurant.closesAt)

  const photo = imageUrl(restaurant.coverImageId, { w: 1200, h: 2000 })
  // With no photo the page opens on a map of where it is (MapBox needs a token; without one
  // the backdrop is just the ground and the frosted panels carry the name).
  const backdropMap = photo
    ? null
    : mapboxStaticUrl(restaurant.lat, restaurant.lng, { w: 600, h: 1000, theme })
  const cardMap = mapboxStaticUrl(restaurant.lat, restaurant.lng, { w: 700, h: 300, theme })
  const openPlaceMap = () =>
    router.push({
      pathname: '/place-map',
      params: {
        id: restaurant.id,
        name: restaurant.name,
        lat: String(restaurant.lat),
        lng: String(restaurant.lng),
        address: restaurant.address ?? '',
        neighborhood: restaurant.neighborhood?.name ?? '',
      },
    })

  const shareMeta = [cuisineLabel(restaurant.cuisine), hood].filter(Boolean).join(' · ')
  const shareSpot = () =>
    shareSpotCard({
      name: restaurant.name,
      meta: shareMeta,
      position: myRanking?.position ?? null,
      score: myRanking?.score ?? friendsRankings[0]?.score ?? null,
      note: friendsRankings.find((f) => f.note)?.note ?? null,
      coverUrl: imageUrl(restaurant.coverImageId, { w: 1080, h: 1150 }),
      text: `${t('place.share_text', { name: restaurant.name })}\n${apiOrigin}/p/spot/${restaurant.id}`,
    })

  // The score on the photo: Mesa's, or the friends' when Mesa's is hidden.
  const chromeScore = showMesa ? allMesa.avg : friendAvg
  const chromeWho = showMesa ? t('place.who_mesa') : t('place.who_friends')

  // The tag panel: what makes this place worth a look, from what we know — where you stand on
  // it, who ranked it or wants to try it, the lists it is in, and its occasion tags.
  const tags: PlaceTag[] = [
    ...(myRanking
      ? [
          {
            key: 'mine',
            icon: <TrophyIcon size={14} color="hglass-fg" />,
            label: t('place.on_your_list', { n: myRanking.position }),
          },
        ]
      : []),
    ...(friendsRankings.length > 0
      ? [
          {
            key: 'friends',
            icon: <PeopleIcon size={14} color="hglass-fg" />,
            label: t('place.friends_ranked', { n: friendsRankings.length }),
            onPress: () =>
              scrollRef.current?.scrollTo({ y: heroH + friendsY.current - 70, animated: true }),
          },
        ]
      : []),
    ...(friendsWantToTry.count > 0
      ? [
          {
            key: 'want',
            icon: <BookmarkIcon size={14} color="hglass-fg" />,
            label: t('restaurant.friends_want_to_try', { n: friendsWantToTry.count }),
          },
        ]
      : []),
    ...lists.slice(0, 2).map((l) => ({
      key: `list:${l.slug}`,
      icon: <ListIcon size={14} color="hglass-fg" />,
      label: l.title,
      onPress: () => router.push(`/lists/${l.slug}`),
    })),
    ...occasionTags.slice(0, 3).map((tag) => ({ key: `tag:${tag}`, label: tagLabel(tag) })),
  ]

  const stats: Stat[] = [
    ...(showMesa
      ? [{ score: allMesa.avg, label: t('place.stat_everyone', { n: allMesa.count }) }]
      : []),
    {
      score: friendAvg,
      label: t('place.stat_friends', { n: friendsRankings.length }),
      onPress: () =>
        scrollRef.current?.scrollTo({ y: heroH + friendsY.current - 70, animated: true }),
    },
    {
      score: myRanking?.score ?? null,
      label: myRanking ? t('place.stat_you') : t('place.stat_you_none'),
      onPress: () => router.push(`/rank?restaurant=${restaurantId}`),
    },
  ]

  return (
    <View className="flex-1 bg-bg">
      {/* The backdrop: fixed, one screen tall, beneath everything. */}
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
          {/* The overlay fades as it scrolls up, so it is gone before it reaches the controls
              pinned at the top (a frosted panel passing under a glass button looks broken). */}
          <Animated.View style={{ flex: 1, opacity: heroFade }}>
            <PlaceHero
              name={restaurant.name}
              category={
                [cuisineLabel(restaurant.cuisine), hood].filter(Boolean).join(' · ') || where
              }
              sub={[closes ? t('place.open_until', { time: closes }) : null, where]
                .filter(Boolean)
                .join(' · ')}
              tags={tags}
              hint={t('place.hint')}
              bottom={barBottom + RANK_BAR_HEIGHT + 14}
            />
          </Animated.View>
        </View>

        <View
          className="bg-bg"
          style={{
            minHeight: winH,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            paddingBottom: barBottom + RANK_BAR_HEIGHT + 24,
          }}
        >
          <View className="mb-1.5 mt-2 h-[5px] w-[38px] self-center rounded-[3px] bg-text-faint opacity-80" />

          <PlaceStats stats={stats} />

          <View
            onLayout={(e) => {
              friendsY.current = e.nativeEvent.layout.y
            }}
          >
            <FriendNotes rankings={friendsRankings} />
          </View>

          <PlaceDishes restaurantId={restaurantId} canAdd={Boolean(myRanking)} />

          <PlaceInfo
            restaurant={restaurant}
            lists={lists}
            mapUrl={cardMap}
            onOpenMap={openPlaceMap}
          />

          {/* Required Google attribution whenever this profile's data came from Google. */}
          {restaurant.google ? (
            <Caption className="mx-5 mt-4 text-text-faint">Powered by Google</Caption>
          ) : null}

          <View className="px-5">
            {(eventsQ.data?.events.length ?? 0) > 0 ? (
              <SpotRail title={t('restaurant.upcoming_events')}>
                {(eventsQ.data?.events ?? []).map((e) => (
                  <EventMiniCard key={e.id} e={e} now={new Date()} />
                ))}
              </SpotRail>
            ) : null}
            {similar.length > 0 ? (
              <SpotRail title={t('restaurant.similar_spots')}>
                {similar.map((s) => (
                  <SpotCard
                    key={s.id}
                    href={`/r/${s.id}`}
                    name={s.name}
                    coverImageId={s.coverImageId}
                    caption={
                      <Caption numberOfLines={1}>
                        {[cuisineLabel(s.cuisine), s.neighborhood].filter(Boolean).join(' · ')}
                      </Caption>
                    }
                  />
                ))}
              </SpotRail>
            ) : null}
          </View>

          {/* A member-added place can be junk or wrong; any place can be reported (App Store 1.2). */}
          <View className="mb-4 px-5">
            <ReportControl
              targetType="place"
              targetId={restaurantId}
              label={t('place.report_this')}
            />
          </View>
        </View>
      </Animated.ScrollView>

      <PlaceTopChrome
        name={restaurant.name}
        score={chromeScore}
        who={chromeWho}
        mesaCount={allMesa.count}
        onBack={goBack}
        onShare={shareSpot}
        onTop={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        scrollY={scrollY}
        fadeStart={condensedAt - 80}
        fadeEnd={condensedAt}
        setterRef={setCondensedRef}
      />

      <RankBar
        restaurantId={restaurant.id}
        name={restaurant.name}
        ranked={Boolean(myRanking)}
        saved={saved}
        lat={restaurant.lat}
        lng={restaurant.lng}
      />
    </View>
  )
}
