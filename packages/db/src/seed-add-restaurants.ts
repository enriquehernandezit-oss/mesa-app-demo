import { eq, inArray, sql } from 'drizzle-orm'
import { db, pool } from './client'
import * as schema from './schema'
import { COVER_BY_CUISINE, extraNeighborhoods, extraRestaurants, mulberry32 } from './seed-extra'

// ADDITIVE, one-off migration — inserts ONLY the "+14" batch of restaurants plus
// a spread of realistic community rankings/notes, WITHOUT truncating anything.
// Unlike `seed.ts` (which TRUNCATEs and regenerates the whole demo world), this
// is safe to run against a live/prod database and is idempotent: it skips any of
// the 14 whose name already exists, so re-running is a no-op.
//
//   DATABASE_URL="<public url>" bun run src/seed-add-restaurants.ts
//
// It touches only these 14 keys — running the full seed later is unaffected.
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

// A small pool of vibe notes, assigned deterministically to ~half the rankings.
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
  const existing = await db
    .select({ name: schema.restaurants.name })
    .from(schema.restaurants)
    .where(
      inArray(
        schema.restaurants.name,
        targets.map((r) => r.name),
      ),
    )
  const have = new Set(existing.map((r) => r.name))
  const missing = targets.filter((r) => !have.has(r.name))

  if (missing.length === 0) {
    console.log(`all ${targets.length} restaurants already present — nothing to insert.`)
    await pool.end()
    return
  }

  // 3) Insert the missing restaurants (columns mirror seed.ts).
  const inserted = await db
    .insert(schema.restaurants)
    .values(
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
    .returning({ id: schema.restaurants.id, name: schema.restaurants.name })

  // 4) Existing users + their current max ranking position (to append cleanly).
  const users = await db.select({ id: schema.user.id }).from(schema.user)
  if (users.length === 0) {
    console.log(`inserted ${inserted.length} restaurants; no users to rank them.`)
    await pool.end()
    return
  }
  // The demo account is ranked explicitly (below), so keep it out of the random
  // community sample to avoid handling it twice.
  const demoRow = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, DEMO_EMAIL))
    .limit(1)
  const demoId = demoRow[0]?.id ?? null
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

  // 5) A spread of rankings (+ ~half with a note) per new restaurant, from a
  //    deterministic sample of existing users. Scores are stored (not derived
  //    from position here), landing 6.8–9.5 so the "All of Mesa" average reads
  //    healthy. Whether a given followed friend lands in a sample is chance, so
  //    feed/explore presence for a specific viewer isn't guaranteed — the
  //    catalog entry, profile, and scores always are.
  const rankingRows: (typeof schema.rankings.$inferInsert)[] = []
  const noteRows: (typeof schema.vibeNotes.$inferInsert)[] = []
  const now = Date.now()
  for (const r of inserted) {
    const shuffled = [...community]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = shuffled[i]!
      shuffled[i] = shuffled[j]!
      shuffled[j] = tmp
    }
    const sampleSize = Math.min(8 + Math.floor(rng() * 5), shuffled.length) // 8–12
    for (const u of shuffled.slice(0, sampleSize)) {
      const score = 68 + Math.round(rng() * 27) // 68..95  → 6.8..9.5
      const at = new Date(now - Math.floor(rng() * 40) * DAY)
      rankingRows.push({
        userId: u.id,
        restaurantId: r.id,
        position: posFor(u.id),
        score,
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

    // Guarantee the demo account ranks every new place (biased high — it's their
    // own list), each with a note. onConflictDoNothing below keeps it idempotent.
    if (demoId) {
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
    }
  }

  await db
    .insert(schema.rankings)
    .values(rankingRows)
    .onConflictDoNothing({ target: [schema.rankings.userId, schema.rankings.restaurantId] })
  if (noteRows.length) {
    await db
      .insert(schema.vibeNotes)
      .values(noteRows)
      .onConflictDoNothing({ target: [schema.vibeNotes.userId, schema.vibeNotes.restaurantId] })
  }

  console.log(
    `inserted: ${inserted.length} restaurants, ${rankingRows.length} rankings, ${noteRows.length} notes`,
  )
  console.log(`  ${inserted.map((r) => r.name).join(', ')}`)
  await pool.end()
}

run().catch(async (err) => {
  console.error(err)
  await pool.end()
  process.exit(1)
})
