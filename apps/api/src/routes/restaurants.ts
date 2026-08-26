import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { findExistingMatch } from '../lib/placeMatch'
import { requireAuth } from '../middleware/session'

// Restaurant profile (M4): the place itself, which of the people you follow
// ranked it (with their scores + vibe notes), and your own state — saved or
// already ranked. The MapBox map and Cloudinary cover image arrive in M5; this
// ships the social substance. Each piece is one indexed read; none loop.
const { rankings, vibeNotes, restaurants, follows, userBlocks, user, savedPlaces } = schema

const { neighborhoods, lists, listItems } = schema

// Deterministic per-id coordinate jitter for sector-precision map pins, so
// places sharing a neighborhood centroid fan out instead of stacking. FNV-1a
// over the id → two independent offsets in ±0.0004° (~44m). Stable across
// loads (same id → same offset); directions to a sector place are approximate
// anyway, so the tiny shift is immaterial. (M7)
function jitter(id: string, lat: number, lng: number): { lat: number; lng: number } {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const a = (h >>> 0) / 0xffffffff // [0,1)
  const b = ((Math.imul(h, 0x01000193) >>> 0) & 0xffff) / 0xffff // a second, decorrelated draw
  return { lat: lat + (a - 0.5) * 0.0008, lng: lng + (b - 0.5) * 0.0008 }
}

// Google Places typeahead (M8). Server-only key — NEVER VITE_-prefixed (that
// would inline it into the public client bundle). Unset → the feature is dark:
// /restaurants/search-external returns no suggestions and the client's "En
// Google" section never appears. Same graceful-degradation posture as
// Cloudinary/MapBox/Resend.
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY

// A soft per-user rate limit for the paid Google proxy — a cost guard, not a
// security boundary (the client already debounces, gates on <3 Mesa results,
// and caches 5min). In-memory sliding window; timestamps older than the window
// are pruned on each call so the map can't grow unbounded. Single API instance
// on Railway, so a per-process map is sufficient.
const EXT_WINDOW_MS = 60_000
const EXT_MAX_PER_WINDOW = 20
const extHits = new Map<string, number[]>()
function extRateLimited(userId: string, now: number): boolean {
  const recent = (extHits.get(userId) ?? []).filter((t) => now - t < EXT_WINDOW_MS)
  if (recent.length >= EXT_MAX_PER_WINDOW) {
    extHits.set(userId, recent)
    return true
  }
  recent.push(now)
  extHits.set(userId, recent)
  return false
}

export const restaurantRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // Explore/search — find a spot by name/cuisine/neighborhood, optionally
  // filtered by neighborhood slug + price tier. Two phases, not one grouped
  // query over the whole table: resolve up to 30 matching ids first (cheap —
  // an index-backed WHERE + ORDER BY + LIMIT, no join), THEN join the friend/
  // all-Mesa aggregates onto exactly those 30. At 49 rows the old GROUP-BY-
  // everything-then-LIMIT shape didn't matter; once the catalog is thousands
  // of rows (Foursquare import, M6) it would mean aggregating rankings across
  // the entire table on every keystroke.
  //
  // Search matches name_key/cuisine_key/dishes.name_key (generated columns,
  // GIN trigram-indexed — see packages/db/drizzle/0008) against mesa_norm(q),
  // so "serralles" matches "Serrallés" — both sides normalized the same way.
  // Ranked prefix-match → similarity → name, which is what makes it feel
  // Beli-like rather than a plain substring filter.
  //
  // No query: browsing the raw catalog is useless once most of it has never
  // been ranked by anyone (the whole point of the Foursquare import), so the
  // pool is restaurants with at least one ranking — by anyone on Mesa, not
  // just people you follow; friends still sort first via friendAvg.
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

    const liveConds = [isNull(restaurants.removedAt), isNull(restaurants.closedAt)]
    if (hood) liveConds.push(eq(neighborhoods.slug, hood))
    if (price) liveConds.push(eq(restaurants.priceTier, price))
    // "Open now" is a demo filter over the display close-time (not real hours).
    if (openNow) liveConds.push(sql`${restaurants.closesAt} is not null`)

    let ids: string[]
    if (hasQuery) {
      const norm = sql`mesa_norm(${q})`
      // A place matches by its own text OR by having a dish whose name
      // matches — the "dish" half of "place, dish, or member".
      const dishMatch = db
        .select({ id: schema.dishes.restaurantId })
        .from(schema.dishes)
        .where(
          and(
            sql`${schema.dishes.nameKey} ilike '%' || ${norm} || '%'`,
            isNull(schema.dishes.removedAt),
          ),
        )
      const matchConds = [
        ...liveConds,
        or(
          sql`${restaurants.nameKey} ilike '%' || ${norm} || '%'`,
          sql`${restaurants.cuisineKey} ilike '%' || ${norm} || '%'`,
          sql`mesa_norm(${neighborhoods.name}) ilike '%' || ${norm} || '%'`,
          inArray(restaurants.id, dishMatch),
        ),
      ]
      const idRows = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
        .where(and(...matchConds))
        .orderBy(
          sort === 'name'
            ? asc(restaurants.name)
            : sql`(${restaurants.nameKey} like ${norm} || '%') desc,
                  similarity(${restaurants.nameKey}, ${norm}) desc,
                  ${restaurants.name} asc`,
        )
        .limit(30)
      ids = idRows.map((r) => r.id)
    } else {
      const rankedPool = db.selectDistinct({ id: rankings.restaurantId }).from(rankings)
      const idRows = await db
        .select({
          id: restaurants.id,
          friendAvg: sql<
            number | null
          >`avg(${rankings.score}) filter (where ${inArray(rankings.userId, following)})`,
          mesaAvg: sql<number | null>`avg(${rankings.score})`,
        })
        .from(restaurants)
        .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
        // The subquery's select key ("id") is a JS-side label only — Drizzle
        // doesn't rename the column in the generated SQL, so the exposed
        // column is still restaurant_id (confirmed via .toSQL()).
        .innerJoin(rankedPool.as('ranked'), sql`ranked.restaurant_id = ${restaurants.id}`)
        .leftJoin(rankings, eq(rankings.restaurantId, restaurants.id))
        .where(and(...liveConds))
        .groupBy(restaurants.id)
        .orderBy(
          sort === 'name'
            ? asc(restaurants.name)
            : sql`avg(${rankings.score}) filter (where ${inArray(rankings.userId, following)}) desc nulls last,
                  avg(${rankings.score}) desc nulls last,
                  ${restaurants.name} asc`,
        )
        .limit(30)
      ids = idRows.map((r) => r.id)
    }

    // Phase 2 — the actual display row, for exactly those ids. Recomputed
    // fresh rather than reusing phase 1's aggregate: cheap over ≤30 rows, and
    // keeps the row shape identical whichever phase produced the id list.
    const rowsUnordered = ids.length
      ? await db
          .select({
            id: restaurants.id,
            name: restaurants.name,
            cuisine: restaurants.cuisine,
            coverImageId: restaurants.coverImageId,
            neighborhood: neighborhoods.name,
            priceTier: restaurants.priceTier,
            closesAt: restaurants.closesAt,
            address: restaurants.address,
            friendAvg: sql<
              number | null
            >`avg(${rankings.score}) filter (where ${inArray(rankings.userId, following)})::float`,
            friendCount: sql<number>`count(${rankings.id}) filter (where ${inArray(rankings.userId, following)})::int`,
            mesaCount: sql<number>`count(${rankings.id})::int`,
          })
          .from(restaurants)
          .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
          .leftJoin(rankings, eq(rankings.restaurantId, restaurants.id))
          .where(inArray(restaurants.id, ids))
          .groupBy(restaurants.id, neighborhoods.name)
      : []
    // `WHERE id = ANY(...)` doesn't preserve phase 1's order — reorder in JS
    // rather than a gnarly array_position SQL expression for ≤30 rows.
    const order = new Map(ids.map((id, i) => [id, i]))
    const rows = rowsUnordered
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((r) => ({ ...r, isNew: r.mesaCount === 0 }))

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
    // Bound the map to places worth plotting: ranked by anyone, saved by me, or
    // in an editorial list. Unbounded, one imported place near Las Américas
    // rescales project()'s bbox and squashes Piantini to a few pixels — and a
    // few-thousand-pin map is noise, not a map. (M7)
    const rankedPool = db.selectDistinct({ id: rankings.restaurantId }).from(rankings)
    const savedByMe = db
      .select({ id: savedPlaces.restaurantId })
      .from(savedPlaces)
      .where(eq(savedPlaces.userId, me.id))
    const inAnyList = db.selectDistinct({ id: listItems.restaurantId }).from(listItems)
    const rows = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        lat: restaurants.lat,
        lng: restaurants.lng,
        geoPrecision: restaurants.geoPrecision,
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
      .where(
        and(
          isNull(restaurants.removedAt),
          isNull(restaurants.closedAt),
          or(
            inArray(restaurants.id, rankedPool),
            inArray(restaurants.id, savedByMe),
            inArray(restaurants.id, inAnyList),
          ),
        ),
      )
      .groupBy(restaurants.id, neighborhoods.name)
      .orderBy(asc(restaurants.name))
    // Fan out sector-precision pins (member-added places all share their
    // neighborhood centroid, so they'd stack on one pixel). Deterministic per
    // id — a ±0.0004° (~44m) offset, stable across loads. 'exact' rows keep
    // their real geocode. geoPrecision is internal, so it's dropped here.
    const spots = rows.map(({ geoPrecision, ...s }) =>
      geoPrecision === 'sector' ? { ...s, ...jitter(s.id, s.lat, s.lng) } : s,
    )
    return c.json({ spots })
  })
  // Google Places typeahead gap-filler (M8) — a server-side proxy so the paid
  // key never reaches the client. Returns ONLY placeId + main/secondary text
  // (field-masked): autocomplete carries no coordinates, so nothing Google-
  // derived beyond the id can land here. Registered before '/:id' so the param
  // route doesn't capture "search-external". Gated on the key; degrades to an
  // empty list on any miss so it can never break the rank flow.
  .get('/search-external', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const q = (c.req.query('q') ?? '').trim()
    if (!GOOGLE_PLACES_KEY || q.length < 3) return c.json({ suggestions: [] })
    if (extRateLimited(me.id, Date.now())) return c.json({ error: 'rate_limited' }, 429)

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
          // Only the id + the two display strings — keeps it on the cheapest
          // Autocomplete SKU and means coordinates are never even returned.
          'X-Goog-FieldMask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
        },
        body: JSON.stringify({
          input: q,
          includedRegionCodes: ['do'],
          includedPrimaryTypes: ['restaurant', 'bar', 'night_club', 'cafe'],
          languageCode: 'es',
          regionCode: 'do',
        }),
        // Google is on the user's critical path here; don't let a stall hang the
        // rank flow. Degrades to "no external results" below.
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        console.error(`[places] autocomplete failed (${res.status}): ${detail.slice(0, 300)}`)
        return c.json({ suggestions: [] })
      }
      const data = (await res.json()) as {
        suggestions?: {
          placePrediction?: {
            placeId?: string
            structuredFormat?: {
              mainText?: { text?: string }
              secondaryText?: { text?: string }
            }
          }
        }[]
      }
      const suggestions = (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> =>
          Boolean(p?.placeId && p.structuredFormat?.mainText?.text),
        )
        .map((p) => ({
          provider: 'google' as const,
          providerPlaceId: p.placeId as string,
          name: p.structuredFormat?.mainText?.text as string,
          secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
        }))
      return c.json({ suggestions })
    } catch (err) {
      console.error('[places] autocomplete threw:', err)
      return c.json({ suggestions: [] })
    }
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

    // Similar spots: same cuisine or same neighborhood. Bounded to places
    // someone on Mesa has actually ranked and ordered most-ranked first — with
    // no ORDER BY this returned 6 arbitrary rows, which post-import (M6) means 6
    // never-heard-of Foursquare unknowns for any common cuisine. HAVING a
    // ranking also excludes those raw catalog rows outright; the rail hides
    // itself when empty, so a rare cuisine with no ranked peers is fine. (M7)
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
      .leftJoin(rankings, eq(rankings.restaurantId, restaurants.id))
      .where(
        and(
          sql`${restaurants.id} <> ${id}`,
          isNull(restaurants.removedAt),
          isNull(restaurants.closedAt),
          or(
            restaurant.cuisine ? eq(restaurants.cuisine, restaurant.cuisine) : sql`false`,
            eq(restaurants.neighborhoodId, restaurant.neighborhoodId),
          ),
        ),
      )
      .groupBy(restaurants.id, neighborhoods.name)
      .having(sql`count(${rankings.id}) > 0`)
      .orderBy(sql`count(${rankings.id}) desc`, asc(restaurants.name))
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
  // the rank flow). Minimal fields; coordinates land on the neighborhood's
  // centroid — a real, computed point (see packages/db/drizzle/0008), not the
  // old hardcoded Santo Domingo city-centre fallback every member-added spot
  // used to share. Marked source='member', geoPrecision='sector' — it's real
  // UGC, but not a real geocode.
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
        // From the Google typeahead (M8) — the ONLY Google-derived value stored.
        // Everything else (name, sector, coords) is member-confirmed.
        googlePlaceId: z.string().trim().max(300).optional(),
      })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    const { name, cuisine, neighborhoodSlug, priceTier, googlePlaceId } = parsed.data

    // Per-user daily cap — this is a catalog write path, so bound it (App Store
    // 1.2; created_by + removedAt make bad rows traceable/removable). ~10/day.
    const addedToday = await db.$count(
      restaurants,
      and(
        eq(restaurants.createdBy, me.id),
        sql`${restaurants.createdAt} > now() - interval '1 day'`,
      ),
    )
    if (addedToday >= 10) return c.json({ error: 'rate_limited' }, 429)

    const hood = await db.query.neighborhoods.findFirst({
      where: eq(neighborhoods.slug, neighborhoodSlug),
      columns: { id: true, name: true, slug: true, lat: true, lng: true },
    })
    if (!hood) return c.json({ error: 'unknown_neighborhood' }, 400)

    // Dedup by google_place_id first — two members picking the same Google
    // suggestion must adopt one row, not spawn twins. Then the name/distance
    // matcher (placeMatch.ts) catches a place already added by hand or imported
    // within range. Either hit adopts (200); only a double-miss inserts.
    const adopt = async (rid: string) => {
      const full = await db.query.restaurants.findFirst({
        where: eq(restaurants.id, rid),
        columns: { id: true, name: true, cuisine: true, priceTier: true, coverImageId: true },
      })
      return full ? c.json({ restaurant: { ...full, neighborhood: hood.name } }, 200) : null
    }
    if (googlePlaceId) {
      const byPlaceId = await db.query.restaurants.findFirst({
        where: eq(restaurants.googlePlaceId, googlePlaceId),
        columns: { id: true },
      })
      if (byPlaceId) {
        const r = await adopt(byPlaceId.id)
        if (r) return r
      }
    }
    const existing = await findExistingMatch({ name, lat: hood.lat, lng: hood.lng })
    if (existing) {
      const r = await adopt(existing.id)
      if (r) return r
    }

    const [created] = await db
      .insert(restaurants)
      .values({
        name,
        cuisine: cuisine || null,
        neighborhoodId: hood.id,
        lat: hood.lat,
        lng: hood.lng,
        geoPrecision: 'sector',
        source: 'member',
        createdBy: me.id,
        priceTier: priceTier ?? null,
        googlePlaceId: googlePlaceId ?? null,
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
