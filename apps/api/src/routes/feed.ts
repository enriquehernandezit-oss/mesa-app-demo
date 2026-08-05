import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// The discovery feed (M4) — the payoff of the core loop: what the people you
// follow ranked, and their vibe notes, most recent first. One round trip; the
// same block/ban visibility rules as the rest of the app. Cached client-side.
const { rankings, vibeNotes, restaurants, neighborhoods, follows, userBlocks, user } = schema

export const feedRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  if (!me) return c.json({ error: 'unauthorized' }, 401)

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
      restaurant: { id: restaurants.id, name: restaurants.name, cuisine: restaurants.cuisine },
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
      ),
    )
    .orderBy(desc(rankings.updatedAt))
    .limit(60)

  return c.json({ feed: items })
})
