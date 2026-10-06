import { haversineM } from './haversine'

// Where the map opens. Fitting a box around EVERY plotted place worked while the catalog was one city; with
// places added from Google worldwide, one stray pin in another country stretched the box across an
// ocean and the map opened on mostly sea. This fits the dense core instead: the points within
// CORE_RADIUS_M of the median point (outliers stay on the map, they just don't decide the first view).
export type Pt = { lat: number; lng: number }
export type FitBox = { ne: [number, number]; sw: [number, number] }

// Wider than any one city's sprawl, far smaller than the distance to the next country.
export const CORE_RADIUS_M = 80_000

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

// The points that decide the first view (all of them when nothing clusters).
export function coreOf<T extends Pt>(points: T[]): T[] {
  if (points.length === 0) return points
  const centre = { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) }
  const core = points.filter((p) => haversineM(centre, p) <= CORE_RADIUS_M)
  return core.length > 0 ? core : points
}

// The box around the core points as [lng, lat] corners (Mapbox order), or null when there are fewer
// than two distinct points to box.
export function fitBox(points: Pt[]): FitBox | null {
  if (points.length === 0) return null
  const use = coreOf(points)
  const lats = use.map((p) => p.lat)
  const lngs = use.map((p) => p.lng)
  if (Math.max(...lats) === Math.min(...lats) && Math.max(...lngs) === Math.min(...lngs))
    return null
  return {
    ne: [Math.max(...lngs), Math.max(...lats)],
    sw: [Math.min(...lngs), Math.min(...lats)],
  }
}
