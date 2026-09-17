// One-off, additive, idempotent discovery script: find Italian (and pizza)
// restaurants in Santo Domingo via Google Places Text Search and add every
// one not already in Mesa's catalog. Unlike import-top100.ts, which enriches
// a KNOWN list of names from the founder's spreadsheet, this DISCOVERS new
// ones — several differently-worded, neighborhood-scoped queries (Text
// Search's own relevance ranking means one generic query mostly returns the
// same well-known dozen places; scoping by neighborhood surfaces the
// smaller/newer ones a global query buries past its top-20 results).
//
// Matching against the existing catalog reuses import-top100.ts's own
// findCatalogMatch/nameOnlyUniqueMatch (imported, not reimplemented) — the
// two scripts must never drift on what counts as "already have this one," or
// one of them starts producing duplicate rows.
//
//   GOOGLE_PLACES_API_KEY=... DATABASE_URL="<url>" bun run src/discover-italian.ts [--dry-run]
//
// Always --dry-run first and read the planned list before a real write.
// Idempotent: a re-run finds the same restaurants already inserted last time
// via findCatalogMatch's googlePlaceId short-circuit, so nothing duplicates.
import { db, mesaNorm, pool, schema } from '@mesa/db'
import { isNull, sql } from 'drizzle-orm'
import { type ExistingRow, findCatalogMatch, inBounds, nameOnlyUniqueMatch } from './import-top100'
import {
  type GooglePlaceDetails,
  hasGooglePlacesKey,
  resolveNeighborhood,
  searchTextMany,
  toMesaFields,
} from './lib/googlePlaces'

const { restaurants, neighborhoods } = schema
const CHUNK = 500

// Spread across the metro's neighborhoods rather than one broad query, for
// the reason in the header comment above.
const QUERIES = [
  'restaurantes italianos en Santo Domingo',
  'ristorante italiano Santo Domingo',
  'pizzeria Santo Domingo',
  'trattoria Santo Domingo',
  'comida italiana Piantini Santo Domingo',
  'comida italiana Naco Santo Domingo',
  'comida italiana Bella Vista Santo Domingo',
  'comida italiana Zona Colonial Santo Domingo',
  'comida italiana Gazcue Santo Domingo',
  'comida italiana Serrallés Santo Domingo',
  'comida italiana Evaristo Morales Santo Domingo',
  'comida italiana Los Cacicazgos Santo Domingo',
  'pasta Santo Domingo restaurante',
]

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  if (!hasGooglePlacesKey()) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY is not set — refusing to run (every lookup would come back empty).',
    )
  }

  // --- Discover: run every query, collect unique places by Google place id. ---
  const byPlaceId = new Map<string, GooglePlaceDetails>()
  let queryCalls = 0
  for (const q of QUERIES) {
    const places = await searchTextMany(q)
    queryCalls++
    for (const p of places) if (p.id) byPlaceId.set(p.id, p)
  }

  // --- Filter to genuinely Italian/pizza hits, in-bounds, not permanently
  // closed. Google's own type is trusted when it names a SPECIFIC cuisine —
  // if that's some other one (Mexican, Japanese, ...), this is a real
  // conflict, reject. But Google very often falls back to the generic
  // `restaurant` type even for obviously Italian places ("Casa Luca",
  // "Franco Ristorante Pizzeria", "Sapori D'Italia" all measured this way) —
  // an unclassified result isn't evidence of NOT being Italian, so it falls
  // back to the name itself: every query here already specifically asked
  // for Italian food, so a recognizable Italian word in the name is real
  // corroborating evidence Google's type field just didn't capture. ---
  const ITALIAN_NAME_HINTS = [
    'trattoria',
    'ristorante',
    'pizzeria',
    'pizzería',
    'osteria',
    'cucina',
    'pasta',
    'pizza',
    'italia',
    'italian',
    'gelato',
    'gelateria',
    'nonna',
    'bottega',
    'forno',
    'mozzarella',
    'parmigiana',
    'lasagna',
    'lasaña',
    'spaghetti',
    'tagliatelle',
    'risotto',
    'enoteca',
    'bruschetta',
    'fratelli',
    'napoletano',
    'napoli',
    'sicilia',
  ]
  function looksItalianByName(name: string): boolean {
    const norm = name.toLowerCase()
    return ITALIAN_NAME_HINTS.some((hint) => norm.includes(hint))
  }

  const candidates: { details: GooglePlaceDetails; fields: ReturnType<typeof toMesaFields> }[] = []
  const rejectedCuisine: string[] = []
  const rejectedBounds: string[] = []
  const rejectedClosed: string[] = []
  for (const details of byPlaceId.values()) {
    const fields = toMesaFields(details)
    if (!fields.name || !details.location?.latitude || !details.location?.longitude) continue
    if (fields.closedAt) {
      rejectedClosed.push(fields.name)
      continue
    }
    if (!inBounds(fields.lat, fields.lng)) {
      rejectedBounds.push(fields.name)
      continue
    }
    const conflictingCuisine =
      fields.cuisine && fields.cuisine !== 'Italian' && fields.cuisine !== 'Pizza'
    const unclassifiedAndUnnamed = !fields.cuisine && !looksItalianByName(fields.name)
    if (conflictingCuisine || unclassifiedAndUnnamed) {
      rejectedCuisine.push(`${fields.name} (${details.primaryType ?? 'unknown type'})`)
      continue
    }
    candidates.push({ details, fields })
  }

  // --- Load the existing catalog + neighborhoods ONCE (never a per-row
  // query — CLAUDE.md hard rule 3). ---
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

  // --- Classify: already-in-catalog (skip) vs genuinely new (insert).
  // `seenNew` grows as candidates are accepted, and is checked right
  // alongside the real catalog — Google itself sometimes has two listings
  // for the same physical restaurant (two place ids, "Trattoria Pizzarelli"
  // found this way), and without this a query set spanning several
  // differently-worded searches would insert it twice. ---
  const alreadyHave: string[] = []
  const toInsert: (typeof restaurants.$inferInsert & { _name: string })[] = []
  const seenNew: ExistingRow[] = []
  for (const { details, fields } of candidates) {
    const matchPool = [...existing, ...seenNew]
    const match =
      findCatalogMatch(fields, details.id, matchPool) ?? nameOnlyUniqueMatch(fields.name, matchPool)
    if (match) {
      alreadyHave.push(`${fields.name} → already have "${match.name}"`)
      continue
    }
    const hood = resolveNeighborhood(details, hoods)
    seenNew.push({
      id: `pending:${details.id}`,
      name: fields.name,
      nameKey: mesaNorm(fields.name),
      lat: fields.lat,
      lng: fields.lng,
      source: 'catalog',
      googlePlaceId: details.id,
      geoPrecision: 'exact',
      closedAt: null,
    })
    toInsert.push({
      _name: fields.name,
      name: fields.name,
      neighborhoodId: hood.id,
      cuisine: fields.cuisine,
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

  console.log(
    `discover-italian ${dryRun ? '(DRY RUN)' : ''}: ` +
      `${QUERIES.length} queries · ${byPlaceId.size} unique places found · ` +
      `${rejectedCuisine.length} not Italian/Pizza · ${rejectedBounds.length} out of bounds · ` +
      `${rejectedClosed.length} closed per Google · ` +
      `${candidates.length} candidates · ${alreadyHave.length} already in catalog · ` +
      `${toInsert.length} new`,
  )
  if (alreadyHave.length) {
    console.log(`  already in catalog (${alreadyHave.length}):`)
    for (const line of alreadyHave.sort()) console.log(`    ${line}`)
  }
  if (toInsert.length) {
    console.log(`  new restaurants (${toInsert.length}):`)
    for (const r of [...toInsert].sort((a, b) => a._name.localeCompare(b._name))) {
      console.log(`    ${r._name} — ${r.cuisine} — ${r.address ?? 'no address'}`)
    }
  }
  if (rejectedCuisine.length) {
    console.log(`  rejected, not Italian/Pizza per Google's own type (${rejectedCuisine.length}):`)
    for (const line of rejectedCuisine.sort()) console.log(`    ${line}`)
  }

  if (dryRun) {
    console.log('  dry run — no writes')
    await pool.end()
    return
  }

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const batch = toInsert.slice(i, i + CHUNK)
    if (batch.length === 0) continue
    await db.insert(restaurants).values(batch.map(({ _name, ...row }) => row))
  }

  console.log(
    `  done — ${toInsert.length} restaurant(s) inserted (${queryCalls} Google queries run)`,
  )
  await pool.end()
}

if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
