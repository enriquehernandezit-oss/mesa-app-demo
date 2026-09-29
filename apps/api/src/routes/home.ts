import { db, schema, tasteMatch } from '@mesa/db'
import { aliasedTable, and, desc, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import {
  type FriendSignal,
  RECENT_DAYS,
  SIX,
  type SixCandidate,
  pickTonight,
  rankSix,
  selectTonight,
} from '../lib/home'
import { sdHour } from '../lib/sdTime'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'
import { tonightEvents } from './events'

// The top of the Feed in one round trip (Redesign 2): "Your six", the "Tonight" card,
// and "New near you". The rules are lib/home.ts (pure, tested); this file fetches what
// they need, in a fixed number of queries whatever the size of the member's graph (no
// per-place, no per-friend lookups), under the same follow/block/ban visibility as the
// rest of the app. Nothing is cached here — the client holds it until 5 AM Santo Domingo
// and refreshes it when the member ranks or saves.
const { rankings, restaurants, neighborhoods, user, savedPlaces, userFavoriteNeighborhoods } =
  schema

const DAY_MS = 86_400_000
const TREND_DAYS = 30
const NEW_DAYS = 21
const NEW_MAX = 8

type Me = AuthedEnv['Variables']['user']

// A place the member could actually go to: not closed for good, not removed by
// moderation.
const openPlace = and(isNull(restaurants.closedAt), isNull(restaurants.removedAt))

const placeCols = {
  id: restaurants.id,
  name: restaurants.name,
  cuisine: restaurants.cuisine,
  coverImageId: restaurants.coverImageId,
  priceTier: restaurants.priceTier,
  closesAt: restaurants.closesAt,
  neighborhoodId: restaurants.neighborhoodId,
  neighborhood: neighborhoods.name,
}
type Place = {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  priceTier: number | null
  closesAt: string | null
  neighborhoodId: string
  neighborhood: string | null
}
const publicPlace = (p: Place) => ({
  id: p.id,
  name: p.name,
  cuisine: p.cuisine,
  coverImageId: p.coverImageId,
  priceTier: p.priceTier,
  neighborhood: p.neighborhood,
})

// The places the member has already ranked — never suggested back to them.
const rankedByMe = (userId: string) =>
  db.select({ id: rankings.restaurantId }).from(rankings).where(eq(rankings.userId, userId))

// The member's own neighborhoods: their home sector plus their "go-to" ones. Two tiny
// reads, run together.
async function ownNeighborhoodIds(me: Me): Promise<Set<string>> {
  const [home, favorites] = await Promise.all([
    db.select({ id: user.neighborhoodId }).from(user).where(eq(user.id, me.id)),
    db
      .select({ id: userFavoriteNeighborhoods.neighborhoodId })
      .from(userFavoriteNeighborhoods)
      .where(eq(userFavoriteNeighborhoods.userId, me.id)),
  ])
  return new Set([...home, ...favorites].map((r) => r.id).filter((id): id is string => id != null))
}

type SixItem = SixCandidate & { place: Place }

async function loadSix(me: Me, now: Date, ownHoods: Set<string>) {
  const since = new Date(now.getTime() - RECENT_DAYS * DAY_MS)

  const [friendRows, tasteRows, savedRows] = await Promise.all([
    // What people I follow ranked in the last two weeks, on places I could go to and
    // haven't ranked. (blockedByMe/blockedMe: a block already severs follows, but a
    // read still filters both directions so nothing leaks.)
    db
      .select({
        ...placeCols,
        friendId: rankings.userId,
        friendName: user.name,
        score: rankings.score,
        rankedAt: rankings.createdAt,
      })
      .from(rankings)
      .innerJoin(user, eq(user.id, rankings.userId))
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(
        and(
          inArray(rankings.userId, followingIds(me.id)),
          isNull(user.bannedAt),
          notInArray(rankings.userId, blockedByMe(me.id)),
          notInArray(rankings.userId, blockedMe(me.id)),
          gte(rankings.createdAt, since),
          openPlace,
          notInArray(restaurants.id, rankedByMe(me.id)),
        ),
      )
      .orderBy(desc(rankings.createdAt))
      .limit(300),
    // How alike my taste is to every friend's, for ALL friends at once: the places we
    // both ranked, grouped by friend — the same shape as GET /social/suggestions'
    // taste tier, run over the people I follow instead of everyone.
    (() => {
      const mine = aliasedTable(rankings, 'mine')
      return db
        .select({
          friendId: rankings.userId,
          shared: sql<number>`count(*)::int`,
          avgGap: sql<number>`avg(abs(${mine.score} - ${rankings.score}))::float`,
        })
        .from(mine)
        .innerJoin(rankings, eq(rankings.restaurantId, mine.restaurantId))
        .where(and(eq(mine.userId, me.id), inArray(rankings.userId, followingIds(me.id))))
        .groupBy(rankings.userId)
    })(),
    // What I saved to try and haven't ranked since.
    db
      .select(placeCols)
      .from(savedPlaces)
      .innerJoin(restaurants, eq(restaurants.id, savedPlaces.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(
        and(
          eq(savedPlaces.userId, me.id),
          openPlace,
          notInArray(restaurants.id, rankedByMe(me.id)),
        ),
      ),
  ])

  const matchByFriend = new Map(tasteRows.map((t) => [t.friendId, tasteMatch(t.avgGap, t.shared)]))

  const byId = new Map<string, SixItem>()
  const item = (p: Place): SixItem => {
    let c = byId.get(p.id)
    if (!c) {
      c = {
        id: p.id,
        cuisine: p.cuisine,
        neighborhoodId: p.neighborhoodId,
        hasPhoto: Boolean(p.coverImageId),
        closesAt: p.closesAt,
        saved: false,
        ownHood: ownHoods.has(p.neighborhoodId),
        friends: [],
        trending: 0,
        place: p,
      }
      byId.set(p.id, c)
    }
    return c
  }
  for (const r of friendRows) {
    const signal: FriendSignal = {
      name: (r.friendName || '').trim().split(/\s+/)[0] || r.friendName,
      score: r.score,
      ageDays: (now.getTime() - r.rankedAt.getTime()) / DAY_MS,
      match: matchByFriend.get(r.friendId) ?? null,
    }
    item(r).friends.push(signal)
  }
  for (const p of savedRows) item(p).saved = true

  let picks = rankSix([...byId.values()], sdHour(now))
  // The member's own friends and saves came up short (a new member, mostly): let the
  // city's own ranking fill the gap — one more query, only when it is needed.
  if (picks.length < SIX) {
    for (const t of await loadTrending(me, now, ownHoods)) {
      if (!byId.has(t.id)) byId.set(t.id, t)
    }
    picks = rankSix([...byId.values()], sdHour(now))
  }
  return picks.map(({ candidate, reason }) => ({
    restaurant: publicPlace((candidate as SixItem).place),
    reason,
  }))
}

// Places the whole city ranked lately, most-ranked first. Its standing score is modest
// on purpose (at most ~5.8): a fill, never a rival to a friend's ranking.
async function loadTrending(me: Me, now: Date, ownHoods: Set<string>): Promise<SixItem[]> {
  const since = new Date(now.getTime() - TREND_DAYS * DAY_MS)
  const rows = await db
    .select({
      ...placeCols,
      rankers: sql<number>`count(distinct ${rankings.userId})::int`,
      avgScore: sql<number>`avg(${rankings.score})::float`,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
    .where(
      and(
        gte(rankings.createdAt, since),
        isNull(user.bannedAt),
        notInArray(rankings.userId, blockedByMe(me.id)),
        notInArray(rankings.userId, blockedMe(me.id)),
        openPlace,
        notInArray(restaurants.id, rankedByMe(me.id)),
      ),
    )
    .groupBy(restaurants.id, neighborhoods.name)
    .orderBy(desc(sql`count(distinct ${rankings.userId})`), desc(sql`avg(${rankings.score})`))
    .limit(24)
  return rows.map((r) => ({
    id: r.id,
    cuisine: r.cuisine,
    neighborhoodId: r.neighborhoodId,
    hasPhoto: Boolean(r.coverImageId),
    closesAt: r.closesAt,
    saved: false,
    ownHood: ownHoods.has(r.neighborhoodId),
    friends: [],
    trending: (r.avgScore / 10) * Math.min(1, r.rankers / 5) * 0.6,
    place: r,
  }))
}

// Tonight's pick, for a night with no events: the place still open late that people I
// follow ranked highest, that I haven't ranked and that isn't already in my six.
// Exported for the DB test — the route only asks for it when there are no events.
export async function loadTonightPick(me: Me, excludeIds: Set<string>) {
  const rows = await db
    .select({
      ...placeCols,
      restaurantId: restaurants.id,
      userId: rankings.userId,
      userName: user.name,
      score: rankings.score,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
    .where(
      and(
        inArray(rankings.userId, followingIds(me.id)),
        isNull(user.bannedAt),
        notInArray(rankings.userId, blockedByMe(me.id)),
        notInArray(rankings.userId, blockedMe(me.id)),
        openPlace,
        sql`${restaurants.closesAt} is not null`,
        notInArray(restaurants.id, rankedByMe(me.id)),
      ),
    )
    .orderBy(desc(rankings.score))
    .limit(200)
  const pick = pickTonight(rows, excludeIds)
  if (!pick) return null
  return {
    restaurant: publicPlace(pick.row),
    friend: { name: pick.row.userName },
    score: pick.row.score,
    friendCount: pick.friendCount,
  }
}

// Places added in the last three weeks that someone has ranked, in the member's own
// neighborhoods (or anywhere, for a member with none set), that they haven't ranked.
async function loadNewNearYou(me: Me, now: Date, ownHoods: Set<string>, excludeIds: Set<string>) {
  const since = new Date(now.getTime() - NEW_DAYS * DAY_MS)
  const rows = await db
    .select(placeCols)
    .from(restaurants)
    .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
    .where(
      and(
        openPlace,
        gte(restaurants.createdAt, since),
        // "New" means newly on Mesa's map — someone has ranked it. A bulk catalog import
        // would otherwise fill this shelf with places nobody has been to.
        sql`exists (select 1 from ${rankings} where ${rankings.restaurantId} = ${restaurants.id})`,
        notInArray(restaurants.id, rankedByMe(me.id)),
        ownHoods.size > 0 ? inArray(restaurants.neighborhoodId, [...ownHoods]) : undefined,
      ),
    )
    .orderBy(desc(restaurants.createdAt))
    .limit(NEW_MAX + excludeIds.size)
  return rows
    .filter((r) => !excludeIds.has(r.id))
    .slice(0, NEW_MAX)
    .map(publicPlace)
}

export const homeRoutes = new Hono<AuthedEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')
  const now = new Date()

  const ownHoods = await ownNeighborhoodIds(me)
  const [six, tonightPool] = await Promise.all([loadSix(me, now, ownHoods), tonightEvents(me)])
  const sixIds = new Set(six.map((s) => s.restaurant.id))

  const events = selectTonight(tonightPool, now)
  const tonightPick = events.length === 0 ? await loadTonightPick(me, sixIds) : null
  // Nothing repeats above the feed: not the six, not tonight's pick.
  const taken = new Set(sixIds)
  if (tonightPick) taken.add(tonightPick.restaurant.id)
  const newNearYou = await loadNewNearYou(me, now, ownHoods, taken)

  return c.json({
    six,
    tonight:
      events.length > 0
        ? { kind: 'events' as const, events }
        : tonightPick
          ? { kind: 'pick' as const, ...tonightPick }
          : null,
    newNearYou,
  })
})
