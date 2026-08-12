import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, pool } from './client'
import * as schema from './schema'
import { seedCuration } from './seed-curation'
import { friends, neighborhoods, restaurants, scoreForPosition, waitlist } from './seed-data'
import {
  COVER_BY_CUISINE,
  extraNeighborhoods,
  extraRestaurants,
  generateUsers,
  mulberry32,
} from './seed-extra'

// Seeds the dense demo world: 7 neighborhoods, 35 real SD restaurants, 40 users
// (8 curated friends + 32 generated), ~600 rankings with notes/tags/dishes
// spread over six weeks, an organic follow graph, and cheers throughout.
// Deterministic (fixed PRNG seeds) and idempotent (truncates first).
// Run with: bun run --env-file=.env src/seed.ts  (or `bun db:seed`).

// Curated cover photos for the original 15; the rest map by cuisine.
const COVER_BY_KEY: Record<string, string> = {
  sophias: 'cocktails',
  peperoni: 'pasta',
  mijas: 'tapas',
  boga: 'branzino',
  segundo: 'ceviche',
  bottega: 'pizza',
  mitre: 'wine',
  adrian: 'mofongo',
  vesuvio: 'bar',
  cava: 'steak',
  positano: 'dessert',
  patepalo: 'branzino',
  lulu: 'tapas',
  jalao: 'mofongo',
  mesonbari: 'cocktails',
}

// Price tiers for the curated 15 (the extras carry their own).
const PRICE_BY_KEY: Record<string, number> = {
  sophias: 4,
  peperoni: 3,
  mijas: 3,
  boga: 4,
  segundo: 3,
  bottega: 3,
  mitre: 3,
  adrian: 2,
  vesuvio: 3,
  cava: 4,
  positano: 3,
  patepalo: 3,
  lulu: 2,
  jalao: 2,
  mesonbari: 2,
}

const DAY = 24 * 60 * 60 * 1000

async function seed() {
  console.log('seeding…')

  await db.execute(
    sql`TRUNCATE TABLE "user", restaurants, neighborhoods, waitlist RESTART IDENTITY CASCADE`,
  )

  // --- neighborhoods (5 curated + 2 extra) ---
  const nRows = await db
    .insert(schema.neighborhoods)
    .values([...neighborhoods, ...extraNeighborhoods])
    .returning({ id: schema.neighborhoods.id, slug: schema.neighborhoods.slug })
  const neighborhoodId = new Map(nRows.map((r) => [r.slug, r.id]))
  const nid = (slug: string): string => {
    const id = neighborhoodId.get(slug)
    if (!id) throw new Error(`unknown neighborhood: ${slug}`)
    return id
  }

  // --- restaurants (15 curated + 20 extra, all isDemo) ---
  const allRestaurants = [
    ...restaurants.map((r) => ({
      ...r,
      priceTier: PRICE_BY_KEY[r.key] ?? 2,
      cover: COVER_BY_KEY[r.key] ?? COVER_BY_CUISINE[r.cuisine] ?? 'bar',
    })),
    ...extraRestaurants.map((r) => ({
      ...r,
      cover: COVER_BY_CUISINE[r.cuisine] ?? 'bar',
    })),
  ]
  const rRows = await db
    .insert(schema.restaurants)
    .values(
      allRestaurants.map((r, i) => ({
        name: r.name,
        neighborhoodId: nid(r.neighborhood),
        cuisine: r.cuisine,
        lat: r.lat,
        lng: r.lng,
        phone: `+1809555${String(1000 + i)}`,
        priceTier: r.priceTier,
        coverImageId: `/restaurants/${r.cover}.jpg`,
        isDemo: true,
      })),
    )
    .returning({ id: schema.restaurants.id, name: schema.restaurants.name })
  const idByName = new Map(rRows.map((r) => [r.name, r.id]))
  const rid = (key: string): string => {
    const r = allRestaurants.find((x) => x.key === key)
    const id = r && idByName.get(r.name)
    if (!id) throw new Error(`unknown restaurant key: ${key}`)
    return id
  }

  // --- users: 8 curated friends + 32 generated ---
  const now = Date.now()
  const generated = generateUsers(
    allRestaurants.map((r) => ({ key: r.key, cuisine: r.cuisine })),
    friends.map((f) => f.handle),
  )
  const userId = new Map<string, string>()
  await db.insert(schema.user).values([
    ...friends.map((f) => {
      const id = randomUUID()
      userId.set(f.handle, id)
      return {
        id,
        name: f.name,
        handle: f.handle,
        bio: f.bio,
        neighborhoodId: nid(f.neighborhood),
        eulaAcceptedAt: new Date(now),
      }
    }),
    ...generated.map((g) => {
      const id = randomUUID()
      userId.set(g.handle, id)
      return {
        id,
        name: g.name,
        handle: g.handle,
        bio: g.bio,
        neighborhoodId: nid(g.neighborhood),
        eulaAcceptedAt: new Date(now),
      }
    }),
  ])
  const uid = (handle: string): string => {
    const id = userId.get(handle)
    if (!id) throw new Error(`missing user id: ${handle}`)
    return id
  }

  // --- follows: curated cluster is complete; generated users follow curated +
  // each other; curated friends follow back a slice of generated. Deduped. ---
  const followPairs = new Set<string>()
  const followRows: (typeof schema.follows.$inferInsert)[] = []
  const addFollow = (a: string, b: string) => {
    if (a === b) return
    const key = `${a}:${b}`
    if (followPairs.has(key)) return
    followPairs.add(key)
    followRows.push({ followerId: a, followingId: b })
  }
  for (const a of friends) for (const b of friends) addFollow(uid(a.handle), uid(b.handle))
  generated.forEach((g, i) => {
    for (const h of g.followsHandles) addFollow(uid(g.handle), uid(h))
    // Curated friends follow back roughly a third of generated users.
    const backFollower = friends[i % friends.length]
    if (backFollower && i % 3 !== 0) addFollow(uid(backFollower.handle), uid(g.handle))
  })
  await db.insert(schema.follows).values(followRows)

  // --- rankings + vibe notes (timestamps spread over ~6 weeks) ---
  const tsRand = mulberry32(777)
  const rankingRows: (typeof schema.rankings.$inferInsert)[] = []
  const noteRows: (typeof schema.vibeNotes.$inferInsert)[] = []
  for (const f of friends) {
    f.ranked.forEach((entry, i) => {
      const position = i + 1
      // Curated friends stay active: their newest entries land within days.
      const daysAgo = i === 0 ? tsRand() * 2 : tsRand() * 40
      const at = new Date(now - daysAgo * DAY)
      rankingRows.push({
        userId: uid(f.handle),
        restaurantId: rid(entry.key),
        position,
        score: scoreForPosition(position, f.ranked.length),
        createdAt: at,
        updatedAt: at,
      })
      noteRows.push({
        userId: uid(f.handle),
        restaurantId: rid(entry.key),
        body: entry.note,
        createdAt: at,
        updatedAt: at,
      })
    })
  }
  for (const g of generated) {
    g.ranked.forEach((entry, i) => {
      const position = i + 1
      const at = new Date(now - entry.daysAgo * DAY)
      rankingRows.push({
        userId: uid(g.handle),
        restaurantId: rid(entry.key),
        position,
        score: scoreForPosition(position, g.ranked.length),
        tags: entry.tags,
        favoriteDish: entry.dish,
        createdAt: at,
        updatedAt: at,
      })
      if (entry.note) {
        noteRows.push({
          userId: uid(g.handle),
          restaurantId: rid(entry.key),
          body: entry.note,
          createdAt: at,
          updatedAt: at,
        })
      }
    })
  }
  const insertedRankings = await db
    .insert(schema.rankings)
    .values(rankingRows)
    .returning({ id: schema.rankings.id, userId: schema.rankings.userId })
  await db.insert(schema.vibeNotes).values(noteRows)

  // --- cheers: 0–6 per ranking, drawn from the owner's followers ---
  const followersOf = new Map<string, string[]>()
  for (const f of followRows) {
    const list = followersOf.get(f.followingId as string) ?? []
    list.push(f.followerId as string)
    followersOf.set(f.followingId as string, list)
  }
  const cheerRand = mulberry32(1313)
  const cheerRows: (typeof schema.cheers.$inferInsert)[] = []
  const seenCheer = new Set<string>()
  for (const r of insertedRankings) {
    const followers = followersOf.get(r.userId) ?? []
    if (followers.length === 0) continue
    const howMany = Math.floor(cheerRand() * Math.min(7, followers.length + 1))
    for (let k = 0; k < howMany; k++) {
      const cheerer = followers[Math.floor(cheerRand() * followers.length)]
      if (!cheerer) continue
      const key = `${cheerer}:${r.id}`
      if (seenCheer.has(key)) continue
      seenCheer.add(key)
      cheerRows.push({ userId: cheerer, rankingId: r.id })
    }
  }
  if (cheerRows.length) await db.insert(schema.cheers).values(cheerRows)

  // --- saved places (want-to-try) ---
  const savedRows = [
    ...friends.flatMap((f) =>
      (f.wantToTry ?? []).map((key) => ({ userId: uid(f.handle), restaurantId: rid(key) })),
    ),
    ...generated.flatMap((g) =>
      g.wantToTry.map((key) => ({ userId: uid(g.handle), restaurantId: rid(key) })),
    ),
  ]
  if (savedRows.length) await db.insert(schema.savedPlaces).values(savedRows)

  // --- waitlist (mirror of the quiz) ---
  await db.insert(schema.waitlist).values(waitlist)

  // --- editorial curated lists (chosen from the rankings just inserted) ---
  const listCount = await seedCuration(db)

  console.log(`inserted: ${listCount} curated lists`)
  console.log(
    `inserted: ${nRows.length} neighborhoods, ${rRows.length} restaurants, ` +
      `${friends.length + generated.length} users, ${followRows.length} follows, ` +
      `${rankingRows.length} rankings, ${noteRows.length} vibe notes, ` +
      `${cheerRows.length} cheers, ${savedRows.length} saved, ${waitlist.length} waitlist`,
  )

  return uid('caro') // the viewer for the read-back check
}

// Reads one friend's feed (everyone they follow → those people's ranked lists →
// each restaurant) and asserts it executed as EXACTLY ONE SQL statement. The
// no-N+1 rule made mechanical: a relational query, not a loop.
async function verifyFeedReadBackIsSingleQuery(viewerId: string) {
  let statements = 0
  const originalQuery = pool.query.bind(pool)
  // biome-ignore lint/suspicious/noExplicitAny: wrapping pg's overloaded query
  ;(pool as any).query = (...args: any[]) => {
    statements++
    // biome-ignore lint/suspicious/noExplicitAny: passthrough to original
    return (originalQuery as any)(...args)
  }

  try {
    const feed = await db.query.user.findFirst({
      where: eq(schema.user.id, viewerId),
      columns: { handle: true },
      with: {
        following: {
          with: {
            following: {
              columns: { handle: true, name: true },
              with: {
                rankings: {
                  columns: { position: true, score: true },
                  orderBy: (r, { asc }) => asc(r.position),
                  with: { restaurant: { columns: { name: true } } },
                },
              },
            },
          },
        },
      },
    })

    const followed = feed?.following ?? []
    const rankingsSeen = followed.reduce((sum, f) => sum + f.following.rankings.length, 0)
    console.log(
      `feed read-back: ${followed.length} followed users, ${rankingsSeen} rankings ` +
        `in ${statements} SQL statement(s)`,
    )
    if (statements !== 1) {
      throw new Error(`N+1 detected: read-back ran ${statements} statements, expected 1`)
    }
    console.log('no-N+1 verified ✓')
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore original
    ;(pool as any).query = originalQuery
  }
}

const viewerId = await seed()
await verifyFeedReadBackIsSingleQuery(viewerId)
await pool.end()
