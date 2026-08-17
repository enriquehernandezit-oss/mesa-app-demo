import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Restaurant profile (M4): the place itself, which of the people you follow
// ranked it (with their scores + vibe notes), and your own state — saved or
// already ranked. The MapBox map and Cloudinary cover image arrive in M5; this
// ships the social substance. Each piece is one indexed read; none loop.
const { rankings, vibeNotes, restaurants, follows, userBlocks, user, savedPlaces } = schema

const { neighborhoods, lists, listItems } = schema

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
    const openNow = c.req.query('open') === '1'
    const sort = c.req.query('sort') === 'name' ? 'name' : 'score'
    const hasQuery = q.length >= 2

    const following = db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, me.id))

    const conds = []
    if (hasQuery) {
      const pattern = `%${q}%`
      // A place matches by its own text OR by having a dish whose name matches —
      // that's the "dish" half of "place, dish, or member". One subquery.
      const dishMatch = db
        .select({ id: schema.dishes.restaurantId })
        .from(schema.dishes)
        .where(and(ilike(schema.dishes.name, pattern), isNull(schema.dishes.removedAt)))
      conds.push(
        or(
          ilike(restaurants.name, pattern),
          ilike(restaurants.cuisine, pattern),
          ilike(neighborhoods.name, pattern),
          inArray(restaurants.id, dishMatch),
        ),
      )
    }
    if (hood) conds.push(eq(neighborhoods.slug, hood))
    if (price) conds.push(eq(restaurants.priceTier, price))
    // "Open now" is a demo filter over the display close-time (not real hours).
    if (openNow) conds.push(sql`${restaurants.closesAt} is not null`)

    const rows = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        priceTier: restaurants.priceTier,
        closesAt: restaurants.closesAt,
        friendAvg: sql<number | null>`avg(${rankings.score})::float`,
        friendCount: sql<number>`count(${rankings.id})::int`,
      })
      .from(restaurants)
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        rankings,
        and(eq(rankings.restaurantId, restaurants.id), inArray(rankings.userId, following)),
      )
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(restaurants.id, neighborhoods.name)
      .orderBy(
        sort === 'name'
          ? asc(restaurants.name)
          : sql`avg(${rankings.score}) desc nulls last, ${restaurants.name} asc`,
      )
      .limit(30)

    // Members half of "place, dish, or member" — only when there's a query.
    let members: {
      id: string
      name: string
      handle: string | null
      image: string | null
      neighborhood: string | null
      rankedCount: number
    }[] = []
    if (hasQuery) {
      const pattern = `%${q}%`
      const blocked = db
        .select({ id: userBlocks.blockedId })
        .from(userBlocks)
        .where(eq(userBlocks.blockerId, me.id))
      members = await db
        .select({
          id: user.id,
          name: user.name,
          handle: user.handle,
          image: user.image,
          neighborhood: neighborhoods.name,
          rankedCount: sql<number>`(select count(*) from ${rankings} where ${rankings.userId} = ${user.id})::int`,
        })
        .from(user)
        .leftJoin(neighborhoods, eq(neighborhoods.id, user.neighborhoodId))
        .where(
          and(
            or(ilike(user.name, pattern), ilike(user.handle, pattern)),
            sql`${user.handle} is not null`,
            isNull(user.bannedAt),
            notInArray(user.id, blocked),
            sql`${user.id} <> ${me.id}`,
          ),
        )
        .orderBy(asc(user.name))
        .limit(6)
    }

    return c.json({ restaurants: rows, members })
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
        website: true,
        closesAt: true,
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

    // Editorial lists this place belongs to → the "▤ Mesa Best" membership pills.
    const memberships = await db
      .select({ slug: lists.slug, title: lists.title })
      .from(listItems)
      .innerJoin(lists, eq(lists.id, listItems.listId))
      .where(eq(listItems.restaurantId, id))
      .orderBy(asc(lists.sortOrder))

    // Friends who've saved this place → the characteristics "N friends want to
    // try" social line (avatar stack + label). Count all; return up to 3 faces.
    const wantRows = await db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(savedPlaces)
      .innerJoin(user, eq(user.id, savedPlaces.userId))
      .where(
        and(
          eq(savedPlaces.restaurantId, id),
          inArray(savedPlaces.userId, following),
          isNull(user.bannedAt),
          notInArray(savedPlaces.userId, blockedByMe),
          notInArray(savedPlaces.userId, blockedMe),
        ),
      )
    const friendsWantToTry = {
      count: wantRows.length,
      people: wantRows.slice(0, 3).map((w) => ({ name: w.name, image: w.image })),
    }

    const { neighborhoodId: _nid, ...restaurantOut } = restaurant
    return c.json({
      restaurant: restaurantOut,
      friendsRankings,
      friendAvg,
      occasionTags,
      allMesa,
      lists: memberships,
      similar,
      friendsWantToTry,
      myRanking: myRanking ?? null,
      saved: Boolean(savedRow),
    })
  })
  // Add a place that isn't on Mesa yet ("Can't find it? Add a new restaurant" in
  // the rank flow). Minimal fields; coordinates default to the city centre since
  // a member-added spot has no geocode yet. Marked isDemo=false — it's real UGC.
  .post('/', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(80),
        cuisine: z.string().trim().max(40).optional(),
        // The client has neighborhood slugs (from /onboarding/neighborhoods),
        // not UUIDs — so accept the slug and resolve it here.
        neighborhoodSlug: z.string().trim().min(1),
        priceTier: z.number().int().min(1).max(4).optional(),
      })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    const { name, cuisine, neighborhoodSlug, priceTier } = parsed.data

    const hood = await db.query.neighborhoods.findFirst({
      where: eq(neighborhoods.slug, neighborhoodSlug),
      columns: { id: true, name: true, slug: true },
    })
    if (!hood) return c.json({ error: 'unknown_neighborhood' }, 400)

    const [created] = await db
      .insert(restaurants)
      .values({
        name,
        cuisine: cuisine || null,
        neighborhoodId: hood.id,
        lat: 18.4801, // Santo Domingo centre — a member-added spot has no geocode
        lng: -69.9422,
        priceTier: priceTier ?? null,
        isDemo: false,
      })
      .returning({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        priceTier: restaurants.priceTier,
        coverImageId: restaurants.coverImageId,
      })
    return c.json({ restaurant: { ...created, neighborhood: hood.name } }, 201)
  })
