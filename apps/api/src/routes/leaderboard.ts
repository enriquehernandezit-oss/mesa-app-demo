import { db, schema } from '@mesa/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Citywide leaderboard (Beli-style): who has ranked the most places, all-time or
// this month. One grouped query; banned users excluded. Understated in the UI —
// brass numerals, no badges.
const { rankings, user, neighborhoods } = schema

export const leaderboardRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  if (!me) return c.json({ error: 'unauthorized' }, 401)
  const period = c.req.query('period') === 'month' ? 'month' : 'all'

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      handle: user.handle,
      image: user.image,
      neighborhood: neighborhoods.name,
      count: sql<number>`count(${rankings.id})::int`,
      avgScore: sql<number>`avg(${rankings.score})`,
    })
    .from(user)
    .innerJoin(rankings, eq(rankings.userId, user.id))
    .leftJoin(neighborhoods, eq(neighborhoods.id, user.neighborhoodId))
    .where(
      and(
        isNull(user.bannedAt),
        sql`${user.handle} is not null`,
        period === 'month' ? sql`${rankings.createdAt} > now() - interval '30 days'` : sql`true`,
      ),
    )
    .groupBy(user.id, user.name, user.handle, user.image, neighborhoods.name)
    .orderBy(sql`count(${rankings.id}) desc`)
    .limit(50)

  const myRank = rows.findIndex((r) => r.id === me.id)
  return c.json({ leaderboard: rows, myRank: myRank >= 0 ? myRank + 1 : null, period })
})
