import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// The discovery feed (M4) — the payoff of the core loop: what the people you
// follow ranked, and their vibe notes, most recent first. One round trip; the
// same block/ban visibility rules as the rest of the app. Cached client-side.
const { rankings, vibeNotes, restaurants, neighborhoods, follows, userBlocks, user, cheers } =
  schema

const PAGE = 20

export const feedRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  if (!me) return c.json({ error: 'unauthorized' }, 401)

  // Cursor pagination: ?before=<ISO date> pages older items, PAGE at a time.
  const beforeRaw = c.req.query('before')
  const before = beforeRaw ? new Date(beforeRaw) : null
  if (before && Number.isNaN(before.getTime())) {
    return c.json({ error: 'invalid_cursor' }, 400)
  }

  // People I follow, and blocks in either direction (defense-in-depth: a block
  // already severs follows, but we still filter so nothing leaks).
  const following = db
    .select({ id: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, me.id))
  const blockedByMe = db
    .select({ id: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, me.id))
  const blockedMe = db
    .select({ id: userBlocks.blockerId })
    .from(userBlocks)
    .where(eq(userBlocks.blockedId, me.id))

  const items = await db
    .select({
      rankingId: rankings.id,
      position: rankings.position,
      score: rankings.score,
      rankedAt: rankings.updatedAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
      },
      neighborhood: neighborhoods.name,
      note: vibeNotes.body,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
    .leftJoin(
      vibeNotes,
      and(
        eq(vibeNotes.userId, rankings.userId),
        eq(vibeNotes.restaurantId, rankings.restaurantId),
        isNull(vibeNotes.removedAt),
      ),
    )
    .where(
      and(
        inArray(rankings.userId, following),
        isNull(user.bannedAt),
        notInArray(rankings.userId, blockedByMe),
        notInArray(rankings.userId, blockedMe),
        ...(before ? [lt(rankings.updatedAt, before)] : []),
      ),
    )
    .orderBy(desc(rankings.updatedAt))
    .limit(PAGE)

  // Cheers counts for this page in ONE grouped query (fixed 2 round trips per
  // page regardless of item count — not N+1).
  const ids = items.map((i) => i.rankingId)
  const counts = ids.length
    ? await db
        .select({
          rankingId: cheers.rankingId,
          count: sql<number>`count(*)::int`,
          mine: sql<boolean>`bool_or(${cheers.userId} = ${me.id})`,
        })
        .from(cheers)
        .where(inArray(cheers.rankingId, ids))
        .groupBy(cheers.rankingId)
    : []
  const byRanking = new Map(counts.map((r) => [r.rankingId, r]))

  const last = items[items.length - 1]
  const nextCursor = items.length === PAGE && last ? last.rankedAt.toISOString() : null
  return c.json({
    feed: items.map((i) => ({
      ...i,
      cheersCount: byRanking.get(i.rankingId)?.count ?? 0,
      cheeredByMe: byRanking.get(i.rankingId)?.mine ?? false,
    })),
    nextCursor,
  })
})
