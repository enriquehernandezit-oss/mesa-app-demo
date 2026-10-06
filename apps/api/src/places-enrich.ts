// Bring every live restaurant in line with Google Places: phone, website, address, locality,
// price tier, closing hour, weekly opening hours (the "Abierto ahora" filter), Google's sector name,
// cuisine, WHERE IT IS on the map, and whether it has closed.
// Complements places:audit (which shows what is missing or invented) and the 30-day
// view-triggered refresh in routes/restaurants.ts (which only ever touches a place someone
// opens).
//
//   GOOGLE_PLACES_API_KEY=... DATABASE_URL="<url>" \
//     bun run places:enrich [--dry-run] [--refresh] [--only=<id|name>] [--limit=N] [--all]
//
// Always --dry-run first and read the report. NOTE the dry run is what calls Google (it needs the
// answers to plan from) and caches them, so the real run right after makes no further calls; it says
// how many it will make before it starts, and refuses more than 400 without --all. Google is the
// source of truth here, with one
// safeguard: a hit is only believed if Google itself says it is somewhere you eat or drink.
//
//   • Empty fields are filled from Google; a field that already has a value is never
//     overwritten. name and cover image are never touched.
//   • The exception is an INVENTED contact: the seed's placeholder phone and guessed homepage
//     (lib/placeContacts.ts). Those are real businesses, so a fake is replaced by Google's
//     real value — or cleared, when Google has none. A fake is worse than nothing.
//   • The MAP PIN follows Google. The seed's hand-placed pins were often far off (up to 5 km),
//     which sends "Cómo llegar" to the wrong place. A pin more than 50 m from Google's moves to
//     it, and the neighborhood is re-resolved the way the importer does for a new place.
//   • A place OUTSIDE Santo Domingo is filed under the area for its city (Punta Cana, Miami…),
//     created the first time it is needed — not under the Santo Domingo sector it is nearest to.
//     This runs whether or not the pin moved, so it also repairs a place a member added before
//     Mesa knew any city but Santo Domingo.
//   • A place Google reports CLOSED_PERMANENTLY is closed — the same call the 30-day refresh
//     already makes. Nothing is deleted, and `restaurant:close "<name>" --reopen` undoes it.
//   • A row with no googlePlaceId is matched by name via Text Search. The hit must be inside
//     Santo Domingo, agree on the name, AND be an eating place by Google's own type — a name
//     match alone brought back a condominium, a liquor store, a shoe shop and a hair salon.
//     A miss is reported, never guessed. A hit whose Google id another row already owns is a
//     duplicate and is left for you.
//   • A row whose Google id points at something that is not an eating place (a bookstore
//     imported by name) is reported and left alone.
//
// Idempotent: once a row is right, a re-run reports no change. Raw Google responses are cached
// to a gitignored file for at most 30 days (Google's caching limit), so fixing something and
// re-running is free; --refresh ignores the cache.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { db, pool, schema } from '@mesa/db'
import { eq } from 'drizzle-orm'

import { inBounds, namesAgree } from './import-top100'
import { databaseLabel } from './lib/databaseLabel'
import { type AreaDraft, ensureArea, placeIn } from './lib/geo'
import {
  type GooglePlaceDetails,
  type MesaFieldsFromGoogle,
  hasGooglePlacesKey,
  isEatingPlace,
  placeDetails,
  searchText,
  toMesaFields,
} from './lib/googlePlaces'
import { isPlaceholderPhone, isPlaceholderWebsite } from './lib/placeContacts'
import {
  type EnrichPatch,
  type EnrichRow,
  type Target,
  enrichPatch,
  pinDistanceM,
} from './lib/placeFacts'

const { restaurants, neighborhoods } = schema

const CACHE_PATH = new URL('../data/places-enrich-google.json', import.meta.url).pathname
// Google lets place_id be stored forever but everything else for 30 days.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Every place costs one Google call (a Place Details, or a Text Search for a place with no id yet),
// billed by Google. A run bigger than this asks for --all, so a database far larger than expected
// can't quietly spend.
export const CONFIRM_ABOVE = 400

// The cache key of a row's Google call: by id when it has one, else by name.
export const callKey = (row: Pick<EnrichRow, 'name' | 'googlePlaceId'>): string =>
  row.googlePlaceId == null ? `q:${row.name}` : `id:${row.googlePlaceId}`
export type MatchVerdict =
  | { ok: true; distanceM: number }
  | { ok: false; reason: 'no_location' | 'out_of_bounds' | 'name_mismatch' | 'not_food' }

// Whether a Text Search hit is the restaurant we searched for. Only used for a row that has no
// googlePlaceId yet — an id already on the row is trusted. Distance from Mesa's own pin is
// reported but is NOT a gate: the pin is what is being corrected.
export function acceptSearchHit(
  row: Pick<EnrichRow, 'name' | 'lat' | 'lng'>,
  fields: MesaFieldsFromGoogle,
  eatingPlace: boolean,
): MatchVerdict {
  if (fields.lat === 0 && fields.lng === 0) return { ok: false, reason: 'no_location' }
  if (!inBounds(fields.lat, fields.lng)) return { ok: false, reason: 'out_of_bounds' }
  if (!namesAgree(row.name, fields.name)) return { ok: false, reason: 'name_mismatch' }
  if (!eatingPlace) return { ok: false, reason: 'not_food' }
  return { ok: true, distanceM: pinDistanceM(row, fields) }
}

type CacheEntry = { at: string; details: GooglePlaceDetails }
type Cache = Record<string, CacheEntry>

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache
  } catch {
    return {}
  }
}

function fresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return entry != null && Date.now() - new Date(entry.at).getTime() < CACHE_TTL_MS
}

type Outcome =
  | {
      kind: 'update'
      row: EnrichRow
      patch: EnrichPatch
      matchedByName: boolean
      pinM: number
      closes: boolean
    }
  | { kind: 'unchanged'; row: EnrichRow }
  | { kind: 'unmatched'; row: EnrichRow; reason: string; googleName: string }
  | { kind: 'duplicate'; row: EnrichRow; ownerName: string }
  | { kind: 'not_food'; row: EnrichRow; primaryType: string }
  | { kind: 'failed'; row: EnrichRow }

const show = (v: string | number | null | undefined) => (v == null ? '—' : String(v))
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

async function main() {
  console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
  const dryRun = process.argv.includes('--dry-run')
  const refresh = process.argv.includes('--refresh')
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length))

  if (!hasGooglePlacesKey()) {
    // Without a key every call returns null, which would read as "Google found nothing".
    throw new Error('GOOGLE_PLACES_API_KEY is not set — refusing to run.')
  }

  // One read of the whole table (CLAUDE.md hard rule 3), including removed/closed rows: the
  // unique index on google_place_id spans all of them, so a candidate id has to be checked
  // against every row, not just the live ones.
  const all = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      lat: restaurants.lat,
      lng: restaurants.lng,
      neighborhoodId: restaurants.neighborhoodId,
      googlePlaceId: restaurants.googlePlaceId,
      phone: restaurants.phone,
      website: restaurants.website,
      address: restaurants.address,
      locality: restaurants.locality,
      priceTier: restaurants.priceTier,
      closesAt: restaurants.closesAt,
      cuisine: restaurants.cuisine,
      openingHours: restaurants.openingHours,
      googleSublocality: restaurants.googleSublocality,
      removedAt: restaurants.removedAt,
      closedAt: restaurants.closedAt,
    })
    .from(restaurants)
    .orderBy(restaurants.name)
  const hoods = await db
    .select({
      id: neighborhoods.id,
      slug: neighborhoods.slug,
      name: neighborhoods.name,
      lat: neighborhoods.lat,
      lng: neighborhoods.lng,
      listed: neighborhoods.listed,
    })
    .from(neighborhoods)
  const hoodName = new Map(hoods.map((h) => [h.id, h.name]))
  // Santo Domingo's sectors are what a place inside Santo Domingo resolves among; the areas made
  // for places elsewhere are looked up by slug, so a city's second place reuses its first's area.
  const sectors = hoods.filter((h) => h.listed)
  const areaIdBySlug = new Map(hoods.filter((h) => !h.listed).map((h) => [h.slug, h.id]))

  const idOwner = new Map<string, string>()
  for (const r of all) if (r.googlePlaceId) idOwner.set(r.googlePlaceId, r.name)

  let rows: EnrichRow[] = all.filter((r) => !r.removedAt && !r.closedAt)
  if (only) {
    const needle = only.toLowerCase()
    rows = rows.filter((r) => r.id === only || r.name.toLowerCase().includes(needle))
  }
  if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit)

  const cache = refresh ? {} : loadCache()
  let liveCalls = 0
  let cachedCalls = 0

  // Say what this will cost BEFORE spending it. The dry run is what talks to Google — it needs the
  // answers to plan from — and the real run right after is served from the cache it fills.
  const toCall = rows.filter((r) => !fresh(cache[callKey(r)])).length
  console.log(`Google calls this run will make: ${toCall} (${rows.length - toCall} already cached)`)
  if (toCall > CONFIRM_ABOVE && !process.argv.includes('--all')) {
    throw new Error(
      `That is more than ${CONFIRM_ABOVE} Google calls, each billed by Google. If that is what you expect, re-run with --all; or do a batch with --limit=N.`,
    )
  }

  const outcomes: Outcome[] = []
  for (const [i, row] of rows.entries()) {
    if (i > 0 && i % 25 === 0) console.log(`  …${i}/${rows.length}`)
    const searched = row.googlePlaceId == null
    const key = callKey(row)
    let details: GooglePlaceDetails | null = null
    if (fresh(cache[key])) {
      details = cache[key].details
      cachedCalls++
    } else {
      details = searched
        ? await searchText(`${row.name}, Santo Domingo`)
        : await placeDetails(row.googlePlaceId as string)
      liveCalls++
      // Only a real answer is cached: the client returns null for a failed call and for "no
      // result" alike, and caching that would replay an outage as "not found".
      if (details) cache[key] = { at: new Date().toISOString(), details }
    }
    if (!details) {
      outcomes.push({ kind: 'failed', row })
      continue
    }

    const fields = toMesaFields(details)
    const eating = isEatingPlace(details)

    if (searched) {
      const verdict = acceptSearchHit(row, fields, eating)
      if (!verdict.ok) {
        outcomes.push({
          kind: 'unmatched',
          row,
          reason: verdict.reason,
          googleName: `${fields.name} (${details.primaryType ?? 'no type'})`,
        })
        continue
      }
      const owner = idOwner.get(details.id)
      if (owner) {
        outcomes.push({ kind: 'duplicate', row, ownerName: owner })
        continue
      }
      // Claim the id for this run too, so a second row that resolves to the same Google place
      // is reported as a duplicate instead of tripping the unique index on write.
      idOwner.set(details.id, row.name)
    } else if (!eating) {
      // An id already on the row, but Google says it is not somewhere you eat: report, don't act.
      outcomes.push({ kind: 'not_food', row, primaryType: details.primaryType ?? 'no type' })
      continue
    }

    // Google says it has closed: close it (the refresh does the same) and change nothing else.
    if (fields.closedAt) {
      outcomes.push({
        kind: 'update',
        row,
        patch: {},
        matchedByName: searched,
        pinM: 0,
        closes: true,
      })
      continue
    }

    const placing = placeIn(details, sectors)
    const target: Target =
      placing == null
        ? { kind: 'sector', hoodId: row.neighborhoodId }
        : placing.kind === 'sector'
          ? { kind: 'sector', hoodId: placing.hood.id }
          : {
              kind: 'area',
              hoodId: areaIdBySlug.get(placing.area.slug) ?? null,
              draft: placing.area,
            }
    const patch = enrichPatch(row, fields, details.id, target)
    outcomes.push(
      Object.keys(patch).length === 0
        ? { kind: 'unchanged', row }
        : {
            kind: 'update',
            row,
            patch,
            matchedByName: searched,
            pinM: pinDistanceM(row, fields),
            closes: false,
          },
    )
  }
  if (liveCalls > 0) writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)

  const updates = outcomes.filter(
    (o): o is Extract<Outcome, { kind: 'update' }> => o.kind === 'update',
  )
  const closings = updates.filter((u) => u.closes)
  console.log(`\n${dryRun ? '(DRY RUN) ' : ''}${rows.length} place(s) checked`)
  console.log(`Google calls: ${liveCalls} live, ${cachedCalls} from cache`)
  console.log(`  update     ${updates.length - closings.length}`)
  console.log(`  close      ${closings.length}`)
  for (const kind of ['unchanged', 'unmatched', 'duplicate', 'not_food', 'failed'] as const) {
    console.log(`  ${kind.padEnd(10)} ${outcomes.filter((o) => o.kind === kind).length}`)
  }

  if (updates.length > 0) console.log('\nChanges:')
  for (const { row, patch, matchedByName, pinM, closes } of updates) {
    const bits: string[] = []
    if (closes) bits.push('CLOSED — Google says permanently closed')
    for (const [col, next] of Object.entries(patch)) {
      if (col === 'lat' || col === 'lng' || col === 'googlePlaceId' || col === 'openMinutes')
        continue
      if (col === 'openingHours') {
        bits.push(
          `hours ${row.openingHours ? 'updated' : 'added'} (${(next as unknown[] | null)?.length ?? 0} opening periods a week)`,
        )
        continue
      }
      if (col === 'area') {
        const draft = next as AreaDraft
        bits.push(
          `neighborhood ${hoodName.get(row.neighborhoodId) ?? '—'} → ${draft.name} (new area, outside Santo Domingo)`,
        )
        continue
      }
      if (col === 'neighborhoodId') {
        bits.push(
          `neighborhood ${hoodName.get(row.neighborhoodId) ?? '—'} → ${hoodName.get(next as string) ?? '—'}`,
        )
        continue
      }
      const prev = row[col as keyof EnrichRow]
      bits.push(
        `${col} ${show(prev as string | number | null)} → ${show(next as string | number | null)}`,
      )
    }
    if (patch.lat != null) bits.push(`pin moved ${km(pinM)} to Google's location`)
    if (patch.googlePlaceId) bits.push('Google id attached')
    const how = matchedByName ? '  [matched by name]' : ''
    console.log(`  ${row.name}${how}\n    ${bits.join('\n    ')}`)
  }

  const listFor = (title: string, kind: Outcome['kind'], detail: (o: Outcome) => string) => {
    const hit = outcomes.filter((o) => o.kind === kind)
    if (hit.length === 0) return
    console.log(`\n${title}`)
    for (const o of hit) console.log(`  ${o.row.name}${detail(o)}`)
  }
  listFor(
    'Google found no restaurant by that name (left untouched — its hit is shown):',
    'unmatched',
    (o) => (o.kind === 'unmatched' ? ` — ${o.reason}: Google returned ${o.googleName}` : ''),
  )
  listFor(
    'Google id already belongs to another row (a duplicate — left untouched; `bun run places:merge` merges them):',
    'duplicate',
    (o) => (o.kind === 'duplicate' ? ` — same place as "${o.ownerName}"` : ''),
  )
  listFor(
    'Google says this is not a restaurant (left untouched — likely a wrong import):',
    'not_food',
    (o) => (o.kind === 'not_food' ? ` — Google type: ${o.primaryType}` : ''),
  )
  listFor('Google call failed (re-run to retry):', 'failed', () => '')

  // Rows this run could not enrich still carry the seed's invented contacts; say so, and how
  // to clear them, rather than leaving a fake phone behind without a word.
  const stillFake = outcomes.filter(
    (o) =>
      o.kind !== 'update' &&
      (isPlaceholderPhone(o.row.phone) || isPlaceholderWebsite(o.row.name, o.row.website)),
  ).length
  if (stillFake > 0) {
    console.log(
      `\n${stillFake} place(s) above still carry an invented phone or website. Once you have ` +
        'reviewed them, `bun run catalog:clean` clears those.',
    )
  }

  if (dryRun) {
    console.log('\ndry run — no writes')
    return
  }
  // One UPDATE per changed row — bounded by the number of changes, and each is independent, so
  // an interruption just leaves the rest for the next (idempotent) run.
  for (const { row, patch, closes } of updates) {
    const { area, ...columns } = patch
    await db
      .update(restaurants)
      .set({
        ...columns,
        ...(area ? { neighborhoodId: (await ensureArea(area)).id } : {}),
        ...(patch.lat != null ? { geoPrecision: 'exact' as const } : {}),
        ...(closes ? { closedAt: new Date() } : { sourceRefreshedAt: new Date() }),
      })
      .where(eq(restaurants.id, row.id))
  }
  console.log(`\ndone: ${updates.length} place(s) updated.`)
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
