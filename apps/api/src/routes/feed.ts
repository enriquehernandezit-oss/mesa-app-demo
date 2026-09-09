import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AuthedEnv } from '../context'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// The discovery feed (M4) — the payoff of the core loop: what the people you
// follow ranked, and their vibe notes, most recent first. One round trip; the
// same block/ban visibility rules as the rest of the app. Cached client-side.
const { rankings, vibeNotes, restaurants, neighborhoods, user, cheers, dishes } = schema

const PAGE = 20

// Feed rows are keyed to a ranking's CREATION, not its last edit: rewrite() in
// rankings.ts upserts a member's whole list on every re-rank, so paging on
// updatedAt made one new rank republish their entire history to the top of
// followers' feeds, and identical timestamps across that whole-list write
// broke `lt()` paging outright (duplicate and skipped rows across pages).
// createdAt never moves once a ranking exists, so (createdAt, id) is a stable
// total order — the id half breaks ties between rows created in the same
// instant, which a plain date cursor can't page past correctly.
function parseCursor(raw: string | undefined): { at: Date; id: string | null } | null {
  if (!raw) return null
  const i = raw.lastIndexOf('_')
  // A UUID never contains '_', so splitting on the last one is unambiguous.
  // No id half (an older client's bare-date cursor) is tolerated: still page
  // on date alone rather than reject it.
  const datePart = i === -1 ? raw : raw.slice(0, i)
  const idPart = i === -1 ? null : raw.slice(i + 1)
  const at = new Date(datePart)
  if (Number.isNaN(at.getTime())) return null
  return { at, id: idPart || null }
}

export const feedRoutes = new Hono<AuthedEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')

  const beforeRaw = c.req.query('before')
  const before = beforeRaw ? parseCursor(beforeRaw) : null
  if (beforeRaw && !before) {
    return c.json({ error: 'invalid_cursor' }, 400)
  }

  // People I follow, and blocks in either direction (defense-in-depth: a block
  // already severs follows, but we still filter so nothing leaks) —
  // followingIds/blockedByMe/blockedMe below (lib/visibility).

  // The latest visible dish per ranking — a dish is evidence attached to a
  // ranking, so it rides on the same feed row (no second feed type, no cursor
  // change). DISTINCT ON keeps it to the newest one.
  const latestDish = db
    .selectDistinctOn([dishes.rankingId], {
      rankingId: dishes.rankingId,
      id: dishes.id,
      imageId: dishes.imageId,
      name: dishes.name,
      grain: dishes.grain,
    })
    .from(dishes)
    .where(isNull(dishes.removedAt))
    .orderBy(dishes.rankingId, desc(dishes.createdAt))
    .as('latest_dish')

  const items = await db
    .select({
      rankingId: rankings.id,
      position: rankings.position,
      score: rankings.score,
      // The moment this ranking was FIRST created — see parseCursor's comment
      // above for why this reads createdAt, not updatedAt. On a feed card this
      // is "first ranked", not "last edited"; a re-rank doesn't resurface it.
      rankedAt: rankings.createdAt,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        priceTier: restaurants.priceTier,
        closesAt: restaurants.closesAt,
      },
      neighborhood: neighborhoods.name,
      note: vibeNotes.body,
      dishId: latestDish.id,
      dishImage: latestDish.imageId,
      dishName: latestDish.name,
      dishGrain: latestDish.grain,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
    .leftJoin(latestDish, eq(latestDish.rankingId, rankings.id))
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
        inArray(rankings.userId, followingIds(me.id)),
        isNull(user.bannedAt),
        notInArray(rankings.userId, blockedByMe(me.id)),
        notInArray(rankings.userId, blockedMe(me.id)),
        // Tuple comparison on (createdAt, id): strictly older rows, plus rows
        // created at the exact same instant but with a smaller id — the tie
        // a plain date comparison can't break, which a whole-list rewrite (see
        // rankings.ts) makes a real case, not a hypothetical one. A bare-date
        // cursor (before.id null, from an older client) falls back to the
        // date-only comparison it always did.
        ...(before
          ? [
              before.id
                ? or(
                    lt(rankings.createdAt, before.at),
                    and(eq(rankings.createdAt, before.at), lt(rankings.id, before.id)),
                  )
                : lt(rankings.createdAt, before.at),
            ]
          : []),
      ),
    )
    .orderBy(desc(rankings.createdAt), desc(rankings.id))
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
  const nextCursor =
    items.length === PAGE && last ? `${last.rankedAt.toISOString()}_${last.rankingId}` : null
  return c.json({
    feed: items.map((i) => ({
      ...i,
      cheersCount: byRanking.get(i.rankingId)?.count ?? 0,
      cheeredByMe: byRanking.get(i.rankingId)?.mine ?? false,
    })),
    nextCursor,
  })
})

// GET /feed/recs ("For you") was removed: it had no callers. Explore's no-query
// browse state already runs that exact query — friends' average over places you
// haven't ranked — on a dedicated tab, which is where people look for it.
