import { HAS_MAP_TOKEN, MesaMap } from '@/components/MesaMap'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, EmptyState, ErrorState, Eyebrow, Title } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { DirectionsIcon } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { openDirections } from '@/lib/directions'
import { cuisineLabel, displayScore, priceLabel } from '@/lib/display'
import type { MapSpot } from '@/lib/types'
import { useMyLocation } from '@/lib/useMyLocation'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

// A barrio map of Santo Domingo — every spot at its real lat/lng, the ones people
// you follow have ranked lit brass. Ported from apps/app/src/screens/map/
// MapScreen.tsx; the web's mapbox-gl-or-SVG split becomes @rnmapbox/maps (MesaMap)
// when a token is configured, else a graceful "map unavailable" state (native
// maps are the v1 feature, so there's no hand-drawn SVG fallback here). Tapping a
// pin opens the same card with the friends' average and a way into the spot.
export default function MapScreen() {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['map'],
    queryFn: () => api.get<{ spots: MapSpot[] }>('/restaurants/map'),
    staleTime: 120_000,
  })
  const { position: myPosition, status: locationStatus, request: requestLocation } = useMyLocation()

  const spots = q.data?.spots ?? []
  const selected = spots.find((s) => s.id === selectedId) ?? null
  const rankedByFriends = spots.filter((s) => s.friendCount > 0).length

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel="Atrás" />
      <View className="px-5 pb-3">
        <Eyebrow>Santo Domingo</Eyebrow>
        <Title>El mapa</Title>
        {rankedByFriends > 0 && (
          <Body className="text-accent">
            {rankedByFriends} spot{rankedByFriends === 1 ? '' : 's'} que tus amigos han rankeado.
          </Body>
        )}
        {locationStatus === 'idle' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => requestLocation()}
            className="min-h-[40px] justify-center active:opacity-60"
          >
            <Text className="font-ui-medium text-label text-accent-strong">Ubícame en el mapa</Text>
          </Pressable>
        )}
        {locationStatus === 'loading' && <Caption>Buscando tu ubicación…</Caption>}
        {locationStatus === 'denied' && (
          <Caption>
            La ubicación está desactivada. Actívala para Mesa en los ajustes del teléfono.
          </Caption>
        )}
      </View>

      <View className="flex-1">
        {q.isPending ? (
          <Body className="px-5">Cargando el mapa…</Body>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar el mapa.</ErrorState>
        ) : spots.length === 0 ? (
          <EmptyState>Aún no hay spots.</EmptyState>
        ) : HAS_MAP_TOKEN ? (
          <MesaMap spots={spots} me={myPosition} onSelect={setSelectedId} style={{ flex: 1 }} />
        ) : (
          <EmptyState body="El mapa llega con la próxima versión.">
            El mapa no está disponible.
          </EmptyState>
        )}
      </View>

      {selected && <SpotCard spot={selected} onClose={() => setSelectedId(null)} />}
    </View>
  )
}

function SpotCard({ spot, onClose }: { spot: MapSpot; onClose: () => void }) {
  const meta = [cuisineLabel(spot.cuisine), spot.neighborhood, priceLabel(spot.priceTier)]
    .filter(Boolean)
    .join(' · ')
  return (
    <View className="absolute inset-x-3 bottom-6 flex-row items-center gap-3 rounded border border-line bg-surface-raised p-3 shadow-lg">
      <PlaceCover
        seed={spot.id}
        name={spot.name}
        coverImageId={spot.coverImageId}
        size={{ w: 200, h: 200 }}
        className="h-16 w-16"
      />
      <View className="flex-1">
        <Text className="font-serif text-serif-md text-text" numberOfLines={1}>
          {spot.name}
        </Text>
        <Caption numberOfLines={1}>{meta}</Caption>
        {spot.friendCount > 0 ? (
          <View className="mt-1 flex-row items-baseline gap-2">
            <Text className="font-serif text-serif-md text-accent">
              {displayScore(spot.friendAvg ?? 0)}
            </Text>
            <Caption>
              {spot.friendCount} amig{spot.friendCount === 1 ? 'o' : 'os'} · promedio
            </Caption>
          </View>
        ) : (
          <Caption className="mt-1">Nadie que sigues lo ha rankeado aún.</Caption>
        )}
      </View>
      <View className="items-end gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => openDirections(spot.lat, spot.lng, spot.name)}
          className="min-h-[36px] flex-row items-center gap-1 active:opacity-70"
        >
          <DirectionsIcon size={14} />
          <Text className="font-mono text-eyebrow text-text-muted">Cómo llegar</Text>
        </Pressable>
        <Link href={`/r/${spot.id}`} asChild>
          <Pressable accessibilityRole="button" onPress={onClose} className="active:opacity-70">
            <Text className="font-ui-medium text-label text-accent-strong">Ver ›</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  )
}
