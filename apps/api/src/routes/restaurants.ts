import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Restaurant profile (M4): the place itself, which of the people you follow
// ranked it (with their scores + vibe notes), and your own state — saved or
// already ranked. The MapBox map and Cloudinary cover image arrive in M5; this
// ships the social substance. Each piece is one indexed read; none loop.
const { rankings, vibeNotes, restaurants, follows, userBlocks, user, savedPlaces } = schema

const { neighborhoods } = schema

export const restaurantRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // Explore/search — find a spot by name/cuisine/neighborhood, optionally
  // filtered by neighborhood slug + price tier and sorted by friends' score.
  // Each row carries the signal from people you follow (avg + count). One query.
  .get('/', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const q = (c.req.query('q') ?? '').trim()
    const hood = (c.req.query('neighborhood') ?? '').trim()
    const price = Number(c.req.query('price')) || null
    const sort = c.req.query('sort') === 'score' ? 'score' : 'name'
    // Nothing to do without a query or a filter (avoids dumping the whole table).
    if (q.length < 2 && !hood && !price) return c.json({ restaurants: [] })

    const following = db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, me.id))

    const conds = []
    if (q.length >= 2) {
      const pattern = `%${q}%`
      conds.push(
        or(
          ilike(restaurants.name, pattern),
          ilike(restaurants.cuisine, pattern),
          ilike(neighborhoods.name, pattern),
        ),
      )
    }
    if (hood) conds.push(eq(neighborhoods.slug, hood))
    if (price) conds.push(eq(restaurants.priceTier, price))

    const rows = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        priceTier: restaurants.priceTier,
        friendAvg: sql<number | null>`avg(${rankings.score})::float`,
        friendCount: sql<number>`count(${rankings.id})::int`,
      })
      .from(restaurants)
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        rankings,
        and(eq(rankings.restaurantId, restaurants.id), inArray(rankings.userId, following)),
      )
      .where(and(...conds))
      .groupBy(restaurants.id, neighborhoods.name)
      .orderBy(
        sort === 'score' ? sql`avg(${rankings.score}) desc nulls last` : asc(restaurants.name),
      )
      .limit(30)
    return c.json({ restaurants: rows })
  })
  // Trending: most-cheered places of the last two weeks — the Discover rail.
  // One grouped query (cheers → rankings → restaurants).
  .get('/trending', async (c) => {
    const rows = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        cheerCount: sql<number>`count(*)::int`,
      })
      .from(schema.cheers)
      .innerJoin(rankings, eq(rankings.id, schema.cheers.rankingId))
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(sql`${schema.cheers.createdAt} > now() - interval '14 days'`)
      .groupBy(
        restaurants.id,
        restaurants.name,
        restaurants.cuisine,
        restaurants.coverImageId,
        neighborhoods.name,
      )
      .orderBy(sql`count(*) desc`)
      .limit(8)
    return c.json({ restaurants: rows })
  })
  // Map view: every spot with its coordinates and the signal from people you
  // follow (their average score + how many ranked it). One query — the friend
  // aggregate is a filtered left join, so restaurants no one you follow has
  // ranked still come back (friendAvg null, friendCount 0). No loop.
  .get('/map', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const following = db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, me.id))
    const spots = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        lat: restaurants.lat,
        lng: restaurants.lng,
        priceTier: restaurants.priceTier,
        friendAvg: sql<number | null>`avg(${rankings.score})::float`,
        friendCount: sql<number>`count(${rankings.id})::int`,
      })
      .from(restaurants)
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        rankings,
        and(eq(rankings.restaurantId, restaurants.id), inArray(rankings.userId, following)),
      )
      .groupBy(restaurants.id, neighborhoods.name)
      .orderBy(asc(restaurants.name))
    return c.json({ spots })
  })
  .get('/:id', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const id = c.req.param('id')

    const restaurant = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, id),
      columns: {
        id: true,
        name: true,
        cuisine: true,
        lat: true,
        lng: true,
        coverImageId: true,
        phone: true,
        priceTier: true,
        neighborhoodId: true,
      },
      with: { neighborhood: { columns: { slug: true, name: true } } },
    })
    if (!restaurant) return c.json({ error: 'not_found' }, 404)

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

    // Friends who ranked this place, best score first.
    const friendsRankings = await db
      .select({
        user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
        score: rankings.score,
        position: rankings.position,
        note: vibeNotes.body,
      })
      .from(rankings)
      .innerJoin(user, eq(user.id, rankings.userId))
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
          eq(rankings.restaurantId, id),
          inArray(rankings.userId, following),
          isNull(user.bannedAt),
          notInArray(rankings.userId, blockedByMe),
          notInArray(rankings.userId, blockedMe),
        ),
      )
      .orderBy(desc(rankings.score))

    // My own state with this place.
    const myRanking = await db.query.rankings.findFirst({
      where: and(eq(rankings.userId, me.id), eq(rankings.restaurantId, id)),
      columns: { position: true, score: true },
    })
    const savedRow = await db.query.savedPlaces.findFirst({
      where: and(eq(savedPlaces.userId, me.id), eq(savedPlaces.restaurantId, id)),
      columns: { restaurantId: true },
    })

    // Similar spots: same cuisine or same neighborhood, one query.
    const similar = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
      })
      .from(restaurants)
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(
        and(
          sql`${restaurants.id} <> ${id}`,
          or(
            restaurant.cuisine ? eq(restaurants.cuisine, restaurant.cuisine) : sql`false`,
            eq(restaurants.neighborhoodId, restaurant.neighborhoodId),
          ),
        ),
      )
      .limit(6)

    // Beli-style friend average over the visible friends' scores.
    const friendAvg =
      friendsRankings.length > 0
        ? friendsRankings.reduce((s, f) => s + f.score, 0) / friendsRankings.length
        : null

    // Occasion tags for the whole place: the 3 most-common tags across all of its
    // rankings, requiring ≥2 raters so one person's idiosyncrasy doesn't stick.
    // unnest the per-ranking text[] and count — one query, no loop.
    const tagRes = await db.execute(sql`
      SELECT t AS tag
      FROM ${rankings}, unnest(${rankings.tags}) AS t
      WHERE ${rankings.restaurantId} = ${id}
      GROUP BY t
      HAVING count(*) >= 2
      ORDER BY count(*) DESC
      LIMIT 3
    `)
    const occasionTags = (tagRes.rows as { tag: string }[]).map((r) => r.tag)

    // "All of Mesa" score — the average + count over EVERY ranking of this place
    // (not just friends), for the third score circle. One grouped query.
    const [mesaAgg] = await db
      .select({
        avg: sql<number | null>`avg(${rankings.score})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(rankings)
      .where(eq(rankings.restaurantId, id))
    const allMesa = { avg: mesaAgg?.avg ?? null, count: mesaAgg?.count ?? 0 }

    const { neighborhoodId: _nid, ...restaurantOut } = restaurant
    return c.json({
      restaurant: restaurantOut,
      friendsRankings,
      friendAvg,
      occasionTags,
      allMesa,
      similar,
      myRanking: myRanking ?? null,
      saved: Boolean(savedRow),
    })
  })
