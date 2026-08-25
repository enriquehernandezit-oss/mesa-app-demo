import { db, schema } from '@mesa/db'
import { and, isNull, sql } from 'drizzle-orm'

const { restaurants } = schema

export type PlaceCandidate = {
  name: string
  lat: number
  lng: number
}

// Haversine in raw SQL (meters) — mirrors apps/app/src/lib/geo.ts's client
// version, since this needs to run inside a WHERE clause, not on fetched rows.
function distanceSql(lat: number, lng: number) {
  return sql`(
    6371000 * acos(least(1, greatest(-1,
      cos(radians(${lat})) * cos(radians(${restaurants.lat})) *
        cos(radians(${restaurants.lng}) - radians(${lng})) +
      sin(radians(${lat})) * sin(radians(${restaurants.lat}))
    )))
  )`
}

// Finds an existing restaurant a candidate is almost certainly the same
// place as, before inserting a new row — so re-typing "Peperoni" becomes one
// row, not two. Name similarity alone isn't enough (two genuinely different
// restaurants can share a generic name — "La Cava" — in different
// neighborhoods), so every rule is distance-gated too. Shared by
// POST /restaurants and (once it exists) the Foursquare importer — see
// docs/LOCATION_CATALOG_PLAN.md M6.
//
// One real imprecision: a member-added candidate's lat/lng is a sector
// CENTROID, not a real geocode (Mesa has no geocoding service) — so a
// same-named restaurant sitting near the edge of a large sector could fall
// outside these radii and go undetected. That's a false negative, not a
// false positive: the worst case is the status quo (no dedup at all), never
// an incorrect merge.
export async function findExistingMatch(candidate: PlaceCandidate) {
  const dist = distanceSql(candidate.lat, candidate.lng)

  // Rule: normalized name equal AND within 250m — adopt.
  const exact = await db.query.restaurants.findFirst({
    where: and(
      isNull(restaurants.removedAt),
      sql`${restaurants.nameKey} = mesa_norm(${candidate.name})`,
      sql`${dist} <= 250`,
    ),
  })
  if (exact) return exact

  // Rule: trigram similarity ≥ 0.55 AND within 150m — adopt.
  return (
    (await db.query.restaurants.findFirst({
      where: and(
        isNull(restaurants.removedAt),
        sql`similarity(${restaurants.nameKey}, mesa_norm(${candidate.name})) >= 0.55`,
        sql`${dist} <= 150`,
      ),
    })) ?? null
  )
}
