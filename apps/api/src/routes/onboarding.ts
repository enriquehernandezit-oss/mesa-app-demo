import { db, schema } from '@mesa/db'
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { scoreFor } from '../lib/score'
import { requireAuth } from '../middleware/session'

// Everything the cold-start onboarding needs. The product's #1 risk is an empty
// first open, so these endpoints exist to make a brand-new profile immediately
// non-empty and non-friendless (BUILD_PLAN M2).

const rankingsSchema = z.object({
  // Ordered best-first, as the pairwise comparisons settled them.
  restaurantIds: z.array(z.string().uuid()).min(1).max(20),
})

const contactsSchema = z.object({
  phoneNumbers: z.array(z.string()).max(1000),
})

// Contact-match is an identity oracle: submit a phone number, learn whether it
// belongs to a Mesa user and who. Legitimate use is matching your own address
// book once at onboarding, so a per-user daily budget on how many numbers can
// be probed bounds bulk phone→identity enumeration without hurting the real
// flow. Best-effort in-memory sliding window (single Railway instance, resets
// on deploy) — a rate limiter, not a security boundary; the real defense is
// that matches are exact-only and the caller must already hold the numbers.
const CONTACT_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000
const CONTACT_MATCH_DAILY_BUDGET = 2000
const contactProbes = new Map<string, { at: number; n: number }[]>()
function overContactBudget(userId: string, count: number, now: number): boolean {
  const recent = (contactProbes.get(userId) ?? []).filter(
    (p) => now - p.at < CONTACT_MATCH_WINDOW_MS,
  )
  const used = recent.reduce((sum, p) => sum + p.n, 0)
  if (used + count > CONTACT_MATCH_DAILY_BUDGET) {
    contactProbes.set(userId, recent)
    return true
  }
  recent.push({ at: now, n: count })
  contactProbes.set(userId, recent)
  return false
}

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

  // The set of places to rank during onboarding — the curated cluster, so the
  // pairwise flow ("Vela or Lumbre?") has recognizable spots to compare. Bounded
  // to demo or editorial-list rows and ordered by how much they've been ranked
  // (most-known first): plain `ORDER BY name LIMIT 15` over the whole catalog
  // would, post-import (M6), make a newcomer's first impression the 15
  // alphabetically-first Foursquare rows (fast-food and all). (M7)
  .get('/candidates', async (c) => {
    const inAnyList = db
      .selectDistinct({ id: schema.listItems.restaurantId })
      .from(schema.listItems)
    const rows = await db
      .select({
        id: schema.restaurants.id,
        name: schema.restaurants.name,
        cuisine: schema.restaurants.cuisine,
        coverImageId: schema.restaurants.coverImageId,
        neighborhoodSlug: schema.neighborhoods.slug,
        neighborhoodName: schema.neighborhoods.name,
      })
      .from(schema.restaurants)
      .leftJoin(
        schema.neighborhoods,
        eq(schema.neighborhoods.id, schema.restaurants.neighborhoodId),
      )
      .leftJoin(schema.rankings, eq(schema.rankings.restaurantId, schema.restaurants.id))
      .where(
        and(
          isNull(schema.restaurants.removedAt),
          isNull(schema.restaurants.closedAt),
          or(eq(schema.restaurants.isDemo, true), inArray(schema.restaurants.id, inAnyList)),
        ),
      )
      .groupBy(schema.restaurants.id, schema.neighborhoods.slug, schema.neighborhoods.name)
      .orderBy(sql`count(${schema.rankings.id}) desc`, asc(schema.restaurants.name))
      .limit(15)
    const restaurants = rows.map(({ neighborhoodSlug, neighborhoodName, ...r }) => ({
      ...r,
      neighborhood:
        neighborhoodSlug && neighborhoodName
          ? { slug: neighborhoodSlug, name: neighborhoodName }
          : null,
    }))
    return c.json({ restaurants })
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
        // Scalar subquery (still one statement) — "41 ranked · Piantini" on the
        // empty-feed / start-with-these rows (Phase 6).
        rankedCount: sql<number>`(select count(*) from ${schema.rankings} where ${schema.rankings.userId} = ${schema.user.id})::int`,
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
    if (overContactBudget(current.id, numbers.length, Date.now())) {
      return c.json({ error: 'rate_limited' }, 429)
    }

    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
      })
      .from(schema.user)
      // Banned accounts are never surfaced, even by an exact phone match.
      .where(
        and(
          inArray(schema.user.phoneNumber, numbers),
          ne(schema.user.id, current.id),
          isNull(schema.user.bannedAt),
        ),
      )
      .limit(200)

    return c.json({ users: rows })
  })
