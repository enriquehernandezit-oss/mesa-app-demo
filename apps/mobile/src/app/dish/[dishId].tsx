import { Body, Caption, Chip, EmptyState } from '@/components/ui'
import { DirectionsIcon, PhoneIcon, WebIcon } from '@/components/ui/icons'
import { Characteristics, ScoreBadge, UtilityPill } from '@/components/ui/patterns'
import { ApiError, api } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import type { DishDetail as DishDetailData } from '@/lib/types'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// UGC report reasons (App Store 1.2) — same set as the note/user reports.
const REASONS = ['Spam', 'Acoso', 'Inapropiado', 'Otro'] as const

// Dish detail (Phase 6 mock C3) — a posted dish, standing on its own: the hero
// photo, its caption, and the linked ranking (the place card carries the
// poster's attributed score). A dish is never free-floating; the place card is
// the anchor. Ported from apps/app/src/screens/dish/DishDetail.tsx. The grain
// post-processing (a CSS filter on web) lands with the image work in N6; the
// photo shows untreated until then, with its grain named on the film tag.
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
      <View className="flex-1 items-center justify-center bg-bg">
        <Body>Cargando…</Body>
      </View>
    )
  }
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 12 }}>
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          className="min-h-[44px] self-start justify-center active:opacity-60"
        >
          <Text className="font-ui-medium text-label text-text-muted">‹ Atrás</Text>
        </Pressable>
        <EmptyState>{notFound ? 'Plato no encontrado.' : 'No se pudo cargar el plato.'}</EmptyState>
      </View>
    )
  }

  const { dish } = q.data
  const { restaurant } = dish
  const firstName = (dish.user.name || dish.user.handle || '').split(' ')[0] || 'alguien'

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="h-72">
          <Image
            source={{ uri: dish.imageId }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Atrás"
            onPress={goBack}
            style={{ top: insets.top + 8 }}
            className="absolute left-4 h-10 w-10 items-center justify-center rounded-pill bg-surface active:opacity-80"
          >
            <Text className="font-serif text-title text-text">‹</Text>
          </Pressable>
          <View
            className="absolute right-4 rounded-pill bg-surface px-2 py-1"
            style={{ bottom: 10 }}
          >
            <Caption className="font-mono text-[10px]">film · {dish.grain}</Caption>
          </View>
        </View>

        <View className="px-5 pt-4">
          <Text className="font-serif text-title text-text">{dish.name}</Text>
          {dish.caption ? (
            <Text className="mt-1 font-serif-italic text-serif-md text-text-2">
              “{dish.caption}”
            </Text>
          ) : null}

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
          {!dish.posterIsMe && <DishReport dishId={dishId} />}
        </View>
      </ScrollView>
    </View>
  )
}

function DishReport({ dishId }: { dishId: string }) {
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'dish', targetId: dishId, reason }),
  })
  if (report.isSuccess) {
    return <Caption className="mt-6">Reportado. Gracias — lo revisaremos.</Caption>
  }
  return (
    <View className="mt-6 border-line border-t pt-4">
      {!open ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          className="min-h-[44px] self-start justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
            Reportar este plato
          </Text>
        </Pressable>
      ) : (
        <View className="gap-3">
          <Caption>¿Por qué reportas este plato?</Caption>
          <View className="flex-row flex-wrap gap-2">
            {REASONS.map((reason) => (
              <Chip
                key={reason}
                state="default"
                onPress={() => !report.isPending && report.mutate(reason)}
              >
                {reason}
              </Chip>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            className="min-h-[44px] self-start justify-center active:opacity-60"
          >
            <Text className="font-ui-medium text-label text-text-muted">Cancelar</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
