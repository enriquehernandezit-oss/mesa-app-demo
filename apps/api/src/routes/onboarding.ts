import { db, schema } from '@mesa/db'
import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Everything the cold-start onboarding needs. The product's #1 risk is an empty
// first open, so these endpoints exist to make a brand-new profile immediately
// non-empty and non-friendless (BUILD_PLAN M2).

// Derive the 0–100 score shown beside a rank from the ordered position the
// pairwise flow produced. Linear spread, top of the list highest. M3's full
// rank-a-place flow refines this; for a starter list it just needs to look
// right and be monotonic.
function scoreFor(index: number, total: number): number {
  if (total <= 1) return 95
  const top = 96
  const bottom = 72
  return Math.round(top - (index * (top - bottom)) / (total - 1))
}

const rankingsSchema = z.object({
  // Ordered best-first, as the pairwise comparisons settled them.
  restaurantIds: z.array(z.string().uuid()).min(1).max(20),
})

const contactsSchema = z.object({
  phoneNumbers: z.array(z.string()).max(2000),
})

export const onboardingRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // The five target neighborhoods, for the profile picker.
  .get('/neighborhoods', async (c) => {
    const rows = await db.query.neighborhoods.findMany({
      columns: { slug: true, name: true },
      orderBy: (n, { asc }) => asc(n.name),
    })
    return c.json({ neighborhoods: rows })
  })

  // The set of places to rank during onboarding — the demo cluster, so the
  // pairwise flow ("Vela or Lumbre?") has real spots to compare.
  .get('/candidates', async (c) => {
    const rows = await db.query.restaurants.findMany({
      columns: { id: true, name: true, cuisine: true, coverImageId: true },
      with: { neighborhood: { columns: { slug: true, name: true } } },
      orderBy: (r, { asc }) => asc(r.name),
      limit: 15,
    })
    return c.json({ restaurants: rows })
  })

  // Persist the ordered starter list. One multi-row upsert (single round trip):
  // position is 1..n in the given order, score derived from position. Re-running
  // it replaces positions/scores for the same places rather than erroring.
  .post('/rankings', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)

    const parsed = rankingsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    // Dedupe while preserving order.
    const ids = [...new Set(parsed.data.restaurantIds)]

    // Validate every id is a real restaurant before writing.
    const existing = await db.query.restaurants.findMany({
      where: inArray(schema.restaurants.id, ids),
      columns: { id: true },
    })
    if (existing.length !== ids.length) {
      return c.json({ error: 'unknown_restaurant' }, 400)
    }

    const total = ids.length
    const values = ids.map((restaurantId, i) => ({
      userId: current.id,
      restaurantId,
      position: i + 1,
      score: scoreFor(i, total),
    }))

    await db
      .insert(schema.rankings)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.rankings.userId, schema.rankings.restaurantId],
        set: {
          position: sql`excluded.position`,
          score: sql`excluded.score`,
          updatedAt: new Date(),
        },
      })

    return c.json({ ok: true, count: total })
  })

  // Friend suggestions so a new profile is never friendless. People the user
  // doesn't already follow (and hasn't blocked), most-followed first, in one
  // round trip. With the seed cluster loaded, this returns the demo friends.
  .get('/suggested-friends', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)

    const alreadyFollowing = db
      .select({ id: schema.follows.followingId })
      .from(schema.follows)
      .where(eq(schema.follows.followerId, current.id))
    const blocked = db
      .select({ id: schema.userBlocks.blockedId })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerId, current.id))

    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        followerCount: sql<number>`count(${schema.follows.followerId})::int`,
      })
      .from(schema.user)
      .leftJoin(schema.neighborhoods, eq(schema.user.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.follows, eq(schema.follows.followingId, schema.user.id))
      .where(
        and(
          ne(schema.user.id, current.id),
          sql`${schema.user.handle} is not null`,
          notInArray(schema.user.id, alreadyFollowing),
          notInArray(schema.user.id, blocked),
        ),
      )
      .groupBy(schema.user.id, schema.neighborhoods.name)
      .orderBy(sql`count(${schema.follows.followerId}) desc`)
      .limit(12)

    return c.json({ users: rows })
  })

  // Match a device's contact phone numbers against Mesa users (App Store 5.1:
  // the client asks for contacts permission just-in-time before calling this).
  // We match on the exact stored phone number and never persist the uploaded
  // list. One round trip via inArray.
  .post('/contacts/match', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)

    const parsed = contactsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const numbers = [...new Set(parsed.data.phoneNumbers.map((n) => n.trim()))].filter(Boolean)
    if (numbers.length === 0) return c.json({ users: [] })

    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
      })
      .from(schema.user)
      .where(and(inArray(schema.user.phoneNumber, numbers), ne(schema.user.id, current.id)))
      .limit(200)

    return c.json({ users: rows })
  })
