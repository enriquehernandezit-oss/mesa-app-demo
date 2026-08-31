import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { autocomplete, placeDetails, resolveNeighborhood, toMesaFields } from '../lib/googlePlaces'
import { findExistingMatch, findGooglePlaceMatch } from '../lib/placeMatch'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Restaurant profile (M4): the place itself, which of the people you follow
// ranked it (with their scores + vibe notes), and your own state — saved or
// already ranked. The MapBox map and Cloudinary cover image arrive in M5; this
// ships the social substance. Each piece is one indexed read; none loop.
const { rankings, vibeNotes, restaurants, user, savedPlaces } = schema

const { neighborhoods, lists, listItems } = schema

// Fuzzy-name threshold for catalog search (pg_trgm word_similarity: the query
// vs the closest WORD in the name, which is what tolerates a one-letter miss in
// a multi-word name). Measured against the real catalog: 0.55 finds "Casa
// Oliva" for "Olivia" (0.571) and "Pizzarelli" for "Pizza" (0.83) while adding
// no unrelated rows. Raising it to 0.6 loses "Casa Oliva"; lowering it starts
// pulling noise. Kept in sync with the same clause in /rankings/candidates.
//
// Not index-assisted (the GIN trigram index backs ILIKE and the % operator, not
// word_similarity), so this is a scan — fine at catalog scale here because the
// id-resolving phase is LIMIT 30 and the row count is thousands, not millions.
// If the catalog ever gets big, switch to the `<%` operator with a session-level
// pg_trgm.word_similarity_threshold.
const WORD_MATCH_MIN = 0.55

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

// Google Places (M8 typeahead, M9 create + refresh). The key itself lives in
// lib/googlePlaces.ts — server-only, NEVER VITE_-prefixed. Unset → every
// Google-backed feature here is dark: no suggestions, POST /from-google
// 502s cleanly, no background refresh ever fires. Same graceful-degradation
// posture as Cloudinary/MapBox/Resend.

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

// Per-user daily cap on catalog writes (App Store 1.2 traceability/removal via
// created_by + removedAt) — shared by POST / and POST /from-google so tapping
// a Google result and hand-adding a place draw from the same ~10/day budget.
async function atDailyCap(userId: string): Promise<boolean> {
  const addedToday = await db.$count(
    restaurants,
    and(
      eq(restaurants.createdBy, userId),
      sql`${restaurants.createdAt} > now() - interval '1 day'`,
    ),
  )
  return addedToday >= 10
}

// The card both catalog-write paths return — POST / and POST /from-google, each
// of which either adopts an existing row or inserts a new one, then answers with
// exactly these five fields plus the neighborhood name. Defined once so the two
// paths (and their adopt vs. create branches) can't drift: a field added to one
// .returning() but not the other would make an adopted place look different from
// a freshly created one. Two shapes because Drizzle's insert().returning() takes
// column refs while query.findFirst({ columns }) takes boolean flags.
const CARD_RETURNING = {
  id: restaurants.id,
  name: restaurants.name,
  cuisine: restaurants.cuisine,
  priceTier: restaurants.priceTier,
  coverImageId: restaurants.coverImageId,
}
const CARD_COLUMNS = {
  id: true,
  name: true,
  cuisine: true,
  priceTier: true,
  coverImageId: true,
} as const

// M9: how long a Google-sourced row's descriptive fields (address/phone/
// website/hours) are trusted before a profile view triggers a re-fetch —
// Google's caching terms give no exception for these fields, unlike place_id
// (forever) and coordinates (30 days), so 30 days is the same budget applied
// to everything we copy from a Details response.
const GOOGLE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000

// Prevents a refresh stampede when a stale profile gets several views at
// once — same in-process, single-Railway-instance assumption as extHits
// above. Not persisted; worst case after a restart is one extra Details call.
const refreshing = new Set<string>()
async function refreshFromGoogle(restaurantId: string, googlePlaceId: string): Promise<void> {
  if (refreshing.has(restaurantId)) return
  refreshing.add(restaurantId)
  try {
    const details = await placeDetails(googlePlaceId)
    if (!details) return
    const fields = toMesaFields(details)
    await db
      .update(restaurants)
      .set({
        address: fields.address,
        phone: fields.phone,
        website: fields.website,
        priceTier: fields.priceTier,
        closesAt: fields.closesAt,
        closedAt: fields.closedAt,
        sourceRefreshedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId))
  } finally {
    refreshing.delete(restaurantId)
  }
}

export const restaurantRoutes = new Hono<AuthedEnv>()
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
    const q = (c.req.query('q') ?? '').trim()
    const hood = (c.req.query('neighborhood') ?? '').trim()
    const cuisine = (c.req.query('cuisine') ?? '').trim()
    const price = Number(c.req.query('price')) || null
    const openNow = c.req.query('open') === '1'
    const sort = c.req.query('sort') === 'name' ? 'name' : 'score'
    const hasQuery = q.length >= 2

    const following = followingIds(me.id)

    const liveConds = [isNull(restaurants.removedAt), isNull(restaurants.closedAt)]
    if (hood) liveConds.push(eq(neighborhoods.slug, hood))
    if (price) liveConds.push(eq(restaurants.priceTier, price))
    // Cuisine facet — the chip value is the exact stored English cuisine (from
    // GET /restaurants/cuisines), so an equality is exact and correct.
    if (cuisine) liveConds.push(eq(restaurants.cuisine, cuisine))
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
          // Fuzzy name match, so a near-miss spelling still finds the place we
          // already have — "Olivia" must find "Casa Oliva". Substring alone
          // returned NOTHING there, which made Mesa's own catalog invisible and
          // pushed the Google gap-filler to offer a place the member had
          // already ranked. word_similarity compares the query against the
          // closest WORD in the name (0.571 for this pair) rather than the whole
          // string (0.286, hopeless); 0.55 was measured against the catalog as
          // the point that catches real variants with no junk (see
          // WORD_MATCH_MIN).
          sql`word_similarity(${norm}, ${restaurants.nameKey}) >= ${WORD_MATCH_MIN}`,
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
      // Only the id list is used downstream; the friend/all-Mesa averages that
      // decide the order live in the ORDER BY below, so they don't need to be
      // selected here (phase 2 recomputes the display aggregates fresh).
      const idRows = await db
        .select({ id: restaurants.id })
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
      // Accent-normalized both sides, matching the place search above, so
      // "jose" finds "José" (raw ilike over the stored name would miss it).
      const norm = sql`mesa_norm(${q})`
      const blocked = blockedByMe(me.id)
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
            or(
              sql`mesa_norm(${user.name}) ilike '%' || ${norm} || '%'`,
              sql`mesa_norm(${user.handle}) ilike '%' || ${norm} || '%'`,
            ),
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
  // The distinct cuisines actually present in the live catalog — powers the
  // Explore cuisine filter chips. Reflects the real data (not a hardcoded list),
  // so it stays correct as the catalog grows with imported places. Ordered
  // alphabetically by the stored English value; the client shows cuisineLabel().
  .get('/cuisines', async (c) => {
    const rows = await db
      .selectDistinct({ cuisine: restaurants.cuisine })
      .from(restaurants)
      .where(
        and(
          isNull(restaurants.removedAt),
          isNull(restaurants.closedAt),
          sql`${restaurants.cuisine} is not null`,
        ),
      )
      .orderBy(asc(restaurants.cuisine))
    return c.json({ cuisines: rows.map((r) => r.cuisine).filter((c): c is string => Boolean(c)) })
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
      .where(
        and(
          sql`${schema.cheers.createdAt} > now() - interval '14 days'`,
          isNull(restaurants.removedAt),
          isNull(restaurants.closedAt),
        ),
      )
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
    const following = followingIds(me.id)
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
    const q = (c.req.query('q') ?? '').trim()
    if (q.length < 3) return c.json({ suggestions: [] })
    if (extRateLimited(me.id, Date.now())) return c.json({ error: 'rate_limited' }, 429)
    // Optional session token (M9): when the same token terminates in a Details
    // call (POST /from-google), Google bills these autocomplete requests at
    // zero. Omitting it still works — it's purely a cost optimization.
    const sessionToken = c.req.query('s') || undefined
    const suggestions = await autocomplete(q, sessionToken)
    return c.json({ suggestions })
  })
  // Tap a Google suggestion → a real, populated Mesa profile (M9). Fetches
  // Place Details ONLY here, never for the typeahead — one billable call per
  // new place, reused across every member who taps the same suggestion after.
  .post('/from-google', async (c) => {
    const me = c.get('user')
    const parsed = z
      .object({ placeId: z.string().trim().min(1).max(300), sessionToken: z.string().optional() })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    const { placeId, sessionToken } = parsed.data

    if (await atDailyCap(me.id)) return c.json({ error: 'rate_limited' }, 429)

    const adopt = async (rid: string) => {
      const full = await db.query.restaurants.findFirst({
        where: eq(restaurants.id, rid),
        columns: CARD_COLUMNS,
        with: { neighborhood: { columns: { name: true } } },
      })
      return full
        ? c.json({ restaurant: { ...full, neighborhood: full.neighborhood.name } }, 200)
        : null
    }

    // Dedup on google_place_id first — costs zero additional Details calls
    // for the second, third, ... member who taps the same suggestion.
    const byPlaceId = await db.query.restaurants.findFirst({
      where: eq(restaurants.googlePlaceId, placeId),
      columns: { id: true },
    })
    if (byPlaceId) {
      const r = await adopt(byPlaceId.id)
      if (r) return r
    }

    const details = await placeDetails(placeId, sessionToken)
    if (!details) return c.json({ error: 'google_unavailable' }, 502)
    const fields = toMesaFields(details)

    // Google says this place is permanently closed. Creating it would produce a
    // ghost: closedAt excludes it from search and from the rank-flow candidate
    // list, yet its profile still loads and it can still be ranked — so it lands
    // at #1 in someone's list and then can't be found again. Refuse instead, and
    // let the client say why. (Places already in the catalog that close later
    // stay rankable via their profile — that's the schema's intent; the ghost is
    // specific to creating one from a search that then hides it.)
    if (fields.closedAt) return c.json({ error: 'place_closed' }, 409)

    const hoods = await db.query.neighborhoods.findMany({
      columns: { id: true, name: true, lat: true, lng: true },
    })
    if (hoods.length === 0) return c.json({ error: 'unknown_neighborhood' }, 400)
    const hood = resolveNeighborhood(details, hoods)

    // Match against Mesa's catalog before inserting. Google-specific matcher,
    // not the plain name/distance one: Google varies a place's display name
    // and sometimes carries two listings for one spot, so the exact-geocode
    // proximity rules in findGooglePlaceMatch are what stop the same
    // restaurant being re-added under a slightly different name on a later
    // search. A hit is enriched, not duplicated — only null columns are
    // filled, so a seeded row's curated name/cover/cuisine survive untouched,
    // and its geoPrecision is promoted from 'sector' to Google's exact coords.
    const existing = await findGooglePlaceMatch({
      name: fields.name,
      lat: fields.lat,
      lng: fields.lng,
    })
    if (existing) {
      await db
        .update(restaurants)
        .set({
          cuisine: existing.cuisine ?? fields.cuisine,
          address: existing.address ?? fields.address,
          locality: existing.locality ?? fields.locality,
          phone: existing.phone ?? fields.phone,
          website: existing.website ?? fields.website,
          priceTier: existing.priceTier ?? fields.priceTier,
          closesAt: existing.closesAt ?? fields.closesAt,
          closedAt: existing.closedAt ?? fields.closedAt,
          ...(existing.geoPrecision === 'sector'
            ? { lat: fields.lat, lng: fields.lng, geoPrecision: 'exact' as const }
            : {}),
          googlePlaceId: existing.googlePlaceId ?? placeId,
          sourceRefreshedAt: new Date(),
        })
        .where(eq(restaurants.id, existing.id))
      const r = await adopt(existing.id)
      if (r) return r
    }

    const [created] = await db
      .insert(restaurants)
      .values({
        name: fields.name,
        cuisine: fields.cuisine,
        neighborhoodId: hood.id,
        lat: fields.lat,
        lng: fields.lng,
        geoPrecision: 'exact',
        source: 'member',
        createdBy: me.id,
        address: fields.address,
        locality: fields.locality,
        phone: fields.phone,
        website: fields.website,
        priceTier: fields.priceTier,
        closesAt: fields.closesAt,
        closedAt: fields.closedAt,
        googlePlaceId: placeId,
        sourceRefreshedAt: new Date(),
        isDemo: false,
      })
      .returning(CARD_RETURNING)
    return c.json({ restaurant: { ...created, neighborhood: hood.name } }, 201)
  })
  .get('/:id', async (c) => {
    const me = c.get('user')
    const id = c.req.param('id')

    const restaurant = await db.query.restaurants.findFirst({
      // A moderation-removed listing must 404 on its direct link too, not just
      // vanish from lists — otherwise a removed row stays viewable by URL.
      where: and(eq(restaurants.id, id), isNull(restaurants.removedAt)),
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
        address: true,
        geoPrecision: true,
        googlePlaceId: true,
        sourceRefreshedAt: true,
      },
      with: { neighborhood: { columns: { slug: true, name: true } } },
    })
    if (!restaurant) return c.json({ error: 'not_found' }, 404)

    // M9: a Google-sourced row past its 30-day refresh window gets refreshed
    // in the background — the current (seconds-stale-at-worst) values still
    // serve immediately. See refreshFromGoogle below for the in-flight guard.
    if (
      restaurant.googlePlaceId &&
      (!restaurant.sourceRefreshedAt ||
        Date.now() - restaurant.sourceRefreshedAt.getTime() > GOOGLE_REFRESH_MS)
    ) {
      refreshFromGoogle(restaurant.id, restaurant.googlePlaceId).catch((err) =>
        console.error('[places] background refresh failed:', err),
      )
    }

    const following = followingIds(me.id)

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
          notInArray(rankings.userId, blockedByMe(me.id)),
          notInArray(rankings.userId, blockedMe(me.id)),
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
          notInArray(savedPlaces.userId, blockedByMe(me.id)),
          notInArray(savedPlaces.userId, blockedMe(me.id)),
        ),
      )
    const friendsWantToTry = {
      count: wantRows.length,
      people: wantRows.slice(0, 3).map((w) => ({ name: w.name, image: w.image })),
    }

    const {
      neighborhoodId: _nid,
      googlePlaceId,
      sourceRefreshedAt: _sra,
      ...restaurantOut
    } = restaurant
    return c.json({
      restaurant: { ...restaurantOut, google: googlePlaceId != null },
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

    // Per-user daily cap — this is a catalog write path, so bound it (App Store
    // 1.2; created_by + removedAt make bad rows traceable/removable). Shared
    // with POST /from-google (M9) so both draw from the same ~10/day budget.
    if (await atDailyCap(me.id)) return c.json({ error: 'rate_limited' }, 429)

    const hood = await db.query.neighborhoods.findFirst({
      where: eq(neighborhoods.slug, neighborhoodSlug),
      columns: { id: true, name: true, slug: true, lat: true, lng: true },
    })
    if (!hood) return c.json({ error: 'unknown_neighborhood' }, 400)

    // Dedup against an existing place by name/distance (placeMatch.ts) — a hit
    // adopts (200) rather than spawning a twin; only a miss inserts.
    const existing = await findExistingMatch({ name, lat: hood.lat, lng: hood.lng })
    if (existing) {
      const full = await db.query.restaurants.findFirst({
        where: eq(restaurants.id, existing.id),
        columns: CARD_COLUMNS,
      })
      if (full) return c.json({ restaurant: { ...full, neighborhood: hood.name } }, 200)
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
        isDemo: false,
      })
      .returning(CARD_RETURNING)
    return c.json({ restaurant: { ...created, neighborhood: hood.name } }, 201)
  })
