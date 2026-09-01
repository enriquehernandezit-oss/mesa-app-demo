import * as Location from 'expo-location'

export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_M = 6371000

// Great-circle distance in meters — plenty accurate at city scale. Ported
// verbatim from apps/app/src/lib/geo.ts.
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s))
}

// "350 m" / "1,2 km" — Spanish decimal comma. Ported verbatim.
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

// The device position via expo-location (was @capacitor/geolocation). Requests
// foreground permission first — only ever reached from a tap (the rank flow's
// "Cerca" chip), so the prompt is expected. Low accuracy is plenty for "which
// spot is closer" and keeps the prompt from implying GPS-grade tracking; throws
// on denial/timeout, which callers treat as "just don't sort by distance".
export async function getPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== Location.PermissionStatus.GRANTED) throw new Error('location-denied')
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
  return { lat: pos.coords.latitude, lng: pos.coords.longitude }
}
