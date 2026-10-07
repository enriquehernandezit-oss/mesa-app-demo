import { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SpotCard } from '@/components/map/SpotCard'
import { EmptyState, MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { GlassCircle } from '@/components/ui/GlassCircle'
import { ListIcon } from '@/components/ui/icons'
import { formatDistance, haversineM } from '@/lib/geo'
import type { LatLng } from '@/lib/geo'
import { useT } from '@/lib/i18n'
import { HAS_MAP_TOKEN } from '@/lib/mapbox'
import type { ExploreHit, MapSpot } from '@/lib/types'

// Explore's results on a map (Airbnb's "Mapa"): exactly what the list shows — the search, the filters,
// Cerca, Abierto ahora — as pins, a tap on one opens its card, and "Lista" goes back. It reads the same
// hits the list reads, so the two can never disagree.
//
// MesaMap touches the native Mapbox module the moment its file loads, so — as in app/map.tsx — it is
// require()d only once there is a token.
const MesaMap = HAS_MAP_TOKEN
  ? (require('@/components/MesaMap') as typeof import('@/components/MesaMap')).MesaMap
  : null

// A result as a map spot. One without coordinates (an older API) is left off the map.
export function spotsFromHits(hits: ExploreHit[]): MapSpot[] {
  return hits.flatMap((h) =>
    h.lat != null && h.lng != null
      ? [
          {
            id: h.id,
            name: h.name,
            cuisine: h.cuisine,
            coverImageId: h.coverImageId,
            neighborhood: h.neighborhood,
            lat: h.lat,
            lng: h.lng,
            priceTier: h.priceTier,
            friendAvg: h.friendAvg,
            friendCount: h.friendCount,
          },
        ]
      : [],
  )
}

export function ResultsMap({
  hits,
  me,
  bottomInset,
  onClose,
}: {
  hits: ExploreHit[]
  me: LatLng | null
  // Clear of the tab bar.
  bottomInset: number
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const spots = useMemo(() => spotsFromHits(hits), [hits])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A filter changed under an open card: the place may be gone from the results.
  useEffect(() => {
    if (selectedId && !spots.some((s) => s.id === selectedId)) setSelectedId(null)
  }, [spots, selectedId])
  const selected = spots.find((s) => s.id === selectedId) ?? null

  return (
    <View className="absolute inset-0 bg-bg">
      {MesaMap && spots.length > 0 ? (
        <MesaMap
          spots={spots}
          me={me}
          onSelect={setSelectedId}
          selectedId={selectedId}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : (
        <View
          className="flex-1 items-center justify-center px-5"
          style={{ paddingTop: insets.top + 64 }}
        >
          <EmptyState body={MesaMap ? undefined : t('map.coming_soon_body')}>
            {MesaMap ? t('explore.map_none') : t('map.unavailable')}
          </EmptyState>
        </View>
      )}

      <View
        pointerEvents="box-none"
        className="absolute inset-x-4 flex-row items-center gap-2"
        style={{ top: insets.top + 8 }}
      >
        <GlassCircle size={44} accessibilityLabel={t('explore.show_list')} onPress={onClose}>
          <ListIcon size={18} color="text" />
        </GlassCircle>
        <Glass
          variant="bar"
          className="h-11 flex-1 flex-row items-center px-4"
          pointerEvents="none"
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="flex-1 font-ui-semibold text-subhead text-text"
          >
            {t('explore.map_count', { n: spots.length })}
          </Text>
        </Glass>
      </View>

      {selected ? (
        <SpotCard
          spot={selected}
          distance={
            me ? formatDistance(haversineM(me, { lat: selected.lat, lng: selected.lng })) : null
          }
          bottom={bottomInset + 10}
        />
      ) : null}
    </View>
  )
}
