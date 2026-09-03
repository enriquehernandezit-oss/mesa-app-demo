import { ScreenHeader } from '@/components/ScreenHeader'
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
  CheckIcon,
  DirectionsIcon,
  ListIcon,
  PhoneIcon,
  PinIcon,
  ShareIcon,
  WebIcon,
} from '@/components/ui/icons'
import { Characteristics, ScoreBadge, UtilityPill } from '@/components/ui/patterns'
import { ApiError, api, apiOrigin } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { cuisineLabel, displayScore, priceLabel } from '@/lib/display'
import { cloudinaryUrl, mapboxStaticUrl } from '@/lib/media'
import { useFriendsOnlyScores } from '@/lib/prefs'
import { shareSpotCard } from '@/lib/shareCardStore'
import type { Dish, RestaurantProfileResponse } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
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

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get<RestaurantProfileResponse>(`/restaurants/${restaurantId}`),
    retry: false,
  })

  const toggleSave = useMutation({
    mutationFn: (save: boolean) =>
      save ? api.post('/saved', { restaurantId }) : api.del(`/saved/${restaurantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['saved'] })
    },
  })

  if (q.isPending) {
    // Skeleton, not a spinner: this screen's geometry is known, so holding the
    // hero + identity shape avoids content jumping into place on arrival.
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />
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
        <ScreenHeader onBack={goBack} backLabel="Atrás" />
        <View className="px-5">
          {notFound ? (
            <EmptyState>Spot no encontrado.</EmptyState>
          ) : (
            <ErrorState onRetry={() => q.refetch()}>No se pudo cargar el spot.</ErrorState>
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
      <ScrollView
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
              accessibilityLabel={`Ver ${restaurant.name} en el mapa`}
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
            <GlassCircle accessibilityLabel="Atrás" onPress={goBack}>
              <BackIcon size={20} />
            </GlassCircle>
          </View>
          <View style={{ position: 'absolute', top: insets.top + 8, right: 16 }}>
            <GlassCircle accessibilityLabel="Compartir" onPress={shareSpot}>
              <ShareIcon size={18} />
            </GlassCircle>
          </View>
          <View
            className="absolute left-4 rounded-pill bg-surface px-2 py-1"
            style={{ bottom: 10 }}
          >
            {/* MapBox burns its attribution into the static image's corner, which
                cover-crop then hides — so it's stated here when the hero is a map. */}
            <Caption className="font-mono text-micro">
              {mapCover ? '© Mapbox © OpenStreetMap' : 'film · con velas'}
            </Caption>
          </View>
        </View>

        <View className="px-5">
          {/* Identity, on the paper ground below the photo. */}
          <View className="pt-4">
            <Eyebrow>{restaurant.neighborhood?.name ?? 'Santo Domingo'}</Eyebrow>
            <View className="mt-1 flex-row items-start justify-between gap-3">
              <Title className="flex-1">{restaurant.name}</Title>
              {/* The fixed bottom bar is the one ranking CTA; this is only the
                  save (want-to-try) toggle, so no re-rank action lives here. */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: saved }}
                accessibilityLabel={saved ? 'Guardado — toca para quitar' : 'Quiero probar'}
                onPress={() => toggleSave.mutate(!saved)}
                disabled={toggleSave.isPending}
                className={`h-10 w-10 items-center justify-center rounded-pill border ${saved ? 'border-accent bg-accent-fill' : 'border-line'} active:opacity-80`}
              >
                <CheckIcon size={17} color={saved ? 'accent-strong' : 'text-muted'} />
              </Pressable>
            </View>
            {allMesa.avg != null && showMesa && (
              <View className="mt-1 flex-row items-baseline gap-2">
                <Text className="font-serif text-serif-lg text-accent">
                  {displayScore(allMesa.avg)}
                </Text>
                <Caption>{allMesa.count} rankeados</Caption>
              </View>
            )}
            {restaurant.address ? (
              <Caption className="mt-1 text-text-2">{restaurant.address}</Caption>
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
              hours={restaurant.closesAt ? `hasta ${restaurant.closesAt}` : null}
              social={
                friendsWantToTry.count > 0
                  ? {
                      people: friendsWantToTry.people,
                      label: `${friendsWantToTry.count} amigo${friendsWantToTry.count > 1 ? 's' : ''} quiere${friendsWantToTry.count > 1 ? 'n' : ''} probar`,
                    }
                  : undefined
              }
            />
          </View>

          {/* Utility pills — Website · Call · Directions (mock order). */}
          <View className="mt-5 flex-row gap-2">
            {restaurant.website ? (
              <UtilityPill icon={<WebIcon size={13} />} href={restaurant.website}>
                Sitio web
              </UtilityPill>
            ) : null}
            {restaurant.phone ? (
              <UtilityPill icon={<PhoneIcon size={13} />} href={`tel:${restaurant.phone}`}>
                Llamar
              </UtilityPill>
            ) : null}
            <UtilityPill
              icon={<DirectionsIcon size={13} />}
              onPress={() => openDirections(restaurant.lat, restaurant.lng, restaurant.name)}
            >
              Cómo llegar
            </UtilityPill>
          </View>

          {/* The badged score trio — every score is attributed, never the place's. */}
          {(myRanking || friendAvg != null || allMesa.avg != null) && (
            <>
              <SectionHeader>Puntuaciones</SectionHeader>
              <View className="mt-2 flex-row justify-around">
                {myRanking && (
                  <ScoreBadge
                    score={myRanking.score}
                    attribution={{ kind: 'you' }}
                    caption="Tu puntuación"
                    sub={`#${myRanking.position} en tu lista`}
                  />
                )}
                {friendAvg != null && (
                  <ScoreBadge
                    score={friendAvg}
                    attribution={{ kind: 'friends', count: friendsRankings.length }}
                    sub="lo que piensan"
                  />
                )}
                {allMesa.avg != null && showMesa && (
                  <ScoreBadge
                    score={allMesa.avg}
                    attribution={{ kind: 'mesa', count: allMesa.count }}
                    caption="Todo Mesa"
                    sub={`${allMesa.count} rankeados`}
                  />
                )}
              </View>
            </>
          )}

          <PopularDishes restaurantId={restaurantId} canAdd={Boolean(myRanking)} />

          <TheirScores rankings={friendsRankings} />

          {/* Locator map — a static MapBox tile that opens the full pannable map
              (place-map). Hidden when the hero itself is the map (one map per
              profile), and when no token is configured (no SVG fallback on native). */}
          {!mapCover && mapUrl && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver ${restaurant.name} en el mapa`}
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
                <Caption className="font-mono text-micro">Ver en el mapa</Caption>
              </View>
            </Pressable>
          )}

          {/* Required Google attribution whenever this profile's data came from
              Google (M9) — the official logo asset swaps in before a real launch. */}
          {restaurant.google && (
            <Caption className="mt-4 text-text-faint">Powered by Google</Caption>
          )}

          {/* Similar spots rail. */}
          {similar.length > 0 && (
            <>
              <SectionHeader>Spots parecidos</SectionHeader>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3 pt-2 pr-5"
              >
                {similar.map((s) => (
                  <Link key={s.id} href={`/r/${s.id}`} asChild>
                    <Pressable className="w-36 active:opacity-80">
                      <PlaceCover
                        seed={s.id}
                        name={s.name}
                        coverImageId={s.coverImageId}
                        size={{ w: 320, h: 400 }}
                        className="h-44 w-36"
                      />
                      <Text className="mt-2 font-serif text-serif-sm text-text" numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Caption numberOfLines={1}>
                        {[cuisineLabel(s.cuisine), s.neighborhood].filter(Boolean).join(' · ')}
                      </Caption>
                    </Pressable>
                  </Link>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>

      {/* Sticky condensed header — fades in once the hero scrolls away (mock D2). */}
      <Animated.View
        pointerEvents={condensed ? 'auto' : 'none'}
        style={{ opacity: heroOpacity, paddingTop: insets.top + 8 }}
        className="absolute inset-x-0 top-0 flex-row items-center gap-2 border-line border-b bg-bg px-4 pb-3"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Atrás"
          onPress={goBack}
          className="min-h-[44px] justify-center active:opacity-70"
        >
          <Text className="font-serif text-title text-text">‹</Text>
        </Pressable>
        <Text className="flex-1 font-serif text-serif-md text-text" numberOfLines={1}>
          {restaurant.name}
        </Text>
        {allMesa.avg != null && showMesa && (
          <Text className="font-serif text-serif-md text-accent">{displayScore(allMesa.avg)}</Text>
        )}
      </Animated.View>

      {/* The one ink CTA — fixed, never leaves (mock D2). Adapts to whether you've
          already ranked here, so nothing else on the screen duplicates it. */}
      <View
        className="absolute inset-x-0 bottom-0 border-line border-t bg-bg px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button variant="primary" onPress={() => router.push(`/rank?restaurant=${restaurantId}`)}>
          {myRanking ? 'Rankear otra vez' : 'Rankear este spot'}
        </Button>
      </View>
    </View>
  )
}

// Friends' scores (mock D2 "Their scores") — avatar + name + serif-italic quote +
// serif score. Capped at 3 with a "See all N rankings" expander.
function TheirScores({ rankings }: { rankings: RestaurantProfileResponse['friendsRankings'] }) {
  const [expanded, setExpanded] = useState(false)
  if (rankings.length === 0) {
    return (
      <>
        <SectionHeader>Sus puntuaciones</SectionHeader>
        <Body className="mt-1">Cuando alguien que sigues rankee esto, aparecerá aquí.</Body>
      </>
    )
  }
  const shown = expanded ? rankings : rankings.slice(0, 3)
  return (
    <>
      <SectionHeader>Sus puntuaciones</SectionHeader>
      {shown.map((fr) => (
        <Link key={fr.user.id} href={`/u/${fr.user.id}`} asChild>
          <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
            <Avatar name={fr.user.name || fr.user.handle || 'm'} src={fr.user.image} size={34} />
            <View className="flex-1">
              <Text className="font-ui-medium text-body text-text">
                {fr.user.name || fr.user.handle}
              </Text>
              {fr.note ? (
                <Text className="font-serif-italic text-serif-sm text-text-2">“{fr.note}”</Text>
              ) : null}
            </View>
            <Text className="font-serif text-serif-lg text-accent">{displayScore(fr.score)}</Text>
          </Pressable>
        </Link>
      ))}
      {rankings.length > 3 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((v) => !v)}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            {expanded ? 'Mostrar menos' : `Ver los ${rankings.length} rankings ›`}
          </Text>
        </Pressable>
      )}
    </>
  )
}

// Popular dishes — a photo rail of dishes friends posted here, with an entry to
// post your own (only if you've ranked the place).
function PopularDishes({ restaurantId, canAdd }: { restaurantId: string; canAdd: boolean }) {
  const router = useRouter()
  const q = useQuery({
    queryKey: ['dishes', restaurantId],
    queryFn: () => api.get<{ dishes: Dish[] }>(`/dishes/restaurant/${restaurantId}`),
  })
  const dishes = q.data?.dishes ?? []
  if (dishes.length === 0 && !canAdd) return null

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
                + Agregar un plato
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        Platos populares
      </SectionHeader>
      {dishes.length === 0 ? (
        <Body className="mt-1">Todavía no hay platos — sé el primero.</Body>
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
                <Caption numberOfLines={1}>
                  por {(d.user.name || d.user.handle || '').split(' ')[0]}
                </Caption>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      )}
    </>
  )
}
