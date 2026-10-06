import Mapbox, { Camera, CircleLayer, MapView, MarkerView, ShapeSource } from '@rnmapbox/maps'
import { useEffect } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { displayScore } from '@/lib/display'
import type { LatLng } from '@/lib/geo'
import { HAS_MAP_TOKEN } from '@/lib/mapbox'
import { coreOf, fitBox } from '@/lib/mapFit'
import type { MapSpot } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES, MAP_USER_LOCATION_BLUE, MAP_USER_LOCATION_RING } from '@/theme/vars'

// The real, pannable/zoomable street map (@rnmapbox/maps) — the native
// replacement for the web's mapbox-gl MapGL (apps/app/src/screens/map/MapGL.tsx).
// A spot people you follow have ranked is a SCORE PIN — their average, in a raised pill (the chosen
// one solid ink); every other spot (and a single-place map's subject) is a quiet dot. The style follows the active theme (light-v11 / dark-v11 via the
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
  selectedId,
  style,
}: {
  spots: MapSpot[]
  me?: LatLng | null
  onSelect?: (id: string) => void
  // A fixed view (a single-place map) instead of fit-to-bounds.
  center?: { lat: number; lng: number; zoom: number }
  // The spot this map is about — drawn as the accent pin.
  highlightId?: string
  // The spot whose card is open — its score pin turns solid.
  selectedId?: string | null
  style?: StyleProp<ViewStyle>
}) {
  const theme = useResolvedTheme()
  const styleURL = theme === 'night' ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light

  // Fit-to-bounds view: the box around the dense core of the plotted points (spots + you) — see
  // lib/mapFit.ts for why not simply every point. A box needs two DISTINCT points: one point (or
  // several stacked on the same coordinate) collapses ne/sw to the same corner, which Mapbox resolves
  // to an arbitrary/world-level zoom rather than "zoomed in on the one spot".
  const pts = [...spots.map((s) => ({ lat: s.lat, lng: s.lng })), ...(me ? [me] : [])]
  const box = center ? null : fitBox(pts)
  const bounds = box
    ? { ...box, paddingLeft: 48, paddingRight: 48, paddingTop: 48, paddingBottom: 48 }
    : undefined
  const singlePoint = !center && !box && pts.length > 0 ? (coreOf(pts)[0] ?? null) : null

  // Two layers of marks. The QUIET dots — every place nobody you follow has ranked — are one native
  // circle layer (a hundred-odd views for them was heavy, and many places share a coordinate, so
  // they buried the score pins drawn above them). The pins that carry meaning — a score, the map's
  // subject, the chosen spot — are MarkerViews on top of it.
  const dot = useColor('text')
  const ring = useColor('surface')
  const isPin = (s: MapSpot) =>
    s.id === selectedId ||
    s.id === highlightId ||
    (!center && s.friendCount > 0 && s.friendAvg != null)
  const pins = spots
    .filter(isPin)
    .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
  const dots = {
    type: 'FeatureCollection' as const,
    features: spots
      .filter((s) => !isPin(s))
      .map((s) => ({
        type: 'Feature' as const,
        id: s.id,
        properties: { id: s.id },
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      })),
  }

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
      <ShapeSource
        id="quiet-spots"
        shape={dots}
        hitbox={{ width: 28, height: 28 }}
        onPress={(e) => {
          const id = e.features[0]?.properties?.id
          if (typeof id === 'string') onSelect?.(id)
        }}
      >
        <CircleLayer
          id="quiet-spots-dots"
          style={{
            circleRadius: 7,
            circleColor: dot,
            circleStrokeColor: ring,
            circleStrokeWidth: 2,
          }}
        />
      </ShapeSource>
      {pins.map((s) => {
        const scored = !center && s.friendCount > 0 && s.friendAvg != null
        return (
          <MarkerView key={s.id} coordinate={[s.lng, s.lat]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                scored ? `${s.name}, ${displayScore(s.friendAvg as number)}` : s.name
              }
              onPress={() => onSelect?.(s.id)}
              hitSlop={12}
            >
              {scored ? (
                <ScorePin score={s.friendAvg as number} selected={s.id === selectedId} />
              ) : (
                <View className="h-4 w-4 rounded-pill border-2 border-on-accent bg-accent-fill" />
              )}
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

// A spot's score on the map: the friends' average in the serif, in a raised pill — solid ink once chosen.
// A graphic, so it doesn't follow the text-size setting.
function ScorePin({ score, selected }: { score: number; selected: boolean }) {
  const lift = useLift('float')
  return (
    <View
      className={`h-[30px] items-center justify-center rounded-pill px-2.5 ${selected ? 'bg-ink' : 'bg-surface'}`}
      style={[lift, selected ? { transform: [{ scale: 1.08 }] } : null]}
    >
      <Text
        style={DATA_FIGURES}
        allowFontScaling={false}
        className={`font-serif text-[16px] leading-[20px] ${selected ? 'text-on-ink' : 'text-text'}`}
      >
        {displayScore(score)}
      </Text>
    </View>
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
          borderColor: MAP_USER_LOCATION_RING,
        }}
      />
    </View>
  )
}
