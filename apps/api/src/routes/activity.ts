import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// The activity feed behind the bell: cheers on my rankings, new followers, and
// friends ranking spots I've saved. Three fixed queries merged and sorted —
// count never depends on data size (no N+1).
const { cheers, rankings, restaurants, follows, savedPlaces, user, userBlocks } = schema

export interface ActivityItem {
  type: 'cheers' | 'follow' | 'saved_ranked' | 'friend_ranked'
  at: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant?: { id: string; name: string; coverImageId: string | null } | null
  // friend_ranked carries the comparison numbers ("ranked Lumbre 9.1 — above
  // your 8.8"). score = their score, yourScore = mine (both 0–100, shown /10).
  score?: number | null
  yourScore?: number | null
  followsBack?: boolean // follow rows: do I already follow them back?
}

export const activityRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  if (!me) return c.json({ error: 'unauthorized' }, 401)

  // Anyone I've blocked, or who has blocked me — filtered out of every section
  // below (a block is symmetric). Without this a blocked user could still land
  // in your bell by cheering your ranking or following you — a block bypass.
  // Same two-subquery shape the feed and profile reads use (feed.ts).
  const blockedByMe = db
    .select({ id: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, me.id))
  const blockedMe = db
    .select({ id: userBlocks.blockerId })
    .from(userBlocks)
    .where(eq(userBlocks.blockedId, me.id))
  const notBlocked = and(notInArray(user.id, blockedByMe), notInArray(user.id, blockedMe))

  // 1) Who cheered my rankings.
  const cheered = await db
    .select({
      at: cheers.createdAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      },
    })
    .from(cheers)
    .innerJoin(rankings, eq(rankings.id, cheers.rankingId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .innerJoin(user, eq(user.id, cheers.userId))
    .where(
      and(eq(rankings.userId, me.id), ne(cheers.userId, me.id), isNull(user.bannedAt), notBlocked),
    )
    .orderBy(desc(cheers.createdAt))
    .limit(25)

  // 2) New followers. `followsBack` says whether I already follow them, so the
  // row's Follow button knows to render as "Following".
  const back = alias(follows, 'back')
  const followed = await db
    .select({
      at: follows.createdAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      followsBack: sql<boolean>`${back.followerId} is not null`,
    })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followerId))
    .leftJoin(back, and(eq(back.followerId, me.id), eq(back.followingId, follows.followerId)))
    .where(and(eq(follows.followingId, me.id), isNull(user.bannedAt), notBlocked))
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
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      },
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .where(
      and(
        inArray(rankings.userId, following),
        inArray(rankings.restaurantId, mySaved),
        isNull(user.bannedAt),
        notBlocked,
      ),
    )
    .orderBy(desc(rankings.updatedAt))
    .limit(15)

  // 4) People I follow ranked a place I've ALSO ranked → the comparison row
  // ("ranked Lumbre 9.1 — above your 8.8"). My score comes in via a self-join on
  // the same restaurant; disjoint from (3), which is want-to-try places.
  const myRank = alias(rankings, 'my_rank')
  const friendRanked = await db
    .select({
      at: rankings.updatedAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      },
      score: rankings.score,
      yourScore: myRank.score,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .innerJoin(
      myRank,
      and(eq(myRank.restaurantId, rankings.restaurantId), eq(myRank.userId, me.id)),
    )
    .where(and(inArray(rankings.userId, following), isNull(user.bannedAt), notBlocked))
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
      followsBack: x.followsBack,
    })),
    ...savedRanked.map((x) => ({
      type: 'saved_ranked' as const,
      at: x.at.toISOString(),
      user: x.user,
      restaurant: x.restaurant,
    })),
    ...friendRanked.map((x) => ({
      type: 'friend_ranked' as const,
      at: x.at.toISOString(),
      user: x.user,
      restaurant: x.restaurant,
      score: x.score,
      yourScore: x.yourScore,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 40)

  return c.json({ activity: items })
})
