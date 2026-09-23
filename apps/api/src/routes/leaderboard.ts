import { db, schema } from '@mesa/db'
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import { blockedByMe, blockedMe, citywideRank, followerIds, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Citywide leaderboard (Beli-style): who has ranked the most places, all-time or
// this month. One grouped query; banned users excluded. Understated in the UI —
// brass numerals, no badges.
//
// scope=friends (M7) narrows the same query to followingIds ∪ followerIds ∪
// me — "friends" in the loose Instagram sense this app uses everywhere else
// (no mutual-follow requirement), not a separate relationship.
const { rankings, user, neighborhoods } = schema

export const leaderboardRoutes = new Hono<AuthedEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  const period = c.req.query('period') === 'month' ? 'month' : 'all'
  const scope = c.req.query('scope') === 'friends' ? 'friends' : 'all'

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      handle: user.handle,
      image: user.image,
      neighborhood: neighborhoods.name,
      count: sql<number>`count(${rankings.id})::int`,
      avgScore: sql<number>`avg(${rankings.score})::float`,
    })
    .from(user)
    .innerJoin(rankings, eq(rankings.userId, user.id))
    .leftJoin(neighborhoods, eq(neighborhoods.id, user.neighborhoodId))
    .where(
      and(
        isNull(user.bannedAt),
        sql`${user.handle} is not null`,
        period === 'month' ? sql`${rankings.createdAt} > now() - interval '30 days'` : sql`true`,
        // Block visibility is symmetric everywhere else in the API — this was
        // the one read path that filtered neither direction, so a blocked
        // user still showed up here for the person who blocked them (and
        // vice versa).
        notInArray(user.id, blockedByMe(me.id)),
        notInArray(user.id, blockedMe(me.id)),
        scope === 'friends'
          ? or(
              inArray(user.id, followingIds(me.id)),
              inArray(user.id, followerIds(me.id)),
              eq(user.id, me.id),
            )
          : sql`true`,
      ),
    )
    .groupBy(user.id, user.name, user.handle, user.image, neighborhoods.name)
    .orderBy(sql`count(${rankings.id}) desc`)
    .limit(50)

  // Friends scope, or the month toggle: your position within this (typically
  // well under 50, or period-filtered either way) list is the meaningful
  // number, same as before. Only all-time + citywide reaches for the real
  // unbounded rank — findIndex on a top-50-capped list used to read null for
  // almost everyone there, and disagreed with the profile card's own
  // citywide rank (also always all-time) — see citywideRank's own header for
  // why the two now share one code path. citywideRank's "ahead" count is
  // itself always all-time, so reusing it for the month toggle would compare
  // a monthly count against an all-time population — not a fix, a different bug.
  let myRank: number | null = null
  if (scope === 'friends' || period === 'month') {
    const i = rows.findIndex((r) => r.id === me.id)
    myRank = i >= 0 ? i + 1 : null
  } else {
    const mine = rows.find((r) => r.id === me.id)
    const myCount = mine ? mine.count : await db.$count(rankings, eq(rankings.userId, me.id))
    myRank = myCount > 0 ? await citywideRank(me.id, myCount) : null
  }

  return c.json({ leaderboard: rows, myRank, period, scope })
})
