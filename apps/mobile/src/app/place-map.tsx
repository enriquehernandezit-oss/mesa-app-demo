import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ScreenHeader } from '@/components/ScreenHeader'
import { Button, Caption, EmptyState } from '@/components/ui'
import { DirectionsIcon } from '@/components/ui/icons'
import { openDirections } from '@/lib/directions'
import { useT } from '@/lib/i18n'
import { HAS_MAP_TOKEN } from '@/lib/mapbox'
import type { MapSpot } from '@/lib/types'

// A single place, full-screen and pannable — the native replacement for the
// web's PlaceMapSheet (apps/app/src/components/PlaceMapSheet.tsx). Reached from a
// restaurant profile's locator map. Zoom 16 keeps street names readable (the
// block, not the rooftop). "Cómo llegar" hands off to the maps app.
//
// See map.tsx's comment: MesaMap is require()'d only once HAS_MAP_TOKEN is
// already known, so a token-less build never touches @rnmapbox/maps at all.
const MesaMap = HAS_MAP_TOKEN
  ? (require('@/components/MesaMap') as typeof import('@/components/MesaMap')).MesaMap
  : null
export default function PlaceMapScreen() {
  const t = useT()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const p = useLocalSearchParams<{
    id: string
    name: string
    lat: string
    lng: string
    address?: string
    neighborhood?: string
  }>()
  const lat = Number(p.lat)
  const lng = Number(p.lng)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const spots = useMemo<MapSpot[]>(
    () => [
      {
        id: p.id,
        name: p.name,
        cuisine: null,
        coverImageId: null,
        neighborhood: p.neighborhood ?? null,
        lat,
        lng,
        priceTier: null,
        friendAvg: null,
        friendCount: 0,
      },
    ],
    [p.id, p.name, p.neighborhood, lat, lng],
  )

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={p.name || t('common.back_plain')} />
      <View className="flex-1">
        {MesaMap && Number.isFinite(lat) && Number.isFinite(lng) ? (
          <MesaMap
            spots={spots}
            center={{ lat, lng, zoom: 16 }}
            highlightId={p.id}
            style={{ flex: 1 }}
          />
        ) : (
          <EmptyState body={t('map.coming_soon_body')}>{t('map.unavailable')}</EmptyState>
        )}
      </View>
      <View
        className="border-line border-t bg-bg px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {p.address || p.neighborhood ? (
          <Caption className="mb-2">{p.address || p.neighborhood}</Caption>
        ) : null}
        <Button
          variant="primary"
          icon={<DirectionsIcon size={15} color="on-accent" />}
          onPress={() => openDirections(lat, lng, p.name)}
        >
          {t('restaurant.directions')}
        </Button>
      </View>
    </View>
  )
}
