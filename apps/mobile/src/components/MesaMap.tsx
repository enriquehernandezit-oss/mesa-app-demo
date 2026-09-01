import type { LatLng } from '@/lib/geo'
import type { MapSpot } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import Mapbox, { Camera, MapView, MarkerView } from '@rnmapbox/maps'
import type { StyleProp, ViewStyle } from 'react-native'
import { Pressable, View } from 'react-native'

// The real, pannable/zoomable street map (@rnmapbox/maps) — the native
// replacement for the web's mapbox-gl MapGL (apps/app/src/screens/map/MapGL.tsx).
// Brass pins for spots friends have ranked (or the map's subject), quiet ink
// otherwise; the style follows the active theme (light-v11 / dark-v11 via the
// Mapbox default StyleURLs). Needs EXPO_PUBLIC_MAPBOX_TOKEN — callers gate on it.
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN
if (TOKEN) Mapbox.setAccessToken(TOKEN)

export const HAS_MAP_TOKEN = Boolean(TOKEN)

export function MesaMap({
  spots,
  me,
  onSelect,
  center,
  highlightId,
  style,
}: {
  spots: MapSpot[]
  me?: LatLng | null
  onSelect?: (id: string) => void
  // A fixed view (a single-place map) instead of fit-to-bounds.
  center?: { lat: number; lng: number; zoom: number }
  // The spot this map is about — drawn as the accent pin.
  highlightId?: string
  style?: StyleProp<ViewStyle>
}) {
  const theme = useResolvedTheme()
  const styleURL = theme === 'candlelit' ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light

  // Fit-to-bounds view: the box around every plotted point (spots + you).
  const pts = [...spots.map((s) => ({ lat: s.lat, lng: s.lng })), ...(me ? [me] : [])]
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const bounds =
    !center && pts.length > 0
      ? {
          ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
          sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
          paddingLeft: 48,
          paddingRight: 48,
          paddingTop: 48,
          paddingBottom: 48,
        }
      : undefined

  return (
    <MapView style={style} styleURL={styleURL} scaleBarEnabled={false}>
      <Camera
        {...(center
          ? { centerCoordinate: [center.lng, center.lat], zoomLevel: center.zoom }
          : { bounds })}
        animationDuration={0}
      />
      {spots.map((s) => {
        const hot = s.id === highlightId || s.friendCount > 0
        return (
          <MarkerView key={s.id} coordinate={[s.lng, s.lat]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.name}
              onPress={() => onSelect?.(s.id)}
              hitSlop={12}
            >
              <View
                className={`h-4 w-4 rounded-pill border-2 ${hot ? 'border-on-accent bg-accent' : 'border-surface bg-text'}`}
              />
            </Pressable>
          </MarkerView>
        )
      })}
      {me ? (
        <MarkerView coordinate={[me.lng, me.lat]}>
          <View className="h-3.5 w-3.5 rounded-pill border-2 border-surface bg-status-good" />
        </MarkerView>
      ) : null}
    </MapView>
  )
}
