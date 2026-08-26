import { readFileSync } from 'node:fs'
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm'
import { db, pool } from './client'
import * as schema from './schema'

// ADDITIVE, idempotent bulk importer for Foursquare OS Places restaurant rows
// (see docs/LOCATION_CATALOG_PLAN.md M6). Same safety posture as
// seed-add-restaurants.ts — never TRUNCATEs, safe to re-run — but it merges a
// real external catalog, so the rules are stricter:
//
//   • only ever writes rows it OWNS (source='foursquare'); a match against a
//     seed/member row only attaches an fsq_place_id, never overwrites curated
//     data (name/coords/cover stay).
//   • never deletes: a place missing from a later extract is marked closed_at,
//     not removed — it may already be ranked.
//   • no per-row query (CLAUDE.md hard rule 3): the whole existing catalog is
//     loaded once and bucketed into an in-memory spatial grid, so dedup is O(n)
//     in TS. This mirrors apps/api/src/lib/placeMatch.ts's two thresholds
//     (exact-name ≤250m, trigram ≥0.55 ≤150m) but reimplements them in-process
//     rather than calling it — that function does one live query per candidate,
//     which is exactly what this rule forbids at import scale.
//
//   Stage A (offline, once) produces packages/db/data/foursquare-do.ndjson via
//   DuckDB over the Foursquare HuggingFace mirror. Stage B is this script:
//     DATABASE_URL="<url>" bun run src/import-foursquare.ts [--dry-run] [--skip-reconcile]
//   Always --dry-run first and read the planned counts before a real write.

const { restaurants, neighborhoods } = schema

const NDJSON_PATH = new URL('../data/foursquare-do.ndjson', import.meta.url).pathname
const CHUNK = 500

// One shape per NDJSON line — exactly the columns Stage A's DuckDB COPY emits.
interface FsqRow {
  fsq_place_id: string
  name: string
  latitude: number
  longitude: number
  address: string | null
  locality: string | null
  tel: string | null
  website: string | null
  date_refreshed: string | null
  // Foursquare emits an array; Stage A keeps the most specific label first.
  fsq_category_labels: string[] | null
}

type ExistingRow = {
  id: string
  name: string
  nameKey: string
  lat: number
  lng: number
  source: 'seed' | 'foursquare' | 'member'
  fsqPlaceId: string | null
  closedAt: Date | null
}

type NeighborhoodRow = { id: string; lat: number; lng: number }

// --- geo (meters). Haversine, mirroring apps/app/src/lib/geo.ts — this package
// can't import from apps/app, so the formula lives here too. ---
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// --- name normalization — mirrors mesa_norm() (migration 0008): lower + strip
// accents. unaccent and Unicode-NFD agree on the Spanish diacritics that appear
// in DR restaurant names (á é í ó ú ñ ü). ---
function mesaNorm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

// --- pg_trgm similarity() faithfully — Jaccard over the two trigram SETS. The
// exact algorithm matters, verified against show_trgm(): pg_trgm splits on every
// non-alphanumeric char, pads EACH word with two leading + one trailing space,
// generates that word's trigrams, and unions (dedups) across words — it does NOT
// pad the whole string once (that would invent cross-word trigrams and mishandle
// a repeated word, e.g. "boga boga" must score 1.0 against "boga", not 0.83).
// Inputs here are already mesa_norm'd (lowercased, accent-stripped), matching the
// live matcher's `similarity(name_key, mesa_norm(...))`, so the 0.55 threshold
// means the same thing on both sides. ---
function trigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (const word of s.split(/[^a-z0-9]+/)) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}
function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

// --- spatial grid. 300m cells at SD's latitude — larger than the 250m match
// radius, so a match never spans more than one cell boundary; check the
// candidate's cell + its 8 neighbors. One fixed reference latitude (cos varies
// <0.5% across the metro band). ---
const REF_LAT = 18.47
const CELL_M = 300
const LAT_PER_CELL = CELL_M / 111320
const LNG_PER_CELL = CELL_M / (111320 * Math.cos((REF_LAT * Math.PI) / 180))
function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / LAT_PER_CELL)}|${Math.floor(lng / LNG_PER_CELL)}`
}
function neighborKeys(lat: number, lng: number): string[] {
  const gy = Math.floor(lat / LAT_PER_CELL)
  const gx = Math.floor(lng / LNG_PER_CELL)
  const keys: string[] = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) keys.push(`${gy + dy}|${gx + dx}`)
  return keys
}

// --- cuisine: Foursquare leaf label → Mesa's English cuisine vocabulary
// (apps/app/src/lib/display.ts's CUISINE_ES keys). Unmapped → null, never the
// raw label — cuisineLabel() passes unknowns through verbatim, which would leak
// English into the Spanish UI. This table is curated from the real --dry-run
// distinct-leaf list; extend it (and CUISINE_ES) once that list is known. ---
const FSQ_TO_MESA_CUISINE: Record<string, string> = {
  Italian: 'Italian',
  Pizza: 'Pizza',
  Pizzeria: 'Pizza',
  Spanish: 'Spanish',
  Basque: 'Basque',
  Peruvian: 'Peruvian',
  Dominican: 'Dominican',
  Caribbean: 'Dominican',
  Steakhouse: 'Steakhouse',
  Mediterranean: 'Mediterranean',
  Japanese: 'Japanese',
  Sushi: 'Japanese',
  Mexican: 'Mexican',
  Chinese: 'Chinese',
  Thai: 'Thai',
  Seafood: 'Seafood',
  Sandwich: 'Sandwiches',
  Sandwiches: 'Sandwiches',
  Wine: 'Wine Bar',
  Café: 'Café',
  Cafe: 'Café',
  Coffee: 'Café',
}
function mapCuisine(labels: string[] | null): string | null {
  if (!labels || labels.length === 0) return null
  // Most-specific label first; take its leaf term minus a trailing type word.
  const leaf = (labels[0] ?? '').split('>').pop()?.trim() ?? ''
  const key = leaf.replace(/\s+(Restaurant|Joint|Bar|Place|Shop|Spot)$/i, '').trim()
  return FSQ_TO_MESA_CUISINE[key] ?? null
}

// Caller guarantees hoods is non-empty (asserted right after the query).
function nearestNeighborhoodId(lat: number, lng: number, hoods: NeighborhoodRow[]): string {
  let bestId: string | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const h of hoods) {
    const d = haversineM(lat, lng, h.lat, h.lng)
    if (d < bestDist) {
      bestDist = d
      bestId = h.id
    }
  }
  if (bestId === null) throw new Error('no neighborhoods to assign — unreachable')
  return bestId
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  const skipReconcile = process.argv.includes('--skip-reconcile')

  // --- parse the extract ---
  let raw: string
  try {
    raw = readFileSync(NDJSON_PATH, 'utf8')
  } catch {
    throw new Error(
      `extract not found at ${NDJSON_PATH} — run Stage A (see docs/LOCATION_CATALOG_PLAN.md M6) first`,
    )
  }
  const fsqRows: FsqRow[] = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FsqRow)
    .filter(
      (r) =>
        r.fsq_place_id && r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
    )

  if (fsqRows.length === 0) {
    throw new Error(
      'extract parsed to 0 usable rows — refusing to run (would close the whole catalog)',
    )
  }

  // --- load the existing catalog once + bucket it ---
  const existing: ExistingRow[] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      // Generated column, typed nullable — but it's mesa_norm(name) and name is
      // NOT NULL, so it's always present. Coalesce to satisfy the type.
      nameKey: sql<string>`coalesce(${restaurants.nameKey}, '')`,
      lat: restaurants.lat,
      lng: restaurants.lng,
      source: restaurants.source,
      fsqPlaceId: restaurants.fsqPlaceId,
      closedAt: restaurants.closedAt,
    })
    .from(restaurants)
    .where(isNull(restaurants.removedAt))

  const byFsqId = new Map<string, ExistingRow>()
  const grid = new Map<string, ExistingRow[]>()
  for (const r of existing) {
    if (r.fsqPlaceId) byFsqId.set(r.fsqPlaceId, r)
    const key = cellKey(r.lat, r.lng)
    const bucket = grid.get(key)
    if (bucket) bucket.push(r)
    else grid.set(key, [r])
  }

  const hoods: NeighborhoodRow[] = await db
    .select({ id: neighborhoods.id, lat: neighborhoods.lat, lng: neighborhoods.lng })
    .from(neighborhoods)
  if (hoods.length === 0) throw new Error('no neighborhoods seeded — run db:seed first')

  // --- classify every Foursquare row ---
  const toInsert: (typeof restaurants.$inferInsert)[] = []
  const toUpdateOwned: FsqRow[] = [] // already ours by fsq_place_id → bulk upsert
  const toAdopt: { existingId: string; fsqId: string }[] = [] // matched a seed/member row
  const claimed = new Set<string>() // existing ids adopted this run (prevents double-claim)
  const seenFsqIds = new Set<string>()

  for (const f of fsqRows) {
    if (seenFsqIds.has(f.fsq_place_id)) continue // dupe line in the extract
    seenFsqIds.add(f.fsq_place_id)

    // Rule 1: we already own this fsq_place_id → refresh it via the bulk upsert.
    if (byFsqId.has(f.fsq_place_id)) {
      toUpdateOwned.push(f)
      continue
    }

    // Rules 2/3: fuzzy-match a seed/member row in the candidate's grid cells.
    const norm = mesaNorm(f.name)
    let adopted: ExistingRow | null = null
    const candidates: ExistingRow[] = []
    for (const key of neighborKeys(f.latitude, f.longitude)) {
      const bucket = grid.get(key)
      if (bucket) candidates.push(...bucket)
    }
    for (const c of candidates) {
      if (claimed.has(c.id)) continue
      // Never re-touch a row another fsq_place_id already owns — only exact
      // rule-1 id equality (above) may update a foursquare-owned row.
      if (c.source !== 'seed' && c.source !== 'member') continue
      const dist = haversineM(f.latitude, f.longitude, c.lat, c.lng)
      // Rule 2: normalized name equal AND ≤250m.
      if (c.nameKey === norm && dist <= 250) {
        adopted = c
        break
      }
      // Rule 3: trigram similarity ≥0.55 AND ≤150m.
      if (dist <= 150 && trigramSimilarity(c.nameKey, norm) >= 0.55) {
        adopted = c
        break
      }
    }
    if (adopted) {
      claimed.add(adopted.id)
      toAdopt.push({ existingId: adopted.id, fsqId: f.fsq_place_id })
      continue
    }

    // Rule 4: brand-new row.
    toInsert.push({
      name: f.name,
      neighborhoodId: nearestNeighborhoodId(f.latitude, f.longitude, hoods),
      cuisine: mapCuisine(f.fsq_category_labels),
      lat: f.latitude,
      lng: f.longitude,
      geoPrecision: 'exact',
      source: 'foursquare',
      address: f.address,
      locality: f.locality,
      phone: f.tel,
      website: f.website,
      fsqPlaceId: f.fsq_place_id,
      sourceRefreshedAt: f.date_refreshed ? new Date(f.date_refreshed) : new Date(),
    })
  }

  // --- reconciliation preview: owned rows missing from this extract → close ---
  const closeRows = await db
    .select({ closeCount: sql<number>`count(*)::int` })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.source, 'foursquare'),
        isNull(restaurants.closedAt),
        notInArray(restaurants.fsqPlaceId, [...seenFsqIds]),
      ),
    )
  const closeCount = closeRows[0]?.closeCount ?? 0

  console.log(
    `foursquare import ${dryRun ? '(DRY RUN)' : ''}: ` +
      `${fsqRows.length} extract rows · ` +
      `${toInsert.length} insert · ${toUpdateOwned.length} refresh · ` +
      `${toAdopt.length} adopt · ${closeCount} close` +
      `${skipReconcile ? ' (reconcile skipped)' : ''}`,
  )
  if (toInsert.length) {
    console.log(
      `  sample new: ${toInsert
        .slice(0, 8)
        .map((r) => r.name)
        .join(', ')}`,
    )
    const cuisines = new Map<string, number>()
    for (const r of toInsert) {
      const c = r.cuisine ?? '(unmapped→null)'
      cuisines.set(c, (cuisines.get(c) ?? 0) + 1)
    }
    console.log(
      `  cuisine spread: ${[...cuisines.entries()].map(([c, n]) => `${c}:${n}`).join(' ')}`,
    )
  }

  if (dryRun) {
    console.log('  dry run — no writes')
    await pool.end()
    return
  }

  // --- writes ---
  // Inserts + owned-refreshes go through one chunked upsert keyed on the partial
  // unique index. setWhere guards it to foursquare-owned rows, so an fsq_place_id
  // that somehow collided with a seed/member row (it shouldn't — adopt handles
  // those) is silently left untouched rather than overwritten.
  const upsertRows: (typeof restaurants.$inferInsert)[] = [
    ...toInsert,
    ...toUpdateOwned.map((f) => ({
      name: f.name,
      neighborhoodId: nearestNeighborhoodId(f.latitude, f.longitude, hoods),
      cuisine: mapCuisine(f.fsq_category_labels),
      lat: f.latitude,
      lng: f.longitude,
      geoPrecision: 'exact' as const,
      source: 'foursquare' as const,
      address: f.address,
      locality: f.locality,
      phone: f.tel,
      website: f.website,
      fsqPlaceId: f.fsq_place_id,
      sourceRefreshedAt: f.date_refreshed ? new Date(f.date_refreshed) : new Date(),
    })),
  ]
  for (const batch of chunk(upsertRows, CHUNK)) {
    await db
      .insert(restaurants)
      .values(batch)
      .onConflictDoUpdate({
        target: restaurants.fsqPlaceId,
        targetWhere: sql`${restaurants.fsqPlaceId} is not null`,
        setWhere: sql`${restaurants.source} = 'foursquare'`,
        set: {
          name: sql`excluded.name`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          address: sql`excluded.address`,
          locality: sql`excluded.locality`,
          phone: sql`excluded.phone`,
          website: sql`excluded.website`,
          cuisine: sql`excluded.cuisine`,
          closedAt: sql`null`,
          sourceRefreshedAt: sql`excluded.source_refreshed_at`,
        },
      })
  }

  // Adoptions: attach the fsq id to an existing seed/member row, nothing else.
  for (const batch of chunk(toAdopt, CHUNK)) {
    // One UPDATE per row (bounded by matches, not catalog size), each keyed by id.
    for (const a of batch) {
      await db
        .update(restaurants)
        .set({ fsqPlaceId: a.fsqId, sourceRefreshedAt: new Date() })
        .where(eq(restaurants.id, a.existingId))
    }
  }

  // Reconciliation: owned rows absent from this extract are closed (not deleted).
  if (!skipReconcile) {
    await db
      .update(restaurants)
      .set({ closedAt: new Date() })
      .where(
        and(
          eq(restaurants.source, 'foursquare'),
          isNull(restaurants.closedAt),
          notInArray(restaurants.fsqPlaceId, [...seenFsqIds]),
        ),
      )
  }

  console.log('  done')
  await pool.end()
}

run().catch(async (err) => {
  console.error(err)
  await pool.end()
  process.exit(1)
})
