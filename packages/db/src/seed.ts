import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, pool } from './client'
import * as schema from './schema'
import { friends, neighborhoods, restaurants, scoreForPosition, waitlist } from './seed-data'

// Seeds the dense demo cluster (see seed-data.ts). Idempotent: it truncates the
// demo/auth tables first, so re-running gives a clean, identical dataset.
// Run with: bun run --env-file=.env src/seed.ts  (or `bun db:seed`).

async function seed() {
  console.log('seeding…')

  // Dev reset. CASCADE from user clears follows/rankings/vibe_notes/saved_places/
  // reports/user_blocks/session/account; from neighborhoods clears restaurants.
  await db.execute(
    sql`TRUNCATE TABLE "user", restaurants, neighborhoods, waitlist RESTART IDENTITY CASCADE`,
  )

  // --- neighborhoods ---
  const nRows = await db
    .insert(schema.neighborhoods)
    .values(neighborhoods)
    .returning({ id: schema.neighborhoods.id, slug: schema.neighborhoods.slug })
  const neighborhoodId = new Map(nRows.map((r) => [r.slug, r.id]))
  const nid = (slug: string): string => {
    const id = neighborhoodId.get(slug)
    if (!id) throw new Error(`unknown neighborhood: ${slug}`)
    return id
  }

  // --- restaurants (flagged isDemo) ---
  const rRows = await db
    .insert(schema.restaurants)
    .values(
      restaurants.map((r) => ({
        name: r.name,
        neighborhoodId: nid(r.neighborhood),
        cuisine: r.cuisine,
        lat: r.lat,
        lng: r.lng,
        isDemo: true,
      })),
    )
    .returning({ id: schema.restaurants.id, name: schema.restaurants.name })
  const idByName = new Map(rRows.map((r) => [r.name, r.id]))
  const rid = (key: string): string => {
    const r = restaurants.find((x) => x.key === key)
    const id = r && idByName.get(r.name)
    if (!id) throw new Error(`unknown restaurant key: ${key}`)
    return id
  }

  // --- friends (user rows; demo profiles, EULA accepted) ---
  const now = new Date()
  const friendId = new Map<string, string>()
  await db.insert(schema.user).values(
    friends.map((f) => {
      const id = randomUUID()
      friendId.set(f.handle, id)
      return {
        id,
        name: f.name,
        handle: f.handle,
        bio: f.bio,
        neighborhoodId: nid(f.neighborhood),
        eulaAcceptedAt: now,
      }
    }),
  )
  const uid = (handle: string): string => {
    const id = friendId.get(handle)
    if (!id) throw new Error(`missing friend id: ${handle}`)
    return id
  }

  // --- follows: complete graph among the friends (dense cluster) ---
  const followRows = friends.flatMap((a) =>
    friends
      .filter((b) => b.handle !== a.handle)
      .map((b) => ({ followerId: uid(a.handle), followingId: uid(b.handle) })),
  )
  await db.insert(schema.follows).values(followRows)

  // --- rankings + vibe notes ---
  const rankingRows: (typeof schema.rankings.$inferInsert)[] = []
  const noteRows: (typeof schema.vibeNotes.$inferInsert)[] = []
  for (const f of friends) {
    f.ranked.forEach((entry, i) => {
      const position = i + 1
      rankingRows.push({
        userId: uid(f.handle),
        restaurantId: rid(entry.key),
        position,
        score: scoreForPosition(position, f.ranked.length),
      })
      noteRows.push({ userId: uid(f.handle), restaurantId: rid(entry.key), body: entry.note })
    })
  }
  await db.insert(schema.rankings).values(rankingRows)
  await db.insert(schema.vibeNotes).values(noteRows)

  // --- saved places (want-to-try) ---
  const savedRows = friends.flatMap((f) =>
    (f.wantToTry ?? []).map((key) => ({ userId: uid(f.handle), restaurantId: rid(key) })),
  )
  if (savedRows.length) await db.insert(schema.savedPlaces).values(savedRows)

  // --- waitlist (mirror of the quiz) ---
  await db.insert(schema.waitlist).values(waitlist)

  console.log(
    `inserted: ${nRows.length} neighborhoods, ${rRows.length} restaurants, ` +
      `${friends.length} friends, ${followRows.length} follows, ` +
      `${rankingRows.length} rankings, ${noteRows.length} vibe notes, ` +
      `${savedRows.length} saved, ${waitlist.length} waitlist`,
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
