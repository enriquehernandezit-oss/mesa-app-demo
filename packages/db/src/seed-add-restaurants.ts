import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, pool } from './client'
import * as schema from './schema'
import { COVER_BY_CUISINE, extraNeighborhoods, extraRestaurants, mulberry32 } from './seed-extra'

// ADDITIVE, one-off migration — inserts ONLY the "+14" batch of restaurants plus
// a spread of realistic community rankings/notes, WITHOUT truncating anything.
// Unlike `seed.ts` (which TRUNCATEs and regenerates the whole demo world), this
// is safe to run against a live/prod database and is idempotent.
//
//   DATABASE_URL="<public url>" bun run src/seed-add-restaurants.ts
//
// Two independent guarantees, each idempotent, so it's safe to re-run and also
// safe to run when the restaurants already exist (e.g. a deploy already seeded
// them from seed-extra.ts):
//   1) the 14 restaurants exist (skips any already present, by name);
//   2) the demo account ranks all 14 (adds only the ones it doesn't rank yet).
// Community rankings are only ever added for restaurants THIS run inserts, so a
// place that already carries seed rankings is never double-populated.
const NEW_KEYS = new Set([
  'ajuala',
  'casaluca',
  'gijon',
  'maraca',
  'lila',
  'larimar',
  'donpepe',
  'zola',
  'rincon',
  'shibuya',
  'ichiban',
  'filigrana',
  'ilbacareto',
  'olivia',
])

const CLOSES_AT = ['11p', '12a', '1a', '2a', '10p']
const DAY = 24 * 60 * 60 * 1000

// The demo login (apps/api/src/seed-demo.ts). Guaranteed a ranking for each new
// place so they show in the demo account's own passport, not just the community.
const DEMO_EMAIL = 'demo@mesa.test'

// Same website shape the main seed uses (isDemo — real URLs replace these).
const siteFor = (name: string): string =>
  `https://${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '')}.do`

// A small pool of vibe notes, assigned deterministically.
const NOTES = [
  'Reservá con tiempo, se llena.',
  'Pedí lo del día, nunca falla.',
  'Terraza ideal para la noche.',
  'Servicio impecable, volvería.',
  'Cocktails muy por encima del promedio.',
  'Un clásico que se mantiene.',
  'Para una cena tranquila entre semana.',
  'La cocina cierra tarde — perfecto.',
]

async function run() {
  const rng = mulberry32(0x5eedadd) // fixed seed → deterministic re-runs

  // 1) Ensure the two "extra" barrios exist (piantini/naco/etc. already do).
  await db
    .insert(schema.neighborhoods)
    .values(extraNeighborhoods)
    .onConflictDoNothing({ target: schema.neighborhoods.slug })

  const hoods = await db
    .select({ id: schema.neighborhoods.id, slug: schema.neighborhoods.slug })
    .from(schema.neighborhoods)
  const nidBySlug = new Map(hoods.map((h) => [h.slug, h.id]))

  // 2) Which of the 14 are missing (dedupe by name → idempotent).
  const targets = extraRestaurants.filter((r) => NEW_KEYS.has(r.key))
  const targetNames = targets.map((r) => r.name)
  const existing = await db
    .select({ name: schema.restaurants.name })
    .from(schema.restaurants)
    .where(inArray(schema.restaurants.name, targetNames))
  const have = new Set(existing.map((r) => r.name))
  const missing = targets.filter((r) => !have.has(r.name))

  // 3) Insert the missing restaurants (may be none). Columns mirror seed.ts.
  if (missing.length > 0) {
    await db.insert(schema.restaurants).values(
      missing.map((r, i) => {
        const neighborhoodId = nidBySlug.get(r.neighborhood)
        if (!neighborhoodId) throw new Error(`unknown neighborhood slug: ${r.neighborhood}`)
        return {
          name: r.name,
          neighborhoodId,
          cuisine: r.cuisine,
          lat: r.lat,
          lng: r.lng,
          phone: `+1809556${String(1000 + i)}`,
          closesAt: CLOSES_AT[i % CLOSES_AT.length],
          website: i % 3 === 2 ? null : siteFor(r.name),
          priceTier: r.priceTier,
          coverImageId: `/restaurants/${COVER_BY_CUISINE[r.cuisine] ?? 'bar'}.jpg`,
          isDemo: true,
        }
      }),
    )
  }

  // Resolve ids for all 14 (pre-existing + just-inserted); flag the new ones.
  const all14 = await db
    .select({ id: schema.restaurants.id, name: schema.restaurants.name })
    .from(schema.restaurants)
    .where(inArray(schema.restaurants.name, targetNames))
  const missingNames = new Set(missing.map((r) => r.name))
  const newlyInserted = all14.filter((r) => missingNames.has(r.name))

  // 4) Users, the demo account, and each user's current max ranking position.
  const users = await db.select({ id: schema.user.id }).from(schema.user)
  const demoRow = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, DEMO_EMAIL))
    .limit(1)
  const demoId = demoRow[0]?.id ?? null
  // Demo is ranked explicitly (step 6), so keep it out of the random sample.
  const community = users.filter((u) => u.id !== demoId)
  const maxPos = await db
    .select({
      userId: schema.rankings.userId,
      max: sql<number>`max(${schema.rankings.position})`,
    })
    .from(schema.rankings)
    .groupBy(schema.rankings.userId)
  const nextPos = new Map(maxPos.map((m) => [m.userId, Number(m.max) + 1]))
  const posFor = (userId: string): number => {
    const p = nextPos.get(userId) ?? 1
    nextPos.set(userId, p + 1)
    return p
  }

  const rankingRows: (typeof schema.rankings.$inferInsert)[] = []
  const noteRows: (typeof schema.vibeNotes.$inferInsert)[] = []
  const now = Date.now()

  // 5) Community spread — ONLY for restaurants this run inserted. Scores are
  //    stored (not derived from position here), landing 6.8–9.5 so the "All of
  //    Mesa" average reads healthy. Whether a followed friend lands in a sample
  //    is chance, so feed presence for a specific viewer isn't guaranteed — the
  //    catalog entry, profile, and scores always are.
  for (const r of newlyInserted) {
    const shuffled = [...community]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = shuffled[i]!
      shuffled[i] = shuffled[j]!
      shuffled[j] = tmp
    }
    const sampleSize = Math.min(8 + Math.floor(rng() * 5), shuffled.length) // 8–12
    for (const u of shuffled.slice(0, sampleSize)) {
      const at = new Date(now - Math.floor(rng() * 40) * DAY)
      rankingRows.push({
        userId: u.id,
        restaurantId: r.id,
        position: posFor(u.id),
        score: 68 + Math.round(rng() * 27), // 68..95 → 6.8..9.5
        createdAt: at,
        updatedAt: at,
      })
      if (rng() < 0.5) {
        noteRows.push({
          userId: u.id,
          restaurantId: r.id,
          body: NOTES[Math.floor(rng() * NOTES.length)]!,
          createdAt: at,
          updatedAt: at,
        })
      }
    }
  }

  // 6) Guarantee the demo account ranks ALL 14 — including ones that already
  //    existed before this run. Add only the ones it doesn't rank yet (biased
  //    high; it's their own list), so re-running never piles on duplicates.
  let demoAdded = 0
  if (demoId) {
    const alreadyRanked = new Set(
      (
        await db
          .select({ rid: schema.rankings.restaurantId })
          .from(schema.rankings)
          .where(
            and(
              eq(schema.rankings.userId, demoId),
              inArray(
                schema.rankings.restaurantId,
                all14.map((r) => r.id),
              ),
            ),
          )
      ).map((x) => x.rid),
    )
    for (const r of all14) {
      if (alreadyRanked.has(r.id)) continue
      const at = new Date(now - Math.floor(rng() * 30) * DAY)
      rankingRows.push({
        userId: demoId,
        restaurantId: r.id,
        position: posFor(demoId),
        score: 78 + Math.round(rng() * 17), // 78..95 → 7.8..9.5
        createdAt: at,
        updatedAt: at,
      })
      noteRows.push({
        userId: demoId,
        restaurantId: r.id,
        body: NOTES[Math.floor(rng() * NOTES.length)]!,
        createdAt: at,
        updatedAt: at,
      })
      demoAdded++
    }
  }

  // 7) Insert (idempotent; guard empty — an empty VALUES list is an error).
  if (rankingRows.length > 0) {
    await db
      .insert(schema.rankings)
      .values(rankingRows)
      .onConflictDoNothing({ target: [schema.rankings.userId, schema.rankings.restaurantId] })
  }
  if (noteRows.length > 0) {
    await db
      .insert(schema.vibeNotes)
      .values(noteRows)
      .onConflictDoNothing({ target: [schema.vibeNotes.userId, schema.vibeNotes.restaurantId] })
  }

  console.log(
    `restaurants: ${missing.length} inserted (${all14.length}/14 present) · ` +
      `${rankingRows.length} rankings added (demo: ${demoAdded}/14 newly ranked) · ` +
      `${noteRows.length} notes`,
  )
  if (missing.length) console.log(`  new: ${missing.map((r) => r.name).join(', ')}`)
  await pool.end()
}

run().catch(async (err) => {
  console.error(err)
  await pool.end()
  process.exit(1)
})
