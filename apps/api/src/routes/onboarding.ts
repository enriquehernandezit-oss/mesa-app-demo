import { db, hashPhone, normalizePhone, schema } from '@mesa/db'
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { currentOrder, lockUserList, rewrite } from '../lib/rankingOrder'
import { spendMatchBudget } from '../lib/usageBudget'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Everything the cold-start onboarding needs. The product's #1 risk is an empty
// first open, so these endpoints exist to make a brand-new profile immediately
// non-empty and non-friendless (BUILD_PLAN M2).

// Unset -> contact matching is fully dark, same convention as routes/social.ts.
const PHONE_MATCH_SECRET = process.env.PHONE_MATCH_SECRET

const rankingsSchema = z.object({
  // Ordered best-first, as the pairwise comparisons settled them.
  restaurantIds: z.array(z.string().uuid()).min(1).max(20),
})

const contactsSchema = z.object({
  // A real address book can run past the old 1000; the budget, not the request size, bounds the day.
  phoneNumbers: z.array(z.string().max(32)).max(3000),
})

export const onboardingRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Santo Domingo's sectors, for every neighborhood picker and filter. Not the areas made for places
  // elsewhere (lib/geo.ts) — those are labels, not choices.
  .get('/neighborhoods', async (c) => {
    const rows = await db.query.neighborhoods.findMany({
      columns: { slug: true, name: true },
      where: (n, { eq }) => eq(n.listed, true),
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

  // Persist the ordered starter list, then densely renumber the WHOLE list
  // (this call's ids first, in the given order, then any pre-existing rankings
  // that weren't in this submission, in their prior relative order). This
  // endpoint can be called again after a user already has rankings — a plain
  // per-submitted-id upsert left those older rows' positions untouched,
  // producing duplicate positions the moment the two sets overlapped in range.
  .post('/rankings', async (c) => {
    const current = c.get('user')

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

    const total = await db.transaction(async (tx) => {
      await lockUserList(tx, current.id)
      const idSet = new Set(ids)
      const rest = (await currentOrder(tx, current.id)).filter((id) => !idSet.has(id))
      const order = [...ids, ...rest]
      await rewrite(tx, current.id, order)
      return order.length
    })

    return c.json({ ok: true, count: total })
  })

  // Friend suggestions so a new profile is never friendless. People the user
  // doesn't already follow (and hasn't blocked), most-followed first, in one
  // round trip. With the seed cluster loaded, this returns the demo friends.
  .get('/suggested-friends', async (c) => {
    const current = c.get('user')

    const alreadyFollowing = followingIds(current.id)
    // Both directions — see lib/visibility: a read path that filters one way
    // leaks half the block, and this one would suggest following the person.
    const blocked = blockedByMe(current.id)
    const blockedMeIds = blockedMe(current.id)

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
          notInArray(schema.user.id, blockedMeIds),
          // Never suggest a suspended account as someone to follow.
          isNull(schema.user.bannedAt),
        ),
      )
      .groupBy(schema.user.id, schema.neighborhoods.name)
      .orderBy(sql`count(${schema.follows.followerId}) desc`)
      .limit(12)

    return c.json({ users: rows })
  })

  // Match a device's contact phone numbers against Mesa users who chose to be found (App Store
  // 5.1: the client asks for contacts permission just-in-time before calling this). The numbers
  // are normalised and hashed here, in the request, and never stored — the same matcher and the
  // same daily budget as POST /social/contacts/match, with the same exclusions: banned accounts
  // and anyone blocked either way never appear. (This route used to compare the raw strings to
  // the sign-in phone column, which missed most contacts and ignored blocks.)
  .post('/contacts/match', async (c) => {
    const current = c.get('user')
    if (!PHONE_MATCH_SECRET) return c.json({ users: [] })

    const parsed = contactsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const hashes = new Set<string>()
    for (const raw of parsed.data.phoneNumbers) {
      const e164 = normalizePhone(raw.trim())
      if (e164) hashes.add(hashPhone(e164, PHONE_MATCH_SECRET))
    }
    if (hashes.size === 0) return c.json({ users: [] })
    if (!(await spendMatchBudget(current.id, hashes.size))) {
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
      .where(
        and(
          inArray(schema.user.phoneHash, [...hashes]),
          ne(schema.user.id, current.id),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(current.id)),
          notInArray(schema.user.id, blockedMe(current.id)),
        ),
      )
      .limit(200)

    return c.json({ users: rows })
  })
