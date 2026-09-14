import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import type { AuthedEnv } from '../context'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// The activity feed behind the bell: cheers on my rankings, new followers,
// friends ranking spots I've saved, and (M3) plan invites and replies. Fixed
// queries merged and sorted — count never depends on data size (no N+1).
const {
  cheers,
  rankings,
  restaurants,
  follows,
  savedPlaces,
  user,
  plans,
  planOptions,
  planInvites,
} = schema

// NOTE: duplicated by hand in apps/mobile/src/lib/types.ts (that app can't
// import this — see that file's own note on why). Keep the two in sync.
export interface ActivityItem {
  type: 'cheers' | 'follow' | 'saved_ranked' | 'friend_ranked' | 'plan_invite' | 'plan_reply'
  at: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant?: { id: string; name: string; coverImageId: string | null } | null
  // friend_ranked carries the comparison numbers ("ranked Lumbre 9.1 — above
  // your 8.8"). score = their score, yourScore = mine (both 0–100, shown /10).
  score?: number | null
  yourScore?: number | null
  followsBack?: boolean // follow rows: do I already follow them back?
  planId?: string // plan_invite / plan_reply
  startsAt?: string // plan_invite — when the plan is
  reply?: 'going' | 'maybe' // plan_reply — what the invitee answered
}

export const activityRoutes = new Hono<AuthedEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')

  // Anyone I've blocked, or who has blocked me — filtered out of every section
  // below (a block is symmetric). Without this a blocked user could still land
  // in your bell by cheering your ranking or following you — a block bypass.
  const notBlocked = and(
    notInArray(user.id, blockedByMe(me.id)),
    notInArray(user.id, blockedMe(me.id)),
  )

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
  const following = followingIds(me.id)
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

  // A plan's "restaurant" for activity purposes: the confirmed spot, or the
  // first candidate while still voting. Shared shape for both queries below.
  const firstOpt = alias(planOptions, 'first_opt')
  const planRestaurant = sql`coalesce(${plans.chosenRestaurantId}, ${firstOpt.restaurantId})`

  // 5) Plans I've been invited to (host = whoever invited me). Cancelled
  // plans don't show up here — see the "cancelled plans" comment on GET / for
  // why that's the deliberate choice, not an oversight.
  const planInvited = await db
    .select({
      at: planInvites.createdAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      },
      planId: plans.id,
      startsAt: plans.startsAt,
    })
    .from(planInvites)
    .innerJoin(plans, eq(plans.id, planInvites.planId))
    .innerJoin(user, eq(user.id, plans.hostId))
    .leftJoin(firstOpt, and(eq(firstOpt.planId, plans.id), eq(firstOpt.position, 0)))
    .leftJoin(restaurants, eq(restaurants.id, planRestaurant))
    .where(
      and(
        eq(planInvites.userId, me.id),
        ne(plans.status, 'cancelled'),
        isNull(user.bannedAt),
        notBlocked,
      ),
    )
    .orderBy(desc(planInvites.createdAt))
    .limit(15)

  // 6) Replies to plans I HOST — only the positive ones ("going"/"maybe") are
  // worth a bell entry; a decline isn't news the host needs pushed at them.
  const planReplied = await db
    .select({
      at: planInvites.repliedAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
      },
      planId: plans.id,
      reply: planInvites.reply,
    })
    .from(planInvites)
    .innerJoin(plans, eq(plans.id, planInvites.planId))
    .innerJoin(user, eq(user.id, planInvites.userId))
    .leftJoin(firstOpt, and(eq(firstOpt.planId, plans.id), eq(firstOpt.position, 0)))
    .leftJoin(restaurants, eq(restaurants.id, planRestaurant))
    .where(
      and(
        eq(plans.hostId, me.id),
        inArray(planInvites.reply, ['going', 'maybe']),
        sql`${planInvites.repliedAt} is not null`,
        ne(plans.status, 'cancelled'),
        isNull(user.bannedAt),
        notBlocked,
      ),
    )
    .orderBy(desc(planInvites.repliedAt))
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
    ...planInvited.map((x) => ({
      type: 'plan_invite' as const,
      at: x.at.toISOString(),
      user: x.user,
      restaurant: x.restaurant,
      planId: x.planId,
      startsAt: x.startsAt.toISOString(),
    })),
    // repliedAt is nullable at the type level (the column allows it before a
    // reply lands) and reply is the full 4-value enum — the WHERE clause above
    // already narrows both, but flatMap re-checks them here so TS narrows the
    // type too instead of trusting the query blind.
    ...planReplied.flatMap((x) =>
      x.at && (x.reply === 'going' || x.reply === 'maybe')
        ? [
            {
              type: 'plan_reply' as const,
              at: x.at.toISOString(),
              user: x.user,
              restaurant: x.restaurant,
              planId: x.planId,
              reply: x.reply,
            },
          ]
        : [],
    ),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 40)

  return c.json({ activity: items })
})
