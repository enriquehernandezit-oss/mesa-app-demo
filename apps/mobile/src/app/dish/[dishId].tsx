import { ReportControl } from '@/components/ReportControl'
import { Body, Caption, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { GlassCircle } from '@/components/ui/GlassCircle'
import { BackIcon, DirectionsIcon, PhoneIcon, WebIcon } from '@/components/ui/icons'
import { Characteristics, ScoreBadge, UtilityPill } from '@/components/ui/patterns'
import { ApiError, api } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { grainLabel } from '@/lib/display'
import { cloudinaryUrl } from '@/lib/media'
import type { DishDetail as DishDetailData } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Dish detail (Phase 6 mock C3) — a posted dish standing on its own: the hero
// photo, its caption, and the linked ranking (the place card carries the poster's
// attributed score). A dish is never free-floating; the place card is the anchor.
// Ported from apps/app/src/screens/dish/DishDetail.tsx. The grain treatment is a
// Cloudinary delivery transform in prod, so the photo shows untreated here (same
// as the feed) rather than through a CSS filter RN doesn't have.
export default function DishDetail() {
  const { dishId } = useLocalSearchParams<{ dishId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => api.get<{ dish: DishDetailData }>(`/dishes/${dishId}`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <Skeleton height={320} />
        <View className="gap-3 px-5 pt-4">
          <Skeleton height={22} width="55%" />
          <Skeleton height={12} width="75%" />
          <Skeleton height={64} className="mt-2" />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    // 404 is a dead end; anything else is worth retrying.
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 12 }}>
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          className="min-h-[44px] justify-center px-5 active:opacity-60"
        >
          <Text className="font-ui-medium text-label text-text-muted">‹ Atrás</Text>
        </Pressable>
        {notFound ? (
          <EmptyState>Plato no encontrado.</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar el plato.</ErrorState>
        )}
      </View>
    )
  }

  const { dish } = q.data
  const { restaurant } = dish
  const firstName = (dish.user.name || dish.user.handle || '').split(' ')[0] || 'alguien'

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="h-80">
          <Image
            source={{ uri: cloudinaryUrl(dish.imageId, { w: 1000, h: 1000 }) ?? undefined }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
          <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
            <GlassCircle accessibilityLabel="Atrás" onPress={goBack}>
              <BackIcon size={20} />
            </GlassCircle>
          </View>
          <View
            className="absolute right-4 rounded-pill bg-surface px-2 py-1"
            style={{ bottom: 10 }}
          >
            <Caption className="font-mono text-[10px]">film · {grainLabel(dish.grain)}</Caption>
          </View>
        </View>

        <View className="px-5 pt-4">
          <Text className="font-serif text-title text-text">{dish.name}</Text>
          {dish.caption ? (
            <Text className="mt-1 font-serif-italic text-serif-sm text-text-2">
              “{dish.caption}”
            </Text>
          ) : null}

          {/* The place card — the anchor. Carries the poster's attributed score. */}
          <Link href={`/r/${restaurant.id}`} asChild>
            <Pressable className="mt-4 flex-row items-center gap-3 rounded border border-line bg-surface p-3 active:opacity-80">
              <View className="flex-1">
                <Text className="font-serif text-serif-md text-text">{restaurant.name}</Text>
                <Characteristics
                  priceTier={restaurant.priceTier}
                  cuisine={restaurant.cuisine}
                  neighborhood={dish.neighborhood}
                  hours={restaurant.closesAt ? `hasta ${restaurant.closesAt}` : null}
                />
              </View>
              <ScoreBadge
                size="sm"
                score={dish.score}
                attribution={dish.posterIsMe ? { kind: 'you' } : { kind: 'user', label: firstName }}
              />
            </Pressable>
          </Link>

          <View className="mt-4 flex-row gap-2">
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

          {/* A dish is UGC — someone else's photo/caption must be reportable
              (App Store 1.2). Hidden on your own post. */}
          {!dish.posterIsMe && (
            <ReportControl targetType="dish" targetId={dishId} label="Reportar este plato" />
          )}
        </View>
      </ScrollView>
    </View>
  )
}
