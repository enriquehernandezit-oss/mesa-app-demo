import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SpotCard } from '@/components/map/SpotCard'
import { Body, EmptyState, ErrorState, MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { GlassCircle } from '@/components/ui/GlassCircle'
import { BackIcon, LocateIcon, SearchIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { formatDistance, haversineM } from '@/lib/geo'
import { useT } from '@/lib/i18n'
import { HAS_MAP_TOKEN } from '@/lib/mapbox'
import type { MapSpot } from '@/lib/types'
import { useMyLocation } from '@/lib/useMyLocation'

// A neighborhood map of Santo Domingo, full-bleed — every spot at its real lat/lng, the ones people
// you follow have ranked as SCORE PINS (their average, in a raised pill). Back, a line saying how
// many of those there are, and "find me" float over it as glass; tapping a pin opens a glass card
// at the bottom with the place and a way into it. Ported from apps/app/src/screens/map/
// MapScreen.tsx; the web's mapbox-gl-or-SVG split becomes @rnmapbox/maps (MesaMap) when a token is
// configured, else a graceful "map unavailable" state (native maps are the v1 feature, so there's
// no hand-drawn SVG fallback here).
//
// MesaMap.tsx does a top-level `import ... from '@rnmapbox/maps'`, which
// touches the native module the moment the FILE loads — before any runtime
// check gets a chance to gate it. require() it only once we already know
// HAS_MAP_TOKEN, so a token-less build never touches it at all.
const MesaMap = HAS_MAP_TOKEN
  ? (require('@/components/MesaMap') as typeof import('@/components/MesaMap')).MesaMap
  : null
export default function MapScreen() {
  const router = useRouter()
  const t = useT()
  const insets = useSafeAreaInsets()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['map'],
    queryFn: () => api.get<{ spots: MapSpot[] }>('/restaurants/map'),
    staleTime: 120_000,
  })
  const { position: myPosition, status: locationStatus, request: requestLocation } = useMyLocation()

  // "Find me" says what went wrong once it has been asked for — not on arrival.
  const asked = useRef(false)
  useEffect(() => {
    if (!asked.current) return
    if (locationStatus === 'denied') toast({ message: t('map.location_disabled') })
    else if (locationStatus === 'error') toast({ message: t('map.location_error') })
  }, [locationStatus, t])

  const spots = q.data?.spots ?? []
  const selected = spots.find((s) => s.id === selectedId) ?? null
  const rankedByFriends = spots.filter((s) => s.friendCount > 0).length
  const mapReady = !q.isPending && !q.isError && spots.length > 0 && MesaMap

  return (
    <View className="flex-1 bg-bg">
      {mapReady && MesaMap ? (
        <MesaMap
          spots={spots}
          me={myPosition}
          onSelect={setSelectedId}
          selectedId={selectedId}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : (
        <View
          className="flex-1 items-center justify-center px-5"
          style={{ paddingTop: insets.top + 64 }}
        >
          {q.isPending ? (
            <Body>{t('map.loading')}</Body>
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()}>{t('map.load_error')}</ErrorState>
          ) : spots.length === 0 ? (
            <EmptyState>{t('map.no_spots')}</EmptyState>
          ) : (
            <EmptyState body={t('map.coming_soon_body')}>{t('map.unavailable')}</EmptyState>
          )}
        </View>
      )}

      {/* The floating controls */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-4 flex-row items-center gap-2"
        style={{ top: insets.top + 8 }}
      >
        <GlassCircle size={44} accessibilityLabel={t('common.back_plain')} onPress={goBack}>
          <BackIcon size={18} color="text" />
        </GlassCircle>
        <Glass
          variant="bar"
          className="h-11 flex-1 flex-row items-center gap-2 px-4"
          pointerEvents="none"
        >
          <SearchIcon size={17} color="text-muted" />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="flex-1 font-ui text-subhead text-text-muted"
          >
            {rankedByFriends > 0
              ? t('map.friends_ranked_count', { n: rankedByFriends })
              : t('map.title')}
          </Text>
        </Glass>
        <GlassCircle
          size={44}
          accessibilityLabel={t('map.locate_me')}
          onPress={() => {
            asked.current = true
            if (locationStatus === 'denied') toast({ message: t('map.location_disabled') })
            else requestLocation()
          }}
        >
          {locationStatus === 'loading' ? (
            <ActivityIndicator size="small" />
          ) : (
            <LocateIcon size={18} color={myPosition ? 'accent' : 'text'} />
          )}
        </GlassCircle>
      </View>

      {selected ? (
        <SpotCard
          spot={selected}
          distance={
            myPosition
              ? formatDistance(haversineM(myPosition, { lat: selected.lat, lng: selected.lng }))
              : null
          }
          bottom={Math.max(insets.bottom, 12) + 10}
        />
      ) : null}
    </View>
  )
}
