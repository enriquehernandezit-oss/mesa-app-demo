import type { LatLng } from '@/lib/geo'
import { HAS_MAP_TOKEN } from '@/lib/mapbox'
import type { MapSpot } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { MAP_USER_LOCATION_BLUE } from '@/theme/vars'
import Mapbox, { Camera, MapView, MarkerView } from '@rnmapbox/maps'
import { useEffect } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Pressable, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

// The real, pannable/zoomable street map (@rnmapbox/maps) — the native
// replacement for the web's mapbox-gl MapGL (apps/app/src/screens/map/MapGL.tsx).
// Brass pins for spots friends have ranked (or the map's subject), quiet ink
// otherwise; the style follows the active theme (light-v11 / dark-v11 via the
// Mapbox default StyleURLs). Needs EXPO_PUBLIC_MAPBOX_TOKEN — callers gate on
// HAS_MAP_TOKEN (from lib/mapbox.ts, NOT re-exported here — see that file's
// comment for why importing this file at all must stay behind that check).
if (HAS_MAP_TOKEN) Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN as string)

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

  // Fit-to-bounds view: the box around every plotted point (spots + you). A
  // box needs two DISTINCT points — one point (or several stacked on the same
  // coordinate) collapses ne/sw to the same corner, which Mapbox resolves to
  // an arbitrary/world-level zoom rather than "zoomed in on the one spot".
  const pts = [...spots.map((s) => ({ lat: s.lat, lng: s.lng })), ...(me ? [me] : [])]
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const spread =
    pts.length >= 2 &&
    (Math.max(...lats) !== Math.min(...lats) || Math.max(...lngs) !== Math.min(...lngs))
  const bounds =
    !center && spread
      ? {
          ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
          sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
          paddingLeft: 48,
          paddingRight: 48,
          paddingTop: 48,
          paddingBottom: 48,
        }
      : undefined
  const singlePoint = !center && !spread && pts.length > 0 ? pts[0] : null

  return (
    <MapView style={style} styleURL={styleURL} scaleBarEnabled={false}>
      <Camera
        {...(center
          ? { centerCoordinate: [center.lng, center.lat], zoomLevel: center.zoom }
          : bounds
            ? { bounds }
            : singlePoint
              ? { centerCoordinate: [singlePoint.lng, singlePoint.lat], zoomLevel: 14 }
              : {})}
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
          <UserLocationDot />
        </MarkerView>
      ) : null}
    </MapView>
  )
}

// "You are here" — Apple Maps' own affordance for it (a solid blue dot,
// bordered, with a ring that continuously expands and fades outward) rather
// than a plain static pin: this is the one marker on the map that reflects a
// live GPS fix, not a fixed place, and the pulse is what reads as "live"
// instead of "just another pin." MAP_USER_LOCATION_BLUE is a deliberate,
// documented exception to the token system — see theme/vars.ts.
function UserLocationDot() {
  const pulse = useSharedValue(0)
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1)
  }, [pulse])
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 3.2]) }],
    opacity: interpolate(pulse.value, [0, 0.5, 1], [0.55, 0.2, 0]),
  }))
  return (
    <View className="items-center justify-center" style={{ width: 44, height: 44 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: MAP_USER_LOCATION_BLUE,
          },
          ringStyle,
        ]}
      />
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: MAP_USER_LOCATION_BLUE,
          borderWidth: 2,
          borderColor: '#fff',
        }}
      />
    </View>
  )
}
