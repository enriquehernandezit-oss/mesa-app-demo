import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// The activity feed behind the bell: cheers on my rankings, new followers, and
// friends ranking spots I've saved. Three fixed queries merged and sorted —
// count never depends on data size (no N+1).
const { cheers, rankings, restaurants, follows, savedPlaces, user } = schema

export interface ActivityItem {
  type: 'cheers' | 'follow' | 'saved_ranked'
  at: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant?: { id: string; name: string } | null
}

export const activityRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  if (!me) return c.json({ error: 'unauthorized' }, 401)

  // 1) Who cheered my rankings.
  const cheered = await db
    .select({
      at: cheers.createdAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: { id: restaurants.id, name: restaurants.name },
    })
    .from(cheers)
    .innerJoin(rankings, eq(rankings.id, cheers.rankingId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .innerJoin(user, eq(user.id, cheers.userId))
    .where(and(eq(rankings.userId, me.id), ne(cheers.userId, me.id), isNull(user.bannedAt)))
    .orderBy(desc(cheers.createdAt))
    .limit(25)

  // 2) New followers.
  const followed = await db
    .select({
      at: follows.createdAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
    })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followerId))
    .where(and(eq(follows.followingId, me.id), isNull(user.bannedAt)))
    .orderBy(desc(follows.createdAt))
    .limit(25)

  // 3) People I follow ranked a spot on my want-to-try list.
  const following = db
    .select({ id: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, me.id))
  const mySaved = db
    .select({ id: savedPlaces.restaurantId })
    .from(savedPlaces)
    .where(eq(savedPlaces.userId, me.id))
  const savedRanked = await db
    .select({
      at: rankings.updatedAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: { id: restaurants.id, name: restaurants.name },
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .where(
      and(
        inArray(rankings.userId, following),
        inArray(rankings.restaurantId, mySaved),
        isNull(user.bannedAt),
      ),
    )
    .orderBy(desc(rankings.updatedAt))
    .limit(15)

  const items: ActivityItem[] = [
    ...cheered.map((x) => ({
      type: 'cheers' as const,
      at: x.at.toISOString(),
      user: x.user,
      restaurant: x.restaurant,
    })),
    ...followed.map((x) => ({
      type: 'follow' as const,
      at: x.at.toISOString(),
      user: x.user,
      restaurant: null,
    })),
    ...savedRanked.map((x) => ({
      type: 'saved_ranked' as const,
      at: x.at.toISOString(),
      user: x.user,
      restaurant: x.restaurant,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 40)

  return c.json({ activity: items })
})
