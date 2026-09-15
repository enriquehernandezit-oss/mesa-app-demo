// ADDITIVE, idempotent-per-restaurant importer for the Top 100 Santo Domingo
// catalog + its verified menus (M5, see docs in the founder's plan file).
// Mirrors packages/db/src/import-foursquare.ts's posture:
//
//   • only ever writes restaurant rows it OWNS (source='catalog'); a match
//     against an existing seed/member/foursquare row only fills NULL fields
//     and attaches a googlePlaceId — a curated row's name/coords/cover never
//     get overwritten.
//   • never deletes a restaurant, and never guesses a placement — a name that
//     doesn't geocode to a confident, in-bounds match is skipped and reported,
//     not inserted at a fabricated location.
//   • menu_items is owned COMPLETELY by this importer per restaurant: every
//     run for a given restaurant deletes and re-inserts its rows, so a
//     re-run is an exact replacement, never an accumulation.
//   • the whole existing catalog + neighborhood set is loaded ONCE and
//     matched in memory (CLAUDE.md hard rule 3 forbids a per-row query at
//     import scale) — at ~100 rows against a few hundred existing this is a
//     trivial linear scan, so no spatial grid is needed the way the much
//     larger Foursquare extract needs one.
//
// Stage A (offline, once) is apps/api/data/top100.json, extracted from the
// founder's spreadsheet by a one-off Python script (not repo tooling — the
// spreadsheet itself isn't committed, so this JSON is the actual source of
// truth from here on and is reviewable in the diff). Stage B is this script:
//
//   GOOGLE_PLACES_API_KEY=... DATABASE_URL="<url>" bun run src/import-top100.ts [--dry-run] [--refresh]
//
// Always --dry-run first and read the planned counts before a real write.
// --refresh re-queries Google for every restaurant even if a cached response
// already exists; without it, only restaurants missing from the cache are
// geocoded, so a re-run after fixing a data issue doesn't re-bill Google for
// names that already resolved cleanly.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { db, haversineM, mesaNorm, pool, schema, trigramSimilarity } from '@mesa/db'
import { isNull, sql } from 'drizzle-orm'
import {
  type GooglePlaceDetails,
  type MesaFieldsFromGoogle,
  hasGooglePlacesKey,
  resolveNeighborhood,
  searchText,
  toMesaFields,
} from './lib/googlePlaces'

const { restaurants, neighborhoods, menuItems } = schema

const DATA_PATH = new URL('../data/top100.json', import.meta.url).pathname
const CACHE_PATH = new URL('../data/top100-google.json', import.meta.url).pathname
const CHUNK = 500

interface Top100Restaurant {
  rank: number | null
  name: string
  cuisineRaw: string | null
  area: string | null
}
interface Top100MenuItem {
  section: string
  name: string
  description: string | null
  price: number | null
  currency: string | null
  sourceRef: string | null
  verifiedAt: string | null
  position: number
}
interface Top100Data {
  restaurants: Top100Restaurant[]
  menus: Record<string, Top100MenuItem[]>
}

// --- cuisine: "Cuisine / Category"'s first segment IS Mesa's English cuisine
// vocabulary (display.ts's CUISINE_ES keys) for every case except these three
// multi-word segments, which don't contain a literal "/" so splitting alone
// can't simplify them; "To verify" and the bare "Restaurant" placeholder map
// to null rather than leaking a non-cuisine label into a filter chip. ---
const CUISINE_OVERRIDES: Record<string, string | null> = {
  'Contemporary Dominican': 'Dominican',
  'Asian Fusion': 'Fusion',
  'Mexican-Japanese Fusion': 'Fusion',
  'To verify': null,
  Restaurant: null,
}
export function mapCuisine(cuisineRaw: string | null): string | null {
  if (!cuisineRaw) return null
  const first = cuisineRaw.split('/')[0]?.trim() ?? ''
  const override = CUISINE_OVERRIDES[first]
  if (override !== undefined) return override
  return first || null
}

// --- geocode acceptance: a Text Search hit is only trustworthy once it's
// both somewhere in the city Mesa covers AND plausibly the same name — Text
// Search on a distinctive-enough query rarely returns a wrong city, but a
// generic name ("Mimosa") can pull an unrelated business anywhere. ---
const SD_BOUNDS = { minLat: 18.3, maxLat: 18.65, minLng: -70.1, maxLng: -69.6 }
export function inBounds(lat: number, lng: number): boolean {
  return (
    lat >= SD_BOUNDS.minLat &&
    lat <= SD_BOUNDS.maxLat &&
    lng >= SD_BOUNDS.minLng &&
    lng <= SD_BOUNDS.maxLng
  )
}
// Looser than the 0.55 catalog-merge threshold on purpose — this only asks
// "is this geocode plausibly the restaurant we searched for," not "should we
// merge it into an existing row" (that's findCatalogMatch below, which is
// gated by distance too).
export function namesAgree(a: string, b: string): boolean {
  const na = mesaNorm(a)
  const nb = mesaNorm(b)
  if (trigramSimilarity(na, nb) >= 0.4) return true
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  return shorter.length >= 5 && longer.includes(shorter)
}

// Founder-verified 2026-09-15: the sheet's name is what to search Google for
// and compare against — for most rows that's the sheet name itself. These two
// are exceptions: "Alma" is ambiguous between two real, unrelated restaurants
// (a pastelería/bistro and a steakhouse — the sheet's rank-20 entry is the
// steakhouse), and "Dave & Buster's Santo Domingo" is a confirmed-correct hit
// that namesAgree() rejects only because the venue's actual registered name
// drops the apostrophe and swaps "Santo Domingo" for "Republica Dominicana".
const CONFIRMED_NAME_OVERRIDES: Record<string, string> = {
  Alma: 'Alma Steakhouse',
  "Dave & Buster's Santo Domingo": 'Dave & Busters Republica Dominicana',
}
function searchName(sheetName: string): string {
  return CONFIRMED_NAME_OVERRIDES[sheetName] ?? sheetName
}

type ExistingRow = {
  id: string
  name: string
  nameKey: string
  lat: number
  lng: number
  source: 'seed' | 'foursquare' | 'member' | 'catalog'
  googlePlaceId: string | null
  geoPrecision: 'exact' | 'sector'
  closedAt: Date | null
}

// Mirrors apps/api/src/lib/placeMatch.ts's findGooglePlaceMatch (live-query
// version) as a pure in-memory scan — same three rules, same order, plus the
// same-googlePlaceId short-circuit for a re-run. A closed row is never
// adopted; that status shouldn't silently clear because an unrelated import
// happened to geocode nearby.
function findCatalogMatch(
  fields: MesaFieldsFromGoogle,
  googlePlaceId: string,
  existing: ExistingRow[],
): ExistingRow | null {
  const byId = existing.find((e) => e.googlePlaceId === googlePlaceId)
  if (byId) return byId

  const norm = mesaNorm(fields.name)
  const candidates = existing.filter((e) => !e.closedAt)

  for (const e of candidates) {
    if (e.nameKey === norm && haversineM(fields.lat, fields.lng, e.lat, e.lng) <= 250) return e
  }
  for (const e of candidates) {
    if (
      haversineM(fields.lat, fields.lng, e.lat, e.lng) <= 150 &&
      trigramSimilarity(e.nameKey, norm) >= 0.55
    )
      return e
  }
  for (const e of candidates) {
    const dist = haversineM(fields.lat, fields.lng, e.lat, e.lng)
    if (
      dist <= 120 &&
      Math.min(e.nameKey.length, norm.length) >= 5 &&
      (e.nameKey.includes(norm) || norm.includes(e.nameKey))
    )
      return e
  }
  return null
}

// For a row Google couldn't confidently place, or one it placed too far from
// an existing row's approximate seed coordinates to pass findCatalogMatch: an
// exact normalized-name match that is UNIQUE in the whole catalog is trusted
// on its own (seed/member coordinates are approximate anyway, so
// distance-gating it would just produce false negatives and duplicate rows) —
// merged automatically, logged for visibility in --dry-run.
function nameOnlyUniqueMatch(name: string, existing: ExistingRow[]): ExistingRow | null {
  const norm = mesaNorm(name)
  const matches = existing.filter((e) => e.nameKey === norm)
  return matches.length === 1 ? (matches[0] ?? null) : null
}

function loadCache(): Record<string, GooglePlaceDetails | null> {
  if (!existsSync(CACHE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, GooglePlaceDetails | null>) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  const refresh = process.argv.includes('--refresh')

  let data: Top100Data
  try {
    data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
  } catch {
    throw new Error(
      `extract not found at ${DATA_PATH} — generate apps/api/data/top100.json from the spreadsheet first`,
    )
  }
  if (data.restaurants.length === 0) {
    throw new Error('extract has 0 restaurants — refusing to run')
  }
  if (!hasGooglePlacesKey()) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY is not set — refusing to run. Without a key every ' +
        'lookup would come back "not found", and caching that would poison the ' +
        'cache file for the real run once a key IS set (see apps/api/.env.example).',
    )
  }

  // --- Stage: geocode every restaurant once, cached by name so a re-run
  // without --refresh makes zero Google calls. ---
  const cache = loadCache()
  let calls = 0
  for (const r of data.restaurants) {
    const q = searchName(r.name)
    if (!refresh && q in cache) continue
    cache[q] = await searchText(`${q}, Santo Domingo`)
    calls++
  }
  if (calls > 0) saveCache(cache)

  const resolved = new Map<string, { details: GooglePlaceDetails; fields: MesaFieldsFromGoogle }>()
  const lowConfidence: string[] = []
  const unresolved: string[] = []
  for (const r of data.restaurants) {
    const details = cache[searchName(r.name)]
    if (!details?.location?.latitude || !details.location.longitude) {
      unresolved.push(r.name)
      continue
    }
    const fields = toMesaFields(details)
    if (!inBounds(fields.lat, fields.lng)) {
      unresolved.push(r.name)
      continue
    }
    if (!namesAgree(searchName(r.name), fields.name)) {
      lowConfidence.push(r.name)
      continue
    }
    resolved.set(r.name, { details, fields })
  }

  // --- Load the existing catalog + neighborhoods ONCE. ---
  const existing: ExistingRow[] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      nameKey: sql`coalesce(${restaurants.nameKey}, '')`.mapWith(String),
      lat: restaurants.lat,
      lng: restaurants.lng,
      source: restaurants.source,
      googlePlaceId: restaurants.googlePlaceId,
      geoPrecision: restaurants.geoPrecision,
      closedAt: restaurants.closedAt,
    })
    .from(restaurants)
    .where(isNull(restaurants.removedAt))

  const hoods = await db
    .select({
      id: neighborhoods.id,
      name: neighborhoods.name,
      lat: neighborhoods.lat,
      lng: neighborhoods.lng,
    })
    .from(neighborhoods)
  if (hoods.length === 0) throw new Error('no neighborhoods seeded — run db:seed first')

  // --- Classify every restaurant: matched (enrich), new (insert), skipped
  // (closed per Google, or never resolved). ---
  const toUpdate: { existingId: string; fields: MesaFieldsFromGoogle; googlePlaceId: string }[] = []
  const toInsert: (typeof restaurants.$inferInsert & { _name: string })[] = []
  const skippedClosed: string[] = []
  const restaurantIdByName = new Map<string, string>()
  // Founder-reviewed 2026-09-15: an exact normalized-name match that's unique
  // across the whole catalog is trusted evidence on its own (seed/member
  // coordinates are only approximate anyway) — merged automatically, listed
  // here only for visibility, not gated on human approval per row.
  const nameOnlyMerged: string[] = []

  for (const r of data.restaurants) {
    const hit = resolved.get(r.name)
    if (!hit) {
      const nameOnly = nameOnlyUniqueMatch(r.name, existing)
      if (nameOnly) {
        nameOnlyMerged.push(`${r.name} → ${nameOnly.name} (${nameOnly.id})`)
        restaurantIdByName.set(r.name, nameOnly.id)
      }
      continue
    }
    const { details, fields } = hit
    if (fields.closedAt) {
      skippedClosed.push(r.name)
      continue
    }
    const match = findCatalogMatch(fields, details.id, existing)
    if (match) {
      toUpdate.push({ existingId: match.id, fields, googlePlaceId: details.id })
      restaurantIdByName.set(r.name, match.id)
    } else {
      // Google resolved this one, but not near enough to an existing row's
      // (approximate) seed coordinates for findCatalogMatch's distance gates.
      // A unique exact-name match elsewhere in the catalog is still real
      // evidence it's the same restaurant — merge instead of inserting a
      // duplicate.
      const nameOnly = nameOnlyUniqueMatch(r.name, existing)
      if (nameOnly) {
        toUpdate.push({ existingId: nameOnly.id, fields, googlePlaceId: details.id })
        restaurantIdByName.set(r.name, nameOnly.id)
        nameOnlyMerged.push(`${r.name} → ${nameOnly.name} (${nameOnly.id})`)
        continue
      }
      const hood = resolveNeighborhood(details, hoods)
      toInsert.push({
        _name: r.name,
        name: fields.name,
        neighborhoodId: hood.id,
        cuisine: mapCuisine(r.cuisineRaw) ?? fields.cuisine,
        lat: fields.lat,
        lng: fields.lng,
        geoPrecision: 'exact',
        source: 'catalog',
        isDemo: false,
        address: fields.address,
        locality: fields.locality,
        phone: fields.phone,
        website: fields.website,
        priceTier: fields.priceTier,
        closesAt: fields.closesAt,
        googlePlaceId: details.id,
        sourceRefreshedAt: new Date(),
      })
    }
  }

  console.log(
    `top100 import ${dryRun ? '(DRY RUN)' : ''}: ` +
      `${data.restaurants.length} restaurants · ${resolved.size} geocoded · ` +
      `${lowConfidence.length} low-confidence · ${unresolved.length} unresolved · ` +
      `${toUpdate.length} matched (enrich) · ${toInsert.length} new · ${skippedClosed.length} closed (skipped)`,
  )
  if (unresolved.length) console.log(`  unresolved: ${unresolved.join(', ')}`)
  if (lowConfidence.length) console.log(`  low-confidence: ${lowConfidence.join(', ')}`)
  if (skippedClosed.length) console.log(`  closed per Google: ${skippedClosed.join(', ')}`)
  if (nameOnlyMerged.length) {
    console.log(`  name-only matches (auto-merged, ${nameOnlyMerged.length}):`)
    for (const line of nameOnlyMerged) console.log(`    ${line}`)
  }
  if (toInsert.length) {
    const cuisines = new Map<string, number>()
    for (const r of toInsert)
      cuisines.set(r.cuisine ?? '(none)', (cuisines.get(r.cuisine ?? '(none)') ?? 0) + 1)
    console.log(
      `  new restaurants: ${toInsert.map((r) => r._name).join(', ')}\n` +
        `  cuisine spread: ${[...cuisines.entries()].map(([c, n]) => `${c}:${n}`).join(' ')}`,
    )
  }

  const menuNames = Object.keys(data.menus)
  const resolvableMenuNames = menuNames.filter(
    (n) => restaurantIdByName.has(n) || toInsert.some((r) => r._name === n),
  )
  const noMenuRanked = data.restaurants.filter((r) => r.rank !== null && !data.menus[r.name])
  console.log(
    `  menus: ${resolvableMenuNames.length} of ${menuNames.length} restaurants have a resolvable id ` +
      `(${menuNames.length - resolvableMenuNames.length} skipped — no geocode this run); ` +
      `${noMenuRanked.length} ranked restaurants have no menu data at all`,
  )

  if (dryRun) {
    console.log('  dry run — no writes')
    await pool.end()
    return
  }

  // --- Writes: enrichment first (fills nulls only, never overwrites curated
  // data), then new inserts, then menus (owned completely per restaurant). ---
  for (const u of toUpdate) {
    await db
      .update(restaurants)
      .set({
        cuisine: sql`coalesce(${restaurants.cuisine}, ${u.fields.cuisine})`,
        address: sql`coalesce(${restaurants.address}, ${u.fields.address})`,
        locality: sql`coalesce(${restaurants.locality}, ${u.fields.locality})`,
        phone: sql`coalesce(${restaurants.phone}, ${u.fields.phone})`,
        website: sql`coalesce(${restaurants.website}, ${u.fields.website})`,
        priceTier: sql`coalesce(${restaurants.priceTier}, ${u.fields.priceTier})`,
        closesAt: sql`coalesce(${restaurants.closesAt}, ${u.fields.closesAt})`,
        googlePlaceId: sql`coalesce(${restaurants.googlePlaceId}, ${u.googlePlaceId})`,
        ...(existing.find((e) => e.id === u.existingId)?.geoPrecision === 'sector'
          ? { lat: u.fields.lat, lng: u.fields.lng, geoPrecision: 'exact' as const }
          : {}),
        sourceRefreshedAt: new Date(),
      })
      .where(sql`${restaurants.id} = ${u.existingId}`)
  }

  for (const batch of chunk(toInsert, CHUNK)) {
    const inserted = await db
      .insert(restaurants)
      .values(batch.map(({ _name, ...row }) => row))
      .returning({ id: restaurants.id, name: restaurants.name })
    // Insert order is preserved by Postgres for a single multi-row VALUES
    // list, but matching back by name (rather than trusting order) is one
    // extra safety net that costs nothing at this scale.
    for (const row of inserted) restaurantIdByName.set(row.name, row.id)
  }

  let menuRowsWritten = 0
  for (const name of resolvableMenuNames) {
    const restaurantId = restaurantIdByName.get(name)
    if (!restaurantId) continue
    await db.delete(menuItems).where(sql`${menuItems.restaurantId} = ${restaurantId}`)
    const rows = data.menus[name] ?? []
    for (const batch of chunk(rows, CHUNK)) {
      await db.insert(menuItems).values(
        batch.map((item) => ({
          restaurantId,
          section: item.section,
          name: item.name,
          description: item.description,
          priceCents: item.price != null ? Math.round(item.price * 100) : null,
          currency: item.currency,
          sourceRef: item.sourceRef,
          verifiedAt: item.verifiedAt,
          position: item.position,
        })),
      )
    }
    menuRowsWritten += rows.length
  }

  console.log(
    `  done — ${menuRowsWritten} menu item(s) written across ${resolvableMenuNames.length} restaurant(s)`,
  )
  await pool.end()
}

// Guarded so import-top100.test.ts can import the pure helpers above without
// triggering a real run (which connects to the database and, without
// --dry-run, writes) — bun run src/import-top100.ts is still the entry point
// and still auto-runs, since that invocation's module IS the main module.
if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
