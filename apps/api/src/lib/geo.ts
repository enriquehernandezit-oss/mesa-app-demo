// Where a place belongs in Mesa's geography.
//
// Mesa curates ONE city: Santo Domingo, in seven sectors — the `listed` neighborhoods, which are
// what every picker, filter pill and the Map offer. A member can add a place from anywhere
// Google knows, so the rest of the world is filed by CITY, in neighborhood rows created on demand
// and left unlisted. A Punta Cana restaurant then shows as "Punta Cana" instead of the Santo
// Domingo sector it happens to be nearest to (which is what the nearest-centroid fallback in
// googlePlaces.ts's resolveNeighborhood does, with no sense of distance), and the Map is not
// stretched across the island to include it.

import { db, schema } from '@mesa/db'
import { eq } from 'drizzle-orm'

import { type GooglePlaceDetails, resolveNeighborhood } from './googlePlaces'

// The box Mesa treats as Santo Domingo: the metro area, Haina to Boca Chica. The importer, places:enrich,
// the audit and the filing below all agree on this one definition. A Text Search on a generic name
// ("Mimosa") can pull an unrelated business from anywhere, so a hit is only trustworthy once it is
// inside this box AND plausibly the same name.
export const SD_BOUNDS = { minLat: 18.3, maxLat: 18.65, minLng: -70.1, maxLng: -69.6 } as const

export function inSantoDomingo(lat: number, lng: number): boolean {
  return (
    lat >= SD_BOUNDS.minLat &&
    lat <= SD_BOUNDS.maxLat &&
    lng >= SD_BOUNDS.minLng &&
    lng <= SD_BOUNDS.maxLng
  )
}

// An area for a place outside Santo Domingo: its city, in its country. Not a sector — nothing
// curates it and nothing offers it as a choice; it exists so a place has an honest label.
export interface AreaDraft {
  slug: string
  name: string
  city: string
  countryCode: string
  lat: number
  lng: number
}

// The component types Google nests a place's city under, most specific first. `locality` is the
// city almost everywhere; `postal_town` is the UK's, and the administrative levels catch the
// places (parts of Japan, rural areas) that have no locality at all.
const CITY_TYPES = [
  'locality',
  'postal_town',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'administrative_area_level_1',
]

// Lowercased, accent-stripped, anything that is not a letter or digit collapsed to one dash. Letters
// are matched by Unicode property, not a-z, so a city written in another script still gets a
// distinct slug instead of all of them sharing "jp-".
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

// The area Google's address puts a place under. Null when Google gave no location or no country —
// there is then nothing honest to file it under, and the caller refuses the place.
export function areaFor(d: GooglePlaceDetails): AreaDraft | null {
  const lat = d.location?.latitude
  const lng = d.location?.longitude
  if (lat == null || lng == null) return null
  const component = (type: string) => d.addressComponents?.find((c) => c.types?.includes(type))
  const country = component('country')
  const countryCode = country?.shortText?.toLowerCase()
  if (!countryCode || !/^[a-z]{2}$/.test(countryCode)) return null
  const city = CITY_TYPES.map((t) => component(t)?.longText).find(Boolean) ?? country?.longText
  if (!city) return null
  const slug = slugify(city)
  if (!slug) return null
  return { slug: `${countryCode}-${slug}`, name: city, city, countryCode, lat, lng }
}

export type Placing<T> = { kind: 'sector'; hood: T } | { kind: 'area'; area: AreaDraft }

// Where a Google place goes: one of Santo Domingo's sectors when it is inside Santo Domingo, else
// the area for its city. `sectors` must be the LISTED neighborhoods only — an unlisted area is
// never a candidate for a Santo Domingo place. Null when it cannot be placed at all.
export function placeIn<T extends { id: string; name: string; lat: number; lng: number }>(
  d: GooglePlaceDetails,
  sectors: T[],
): Placing<T> | null {
  const lat = d.location?.latitude
  const lng = d.location?.longitude
  if (lat == null || lng == null) return null
  if (inSantoDomingo(lat, lng)) {
    return sectors.length > 0 ? { kind: 'sector', hood: resolveNeighborhood(d, sectors) } : null
  }
  const area = areaFor(d)
  return area ? { kind: 'area', area } : null
}

// Coarse on purpose: the area's coordinates are only ever a fallback for a place that has no
// geocode of its own, and every place from Google has one.
const AREA_RADIUS_M = 15_000

// The id of the area for a draft, creating it the first time a place needs it. Insert-then-select
// rather than select-then-insert: two members adding the same city's first places at once both
// succeed, and exactly one row exists.
export async function ensureArea(draft: AreaDraft): Promise<{ id: string; name: string }> {
  const { neighborhoods } = schema
  await db
    .insert(neighborhoods)
    .values({
      slug: draft.slug,
      name: draft.name,
      city: draft.city,
      countryCode: draft.countryCode,
      lat: draft.lat,
      lng: draft.lng,
      radiusM: AREA_RADIUS_M,
      listed: false,
    })
    .onConflictDoNothing({ target: neighborhoods.slug })
  const row = await db.query.neighborhoods.findFirst({
    where: eq(neighborhoods.slug, draft.slug),
    columns: { id: true, name: true },
  })
  if (!row) throw new Error(`area ${draft.slug} was not created`)
  return row
}
