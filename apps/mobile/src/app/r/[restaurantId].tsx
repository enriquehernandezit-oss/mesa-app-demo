import { pickReportReason } from '@/components/ReportControl'
import { SaveButton } from '@/components/SaveButton'
import { ScreenHeader } from '@/components/ScreenHeader'
import { EventMiniCard } from '@/components/events/EventTicket'
import {
  Body,
  Button,
  Caption,
  EmptyState,
  ErrorState,
  Eyebrow,
  SectionHeader,
  Skeleton,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { GlassCircle } from '@/components/ui/GlassCircle'
import { PlaceCover } from '@/components/ui/PlaceCover'
import {
  BackIcon,
  DirectionsIcon,
  ListIcon,
  MenuIcon,
  PhoneIcon,
  PinIcon,
  ShareIcon,
  WebIcon,
} from '@/components/ui/icons'
import {
  Characteristics,
  ScoreBadge,
  SpotCard,
  SpotRail,
  UtilityPill,
} from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { ApiError, api, apiOrigin } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { cuisineLabel, eventWhenLabel, priceLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { cloudinaryUrl, mapboxStaticUrl } from '@/lib/media'
import { useFriendsOnlyScores } from '@/lib/prefs'
import { shareSpotCard } from '@/lib/shareCardStore'
import type {
  Dish,
  EventSummary,
  FriendRanking,
  RestaurantMenu as RestaurantMenuData,
  RestaurantProfileResponse,
} from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Restaurant profile (Phase 6 mocks D1/D2) — the payoff surface: the place, the
// aggregate + list pills, the attributed score trio, popular dishes, and where
// your friends ranked it. One ink CTA ("Rankear este spot") stays fixed at the
// bottom. Ported from apps/app/src/screens/restaurant/RestaurantProfile.tsx.
//
// Trimmed for the native launch: the inert Reserve strip is cut (Mesa has no
// booking supply). Everything else is wired — the map hero + locator open the
// pannable place-map (N7), "Cómo llegar" hands off to the maps app, and the
// hero's share button renders the story card via view-shot (N6).
export default function RestaurantProfile() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useT()
  const { height: winH } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const theme = useResolvedTheme()
  const friendsOnly = useFriendsOnlyScores()
  const heroH = Math.round(winH * 0.34)

  // Scroll-driven condensed header (mock D2): a sticky "‹ Lumbre 8.8" bar that
  // fades in once the hero photo scrolls out of view. scrollY drives the fade;
  // a state flag gates its tap target so the back button isn't hit while hidden.
  const scrollY = useRef(new Animated.Value(0)).current
  const [condensed, setCondensed] = useState(false)
  // Imperative scroll target for two things a plain link can't reach: the
  // condensed header's name (scroll to top) and the score trio's friend/Mesa
  // badges (jump down to "Sus puntuaciones", the section they summarize).
  const scrollRef = useRef<ScrollView>(null)
  // Two nested offsets, not one: `scoresY` is captured relative to its own
  // parent (the px-5 identity block), not the scroll content root, since
  // that's what onLayout gives you. `identityY` is that parent's own offset
  // within the scroll content. Their sum is the real, absolute scroll target.
  const identityY = useRef(0)
  const scoresY = useRef(0)

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })
  // "Próximos eventos" (M21) — its own query, not part of the restaurant
  // response above: events are Mesa-curated and change on their own
  // schedule, unrelated to anything about the restaurant row itself.
  const eventsQ = useQuery({
    queryKey: ['events', 'restaurant', restaurantId],
    queryFn: () => api.get<{ events: EventSummary[] }>(`/events/restaurant/${restaurantId}`),
    enabled: Boolean(restaurantId),
  })

  // Warms the menu screen's own query before the "Menú" pill is ever tapped
  // (fires the moment `hasMenu` is known), so the push usually opens straight
  // to the loaded list instead of fetching mid-transition.
  useEffect(() => {
    if (!q.data?.restaurant.hasMenu) return
    queryClient.prefetchQuery({
      queryKey: ['menu', restaurantId],
      queryFn: () => api.get<RestaurantMenuData>(`/restaurants/${restaurantId}/menu`),
    })
  }, [q.data?.restaurant.hasMenu, restaurantId, queryClient])

  if (q.isPending) {
    // Skeleton, not a spinner: this screen's geometry is known, so holding the
    // hero + identity shape avoids content jumping into place on arrival.
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <Skeleton height={heroH} />
        <View className="px-5">
          <Skeleton height={11} width={90} className="mt-5" />
          <Skeleton height={30} width="72%" className="mt-3" />
          <Skeleton height={12} width="52%" className="mt-3" />
          <View className="mt-6 flex-row gap-2">
            <View className="flex-1">
              <Skeleton height={40} />
            </View>
            <View className="flex-1">
              <Skeleton height={40} />
            </View>
            <View className="flex-1">
              <Skeleton height={40} />
            </View>
          </View>
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    // A missing spot and a failed request are different: 404 is a dead end (no
    // retry), anything else is worth trying again. The web app conflated the two.
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

  // "Friends-only scores" (Settings H1) hides the all-of-Mesa aggregate, so you
  // only see your circle. Client-side because it's purely a display filter.
  const showMesa = !friendsOnly

  // The place's static map (needs a MapBox token). A Google-created place with no
  // photo but an exact geocode gets a tinted map as its hero instead of the
  // generated mark (M9) — the picture "of" a photoless place is where it is. The
  // lower locator is then redundant (one map per profile), so it's hidden.
  const mapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng, { w: 700, h: 260, theme })
  const heroMapUrl = mapboxStaticUrl(restaurant.lat, restaurant.lng, { w: 1000, h: 750, theme })
  const mapCover =
    Boolean(heroMapUrl) &&
    !restaurant.coverImageId &&
    restaurant.geoPrecision === 'exact' &&
    restaurant.google
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

  const shareMeta = [cuisineLabel(restaurant.cuisine), restaurant.neighborhood?.name]
    .filter(Boolean)
    .join(' · ')
  const shareSpot = () =>
    shareSpotCard({
      name: restaurant.name,
      meta: shareMeta,
      position: myRanking?.position ?? null,
      score: myRanking?.score ?? friendsRankings[0]?.score ?? null,
      note: friendsRankings.find((f) => f.note)?.note ?? null,
      coverUrl: cloudinaryUrl(restaurant.coverImageId, { w: 1080, h: 1150 }),
      text: `${restaurant.name} en Mesa 🥂\n${apiOrigin}/p/spot/${restaurant.id}`,
    })

  const heroOpacity = scrollY.interpolate({
    inputRange: [heroH - 40, heroH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  return (
    <View className="flex-1 bg-bg">
      {/* Animated.ScrollView, not ScrollView: Animated.event with
          useNativeDriver:true returns an AnimatedEvent OBJECT, not a function,
          and only an Animated.* component knows how to bind it natively. On a
          plain ScrollView RN calls props.onScroll(...) directly and throws
          "Object is not a function" on every scroll frame. */}
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e) => {
            // @ts-expect-error — RN's onScroll event is loosely typed here.
            setCondensed(e.nativeEvent.contentOffset.y > heroH - 8)
          },
        })}
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
      >
        {/* Film-photo hero — clean image, a floating back control below it. A
            photoless Google place with an exact geocode gets a tinted map hero
            (mapCover, M9), tappable into the full map. */}
        <View style={{ height: heroH }}>
          {mapCover && heroMapUrl ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('restaurant.view_on_map', { name: restaurant.name })}
              onPress={openPlaceMap}
              className="h-full w-full"
            >
              <Image
                source={{ uri: heroMapUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </Pressable>
          ) : (
            <PlaceCover
              seed={restaurant.id}
              name={restaurant.name}
              coverImageId={restaurant.coverImageId}
              size={{ w: 1000, h: 750 }}
              className="h-full w-full"
            />
          )}
          <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
            <GlassCircle accessibilityLabel={t('common.back_plain')} onPress={goBack}>
              <BackIcon size={20} />
            </GlassCircle>
          </View>
          <View style={{ position: 'absolute', top: insets.top + 8, right: 16 }}>
            <GlassCircle accessibilityLabel={t('common.share')} onPress={shareSpot}>
              <ShareIcon size={18} />
            </GlassCircle>
          </View>
          <View
            className="absolute left-4 rounded-pill bg-surface px-2 py-1"
            style={{ bottom: 10 }}
          >
            {/* MapBox burns its attribution into the static image's corner, which
                cover-crop then hides — so it's stated here when the hero is a map. */}
            <Caption className="text-micro">
              {mapCover ? t('restaurant.map_attribution') : t('restaurant.film_note')}
            </Caption>
          </View>
        </View>

        <View
          className="px-5"
          onLayout={(e) => {
            identityY.current = e.nativeEvent.layout.y
          }}
        >
          {/* Identity, on the paper ground below the photo. */}
          <View className="pt-4">
            {restaurant.neighborhood ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/explore?neighborhood=${restaurant.neighborhood?.slug}`)
                }
                className="self-start active:opacity-70"
              >
                <Eyebrow>{restaurant.neighborhood.name}</Eyebrow>
              </Pressable>
            ) : (
              <Eyebrow>Santo Domingo</Eyebrow>
            )}
            <View className="mt-1 flex-row items-start justify-between gap-3">
              <Title className="flex-1">{restaurant.name}</Title>
              {/* The fixed bottom bar is the one ranking CTA; this is only the
                  save (want-to-try) toggle, so no re-rank action lives here. */}
              <SaveButton
                variant="pill"
                target={{ kind: 'restaurant', id: restaurant.id }}
                initial={saved}
                name={restaurant.name}
              />
            </View>
            {allMesa.avg != null && showMesa && (
              <View className="mt-1 items-start">
                <ScoreBadge
                  size="sm"
                  score={allMesa.avg}
                  attribution={{ kind: 'mesa', count: allMesa.count }}
                  sub={t('settings.ranked_count', { n: allMesa.count })}
                />
              </View>
            )}
            {restaurant.address ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('restaurant.view_on_map', { name: restaurant.name })}
                onPress={openPlaceMap}
                className="mt-1 self-start active:opacity-70"
              >
                <Caption className="text-text-2">{restaurant.address}</Caption>
              </Pressable>
            ) : null}
            {lists.length > 0 && (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {lists.map((l) => (
                  <UtilityPill
                    key={l.slug}
                    icon={<ListIcon size={13} />}
                    onPress={() => router.push(`/lists/${l.slug}`)}
                  >
                    {l.title}
                  </UtilityPill>
                ))}
              </View>
            )}
            <Characteristics
              occasionTags={occasionTags}
              priceTier={restaurant.priceTier}
              cuisine={restaurant.cuisine}
              neighborhood={restaurant.neighborhood?.name}
              city="Santo Domingo"
              social={
                friendsWantToTry.count > 0
                  ? {
                      people: friendsWantToTry.people,
                      label: t('restaurant.friends_want_to_try', { n: friendsWantToTry.count }),
                    }
                  : undefined
              }
            />
          </View>

          {/* Utility pills — Menú · Llamar · Sitio web · Cómo llegar. Menú only
              renders when the restaurant actually has one (M7); the other
              three are the original mock order. */}
          <View className="mt-5 flex-row gap-2">
            {restaurant.hasMenu ? (
              <UtilityPill
                icon={<MenuIcon size={18} />}
                onPress={() =>
                  router.push({
                    pathname: '/menu/[restaurantId]',
                    params: { restaurantId, name: restaurant.name },
                  })
                }
              >
                {t('restaurant.menu_title')}
              </UtilityPill>
            ) : null}
            {restaurant.phone ? (
              <UtilityPill icon={<PhoneIcon size={18} />} href={`tel:${restaurant.phone}`}>
                {t('restaurant.call')}
              </UtilityPill>
            ) : null}
            {restaurant.website ? (
              <UtilityPill icon={<WebIcon size={18} />} href={restaurant.website}>
                {t('restaurant.website')}
              </UtilityPill>
            ) : null}
            <UtilityPill
              icon={<DirectionsIcon size={18} />}
              onPress={() => openDirections(restaurant.lat, restaurant.lng, restaurant.name)}
            >
              {t('restaurant.directions')}
            </UtilityPill>
          </View>

          {/* The badged score trio — every score is attributed, never the place's. */}
          {(myRanking || friendAvg != null || allMesa.avg != null) && (
            <>
              <SectionHeader>{t('restaurant.scores_header')}</SectionHeader>
              <View className="mt-2 flex-row justify-around">
                {myRanking && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('restaurant.rank_again_label')}
                    onPress={() => router.push(`/rank?restaurant=${restaurantId}`)}
                    className="active:opacity-80"
                  >
                    <ScoreBadge
                      score={myRanking.score}
                      attribution={{ kind: 'you' }}
                      caption={t('rank.your_score')}
                      sub={t('rank.position_on_list', { position: myRanking.position })}
                    />
                  </Pressable>
                )}
                {friendAvg != null && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('restaurant.view_friends_scores')}
                    onPress={() =>
                      scrollRef.current?.scrollTo({
                        y: identityY.current + scoresY.current,
                        animated: true,
                      })
                    }
                    className="active:opacity-80"
                  >
                    <ScoreBadge
                      score={friendAvg}
                      attribution={{ kind: 'friends', count: friendsRankings.length }}
                      sub={t('restaurant.what_they_think')}
                    />
                  </Pressable>
                )}
                {allMesa.avg != null && showMesa && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('restaurant.view_who_ranked')}
                    onPress={() =>
                      scrollRef.current?.scrollTo({
                        y: identityY.current + scoresY.current,
                        animated: true,
                      })
                    }
                    className="active:opacity-80"
                  >
                    <ScoreBadge
                      score={allMesa.avg}
                      attribution={{ kind: 'mesa', count: allMesa.count }}
                      caption={t('restaurant.all_mesa')}
                      sub={t('settings.ranked_count', { n: allMesa.count })}
                    />
                  </Pressable>
                )}
              </View>
            </>
          )}

          <PopularDishes restaurantId={restaurantId} canAdd={Boolean(myRanking)} />

          <View
            onLayout={(e) => {
              scoresY.current = e.nativeEvent.layout.y
            }}
          >
            <TheirScores rankings={friendsRankings} />
          </View>

          {/* Locator map — a static MapBox tile that opens the full pannable map
              (place-map). Hidden when the hero itself is the map (one map per
              profile), and when no token is configured (no SVG fallback on native). */}
          {!mapCover && mapUrl && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('restaurant.view_on_map', { name: restaurant.name })}
              onPress={openPlaceMap}
              className="mt-4 h-40 overflow-hidden rounded active:opacity-90"
            >
              <Image
                source={{ uri: mapUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              <View className="absolute right-3 bottom-3 flex-row items-center gap-1 rounded-pill bg-surface px-2 py-1">
                <PinIcon size={12} />
                <Caption className="text-micro">{t('restaurant.view_on_map_short')}</Caption>
              </View>
            </Pressable>
          )}

          {/* Required Google attribution whenever this profile's data came from
              Google (M9) — the official logo asset swaps in before a real launch. */}
          {restaurant.google && (
            <Caption className="mt-4 text-text-faint">Powered by Google</Caption>
          )}

          {/* Próximos eventos rail (M21) — ahead of Similar spots: a
              time-sensitive "happening here soon" beats a discovery rail. */}
          {(eventsQ.data?.events.length ?? 0) > 0 && (
            <SpotRail title={t('restaurant.upcoming_events')}>
              {(eventsQ.data?.events ?? []).map((e) => (
                <EventMiniCard key={e.id} e={e} now={new Date()} />
              ))}
            </SpotRail>
          )}

          {/* Similar spots rail. */}
          {similar.length > 0 && (
            <SpotRail title={t('restaurant.similar_spots')}>
              {similar.map((s) => (
                <SpotCard
                  key={s.id}
                  href={`/r/${s.id}`}
                  seed={s.id}
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
          )}
        </View>
      </Animated.ScrollView>

      {/* Sticky condensed header — fades in once the hero scrolls away (mock D2). */}
      <Animated.View
        pointerEvents={condensed ? 'auto' : 'none'}
        style={{ opacity: heroOpacity, paddingTop: insets.top + 8 }}
        className="absolute inset-x-0 top-0 flex-row items-center gap-2 border-line border-b bg-bg px-4 pb-3"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back_plain')}
          onPress={goBack}
          className="min-h-[44px] justify-center active:opacity-70"
        >
          <Text className="font-serif text-title text-text">‹</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('restaurant.scroll_to_top')}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          className="flex-1 active:opacity-70"
        >
          <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
            {restaurant.name}
          </Text>
        </Pressable>
        {allMesa.avg != null && showMesa && (
          <ScoreBadge
            size="sm"
            score={allMesa.avg}
            attribution={{ kind: 'mesa', count: allMesa.count }}
          />
        )}
      </Animated.View>

      {/* The one ink CTA — fixed, never leaves (mock D2). Adapts to whether you've
          already ranked here, so nothing else on the screen duplicates it. */}
      <View
        className="absolute inset-x-0 bottom-0 border-line border-t bg-bg px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button variant="primary" onPress={() => router.push(`/rank?restaurant=${restaurantId}`)}>
          {myRanking ? t('restaurant.rank_again_button') : t('restaurant.rank_this_spot')}
        </Button>
      </View>
    </View>
  )
}

// Friends' scores (mock D2 "Their scores") — avatar + name + serif-italic quote +
// serif score. Capped at 3 with a "See all N rankings" expander.
function TheirScores({ rankings }: { rankings: RestaurantProfileResponse['friendsRankings'] }) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  if (rankings.length === 0) {
    return (
      <>
        <SectionHeader>{t('restaurant.their_scores')}</SectionHeader>
        <Body className="mt-1">{t('restaurant.no_friend_scores')}</Body>
      </>
    )
  }
  const shown = expanded ? rankings : rankings.slice(0, 3)
  return (
    <>
      <SectionHeader>{t('restaurant.their_scores')}</SectionHeader>
      {shown.map((fr) => (
        <FriendScoreRow key={fr.user.id} fr={fr} />
      ))}
      {rankings.length > 3 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((v) => !v)}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {expanded
              ? t('restaurant.show_less')
              : t('restaurant.view_all_rankings', { n: rankings.length })}
          </Text>
        </Pressable>
      )}
    </>
  )
}

// One friend's score row. Long-press opens the same report sheet ReportControl
// uses — App Store 1.2 requires report to be reachable everywhere UGC renders,
// and this note previously had no report path at all outside a member's own
// passport. Not a visible "Reportar" link: this list is dense (up to a
// screen's worth of rows), so the action rides the same gesture as a comment
// row on most social apps rather than adding a permanent extra line to each.
function FriendScoreRow({ fr }: { fr: FriendRanking }) {
  const t = useT()
  const report = useMutation({
    mutationFn: ({ reason, noteId }: { reason: string; noteId: string }) =>
      api.post('/moderation/reports', { targetType: 'vibe_note', targetId: noteId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })
  const noteId = fr.noteId
  const onLongPress =
    fr.note && noteId
      ? async () => {
          const reason = await pickReportReason('vibe_note')
          if (reason) report.mutate({ reason, noteId })
        }
      : undefined

  return (
    <Link href={`/u/${fr.user.id}`} asChild>
      <Pressable
        onLongPress={onLongPress}
        className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80"
      >
        <Avatar name={fr.user.name || fr.user.handle || 'm'} src={fr.user.image} size={34} />
        <View className="flex-1">
          <Text className="font-ui-medium text-body text-text">
            {fr.user.name || fr.user.handle}
          </Text>
          {fr.note ? (
            <Text className="font-serif-italic text-serif-sm text-text-2">“{fr.note}”</Text>
          ) : null}
        </View>
        <ScoreBadge size="sm" score={fr.score} attribution={{ kind: 'stated' }} />
      </Pressable>
    </Link>
  )
}

// Popular dishes — a photo rail of dishes friends posted here, with an entry to
// post your own (only if you've ranked the place).
function PopularDishes({ restaurantId, canAdd }: { restaurantId: string; canAdd: boolean }) {
  const router = useRouter()
  const t = useT()
  const q = useQuery({
    queryKey: ['dishes', restaurantId],
    queryFn: () => api.get<{ dishes: Dish[] }>(`/dishes/restaurant/${restaurantId}`),
  })
  const dishes = q.data?.dishes ?? []
  if (dishes.length === 0 && !canAdd && !q.isError) return null

  return (
    <>
      <SectionHeader
        action={
          canAdd ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/dish?restaurant=${restaurantId}`)}
              className="min-h-[44px] justify-center active:opacity-60"
            >
              <Text className="font-ui text-eyebrow text-accent-strong uppercase tracking-eyebrow">
                {t('restaurant.add_dish')}
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        {t('restaurant.popular_dishes')}
      </SectionHeader>
      {q.isError ? (
        <Caption className="mt-1">{t('restaurant.dishes_load_error')}</Caption>
      ) : dishes.length === 0 ? (
        <Body className="mt-1">{t('restaurant.no_dishes')}</Body>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 pt-2 pr-5"
        >
          {dishes.map((d) => (
            <Link key={d.id} href={`/dish/${d.id}`} asChild>
              <Pressable className="w-36 active:opacity-80">
                <PlaceCover
                  seed={d.id}
                  name={d.name}
                  coverImageId={d.imageId}
                  size={{ w: 320, h: 320 }}
                  className="h-36 w-36"
                />
                <Text className="mt-2 font-serif text-serif-sm text-text" numberOfLines={1}>
                  {d.name}
                </Text>
                {/* A plain Pressable, not a nested Link — Link-in-Link has its
                    own gesture-machinery bug (see the feed card's note on the
                    same fix); a router.push here avoids it. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/u/${d.user.id}`)}
                  className="self-start active:opacity-70"
                >
                  <Caption numberOfLines={1}>
                    {t('restaurant.by_name', {
                      name: (d.user.name || d.user.handle || '').split(' ')[0],
                    })}
                  </Caption>
                </Pressable>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      )}
    </>
  )
}
