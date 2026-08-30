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
// neighborhoods), so every rule is distance-gated too. Used by
// POST /restaurants (one candidate per request). The Foursquare importer
// (packages/db/src/import-foursquare.ts) does NOT call this — it MIRRORS the
// same two thresholds in a pure-TS, spatial-grid implementation, because this
// runs a live query per candidate and the importer's hard rule (CLAUDE.md 3)
// forbids per-row queries at catalog scale. Keep the thresholds in sync.
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

// The dedup for a place coming from Google Place Details (M9). Its coordinates
// are a REAL geocode (not a sector centroid), and Google both varies a place's
// display name between autocomplete and Details AND sometimes carries more than
// one listing for one physical restaurant — so name-based matching alone lets
// the same spot get added twice under "Hard Rock Cafe" and "Hard Rock Cafe
// Santo Domingo". This starts from findExistingMatch (which also promotes a
// seed/member row to Google's exact coords), then adds one rule that only
// makes sense when the coordinates are a trustworthy geocode:
//
//   • within 120m AND one normalized name contains the other (≥5 chars) — the
//     subset-name case Google actually produces. Containment, not loose
//     trigram: "Bruma" ⊂ "Bruma del Malecón" merges, but two genuinely
//     different neighbours ("Pizza Roma" / "Pizza Napoli") never do, because
//     neither name contains the other. The ≥5-char floor keeps a generic token
//     ("Bar", "Café") from matching everything around it.
export async function findGooglePlaceMatch(candidate: PlaceCandidate) {
  const byName = await findExistingMatch(candidate)
  if (byName) return byName

  const dist = distanceSql(candidate.lat, candidate.lng)
  const cand = sql`mesa_norm(${candidate.name})`

  return (
    (await db.query.restaurants.findFirst({
      where: and(
        isNull(restaurants.removedAt),
        sql`${dist} <= 120`,
        sql`least(length(${restaurants.nameKey}), length(${cand})) >= 5`,
        sql`(${restaurants.nameKey} like '%' || ${cand} || '%'
             or ${cand} like '%' || ${restaurants.nameKey} || '%')`,
      ),
    })) ?? null
  )
}
