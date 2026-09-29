import { db, schema } from '@mesa/db'
import { and, eq, gt, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import {
  HALF_LIFE_DAYS,
  NEW_DAYS,
  type PopularAgg,
  WEEK_DAYS,
  cityMean,
  pageAfter,
  parseCursor,
  rankPopular,
} from '../lib/popular'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Popular (Feed → Popular): the city's places ranked by momentum × quality, best first,
// paged by cursor. The rules are lib/popular.ts (pure, tested); this file fetches the raw
// sums they need — three grouped reads over the whole city, run together, then ONE more
// for the friend line of just the places on the page. Never a query per place.
//
// Visibility is the app's usual: a banned account's rankings, saves and cheers don't
// count, and neither does anyone the member has blocked or who blocked them. Closed and
// removed places never appear. Nothing is cached here — the client holds a page for five
// minutes, and a ranking invalidates it.
const { rankings, restaurants, neighborhoods, user, savedPlaces, cheers } = schema

const DAY_MS = 86_400_000

type Me = AuthedEnv['Variables']['user']

// The person behind a ranking, save or cheer (the joined `user` row) counts only if they
// aren't banned and there's no block either way with the member.
const countable = (me: Me) => [
  isNull(user.bannedAt),
  notInArray(user.id, blockedByMe(me.id)),
  notInArray(user.id, blockedMe(me.id)),
]

type Place = PopularAgg & {
  name: string
  cuisine: string | null
  coverImageId: string | null
  priceTier: number | null
  neighborhood: string
  hood: string
  createdAt: Date
}

// One row per place anyone has ranked: who ranked it and their scores, and what happened
// in the week before `asOf`. The week's ranking weight is Σ score/100 · 0.5^(age /
// half-life), worked out here because the decay is per ranking, not per place. `asOf` is
// the caller's moment, not the database's `now()`, so every page of one scroll is scored
// against the same instant (see lib/popular.ts, "cursor"). Timestamps are UTC wall-clock,
// as everywhere else in the schema.
async function loadPlaces(me: Me, asOf: Date): Promise<Place[]> {
  const since = new Date(asOf.getTime() - WEEK_DAYS * DAY_MS)
  const week = gt(rankings.createdAt, since)
  const age = sql`greatest(0, extract(epoch from (${asOf.toISOString()}::timestamp - ${rankings.createdAt})))`
  const [ranked, saved, cheered] = await Promise.all([
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        priceTier: restaurants.priceTier,
        neighborhood: neighborhoods.name,
        hood: neighborhoods.slug,
        createdAt: restaurants.createdAt,
        rankers: sql<number>`count(*)::int`,
        sumScore: sql<number>`sum(${rankings.score})::float`,
        weekRankings: sql<number>`(count(*) filter (where ${week}))::int`,
        weekWeight: sql<number>`coalesce(sum(${rankings.score} / 100.0 * power(0.5, ${age} / ${HALF_LIFE_DAYS * 86_400})) filter (where ${week}), 0)::float`,
      })
      .from(rankings)
      .innerJoin(user, eq(user.id, rankings.userId))
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .innerJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(and(...countable(me), isNull(restaurants.closedAt), isNull(restaurants.removedAt)))
      .groupBy(restaurants.id, neighborhoods.name, neighborhoods.slug),
    db
      .select({ id: savedPlaces.restaurantId, n: sql<number>`count(*)::int` })
      .from(savedPlaces)
      .innerJoin(user, eq(user.id, savedPlaces.userId))
      .where(and(gte(savedPlaces.createdAt, since), ...countable(me)))
      .groupBy(savedPlaces.restaurantId),
    db
      .select({ id: rankings.restaurantId, n: sql<number>`count(*)::int` })
      .from(cheers)
      .innerJoin(rankings, eq(rankings.id, cheers.rankingId))
      .innerJoin(user, eq(user.id, cheers.userId))
      .where(and(gte(cheers.createdAt, since), ...countable(me)))
      .groupBy(rankings.restaurantId),
  ])
  const saves = new Map(saved.map((r) => [r.id, r.n]))
  const cheersBy = new Map(cheered.map((r) => [r.id, r.n]))
  return ranked.map((r) => ({
    ...r,
    saves: saves.get(r.id) ?? 0,
    cheers: cheersBy.get(r.id) ?? 0,
  }))
}

// Who I follow that ranked each of these places: how many, and the highest of them — the
// name and score the row's "Diego ranked it 9.6" line is built from. One grouped read.
async function loadFriendLines(me: Me, placeIds: string[]) {
  if (placeIds.length === 0)
    return new Map<string, { count: number; name: string; score: number }>()
  const rows = await db
    .select({
      id: rankings.restaurantId,
      count: sql<number>`count(*)::int`,
      name: sql<string>`(array_agg(${user.name} order by ${rankings.score} desc, ${user.id}))[1]`,
      score: sql<number>`max(${rankings.score})::float`,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .where(
      and(
        inArray(rankings.restaurantId, placeIds),
        inArray(rankings.userId, followingIds(me.id)),
        ...countable(me),
      ),
    )
    .groupBy(rankings.restaurantId)
  return new Map(
    rows.map((r) => [
      r.id,
      { count: r.count, name: (r.name || '').trim().split(/\s+/)[0] || r.name, score: r.score },
    ]),
  )
}

export const popularRoutes = new Hono<AuthedEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  const cursorRaw = c.req.query('cursor')
  const cursor = cursorRaw ? parseCursor(cursorRaw) : null
  if (cursorRaw && !cursor) return c.json({ error: 'invalid_cursor' }, 400)
  // A neighborhood, by slug. The whole city sets the average that small samples drift
  // to, so the choice narrows the list AFTER it is scored, never the scoring.
  const hood = c.req.query('hood') || null

  // The first page is scored as of now; the rest, as of the moment their cursor names.
  const now = new Date()
  const asOf = cursor ? new Date(Math.min(cursor.asOf, now.getTime())) : now
  const all = await loadPlaces(me, asOf)
  const mean = cityMean(all)
  const shown = hood ? all.filter((p) => p.hood === hood) : all
  const { page, next } = pageAfter(rankPopular(shown, mean), cursor, asOf.getTime())

  const friends = await loadFriendLines(
    me,
    page.map((e) => e.agg.id),
  )
  const newSince = now.getTime() - NEW_DAYS * DAY_MS
  return c.json({
    items: page.map(({ agg: p, phase }) => ({
      phase,
      restaurant: {
        id: p.id,
        name: p.name,
        cuisine: p.cuisine,
        coverImageId: p.coverImageId,
        priceTier: p.priceTier,
        neighborhood: p.neighborhood,
      },
      // The average of everyone's rankings — "Mesa's" score, as on the place page.
      score: p.sumScore / p.rankers,
      rankers: p.rankers,
      isNew: p.createdAt.getTime() > newSince,
      friends: friends.get(p.id) ?? { count: 0, name: null, score: null },
    })),
    nextCursor: next,
  })
})
