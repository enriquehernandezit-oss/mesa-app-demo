import { type LatLng, haversineM } from './haversine'

// "Use my location" at sign-up: the sector whose centre is closest to the member, as a SUGGESTION they
// can change. A centre is an average of the sector's places, not a border, so near a boundary it can
// pick the neighbour — which is why it only ever pre-selects, and says which sector it chose.
export type SectorCentre = { slug: string; name: string; lat?: number; lng?: number }

// Farther than this from every sector centre and the person is not in (or near) one of ours — better to
// say so than to file a stranger under the least-far sector.
export const MAX_SECTOR_DISTANCE_M = 3000

export function nearestSector(
  position: LatLng,
  sectors: SectorCentre[],
  maxM = MAX_SECTOR_DISTANCE_M,
): SectorCentre | null {
  let best: SectorCentre | null = null
  let bestM = Number.POSITIVE_INFINITY
  for (const s of sectors) {
    if (s.lat == null || s.lng == null) continue
    const d = haversineM(position, { lat: s.lat, lng: s.lng })
    if (d < bestM) {
      best = s
      bestM = d
    }
  }
  return best && bestM <= maxM ? best : null
}
