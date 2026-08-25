import { Geolocation } from '@capacitor/geolocation'

export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_M = 6371000

// Great-circle distance in meters — plenty accurate at city scale, and no
// need for anything heavier (PostGIS, a geo library) for one city.
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s))
}

// "350 m" / "1,2 km" — Spanish decimal comma, matching the rest of the app's
// number formatting.
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

// One call, works on web and native: @capacitor/geolocation's web
// implementation IS navigator.geolocation, and on iOS/Android it's the real
// OS location service — no platform branching needed here. Low accuracy is
// plenty for "which restaurant is closer" at city scale, and keeps the
// permission prompt from implying Mesa wants GPS-grade tracking.
export async function getPosition(): Promise<LatLng> {
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 8000,
  })
  return { lat: pos.coords.latitude, lng: pos.coords.longitude }
}
