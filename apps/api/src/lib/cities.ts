// Cities for the location filter: searching them (Google Autocomplete's `(cities)` type), and the box
// a city covers — what "in Miami" means, both for Google's search and for Mesa's own results.

import {
  type GoogleViewport,
  type Prediction,
  autocompleteRequest,
  cityViewport,
} from './googlePlaces'

export interface CitySuggestion {
  placeId: string
  name: string
  subtitle: string
}

// With `regionCode: 'do'` Google drops the country from a Dominican result (home needs no label) and
// keeps it on every foreign one, so a city with no secondary text is a Dominican one.
export function toCitySuggestion(p: Prediction): CitySuggestion {
  return {
    placeId: p.providerPlaceId,
    name: p.name,
    subtitle: p.secondaryText ?? 'República Dominicana',
  }
}

// The same hint ranks Dominican cities first ("Santo…" is Santo Domingo, not Santorini) without
// excluding anywhere else. One request per keystroke after the app's debounce; five results at most.
export async function searchCities(q: string): Promise<CitySuggestion[]> {
  const found = await autocompleteRequest({
    input: q,
    includedPrimaryTypes: ['(cities)'],
    languageCode: 'es',
    regionCode: 'do',
  })
  return found.map(toCitySuggestion)
}

export interface Rect {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// A city is the box Google draws around it, but never smaller than about 22 km a side. Google's own
// box for La Romana is 8 km tall and sits just short of Casa de Campo, and "in La Romana" has to
// include it. A box that crosses the antimeridian is not supported (null): no city a member would
// search for does, and a rectangle test over lat/lng columns would need two halves for it.
const MIN_HALF_DEGREES = 0.1
export function cityRect(viewport: GoogleViewport | null | undefined): Rect | null {
  const lo = viewport?.low
  const hi = viewport?.high
  if (
    lo?.latitude == null ||
    lo.longitude == null ||
    hi?.latitude == null ||
    hi.longitude == null ||
    lo.longitude > hi.longitude
  ) {
    return null
  }
  const grow = (a: number, b: number): [number, number] => {
    const mid = (a + b) / 2
    const half = Math.max(Math.abs(b - a) / 2, MIN_HALF_DEGREES)
    return [mid - half, mid + half]
  }
  const [minLat, maxLat] = grow(lo.latitude, hi.latitude)
  const [minLng, maxLng] = grow(lo.longitude, hi.longitude)
  return { minLat, maxLat, minLng, maxLng }
}

// Each city's box is looked up once and kept in memory: Google lets coordinates be cached for 30
// days, and a restart simply asks again. Bounded so a stream of different cities cannot grow it.
const RECT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RECT_CACHE_MAX = 500
const rectCache = new Map<string, { rect: Rect; at: number }>()

export async function cityRectFor(placeId: string, now = Date.now()): Promise<Rect | null> {
  const hit = rectCache.get(placeId)
  if (hit && now - hit.at < RECT_TTL_MS) return hit.rect
  const rect = cityRect(await cityViewport(placeId))
  if (!rect) return null
  if (rectCache.size >= RECT_CACHE_MAX) rectCache.clear()
  rectCache.set(placeId, { rect, at: now })
  return rect
}

// The boxes for the cities a member picked; one Google could not place is left out.
export async function cityRects(placeIds: string[]): Promise<Rect[]> {
  const rects = await Promise.all(placeIds.map((id) => cityRectFor(id)))
  return rects.filter((r): r is Rect => r != null)
}

// At most this many cities at once: each is a Google request in the search, and a list longer than
// this is not a place to look but a country.
export const MAX_CITIES = 5

// `cities=id1,id2` as the app sends it: only things that look like Google place ids (they go into a
// URL), no repeats, and no more than MAX_CITIES.
export function parseCityIds(raw: string | undefined): string[] {
  if (!raw) return []
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{10,300}$/.test(s))
  return [...new Set(ids)].slice(0, MAX_CITIES)
}
