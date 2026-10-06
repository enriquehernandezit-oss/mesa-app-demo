// Pure distance maths, split out of geo.ts (which pulls in expo-location) so it can be unit tested.
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
