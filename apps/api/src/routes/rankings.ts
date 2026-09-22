import { db, isAgreement, schema, tasteMatch } from '@mesa/db'
import { type SQL, and, asc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { aliasedTable } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { sendPush } from '../lib/push'
import { currentOrder, lockUserList, rewrite } from '../lib/rankingOrder'
import { blockedByMe, blockedMe, followerIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// The ranking loop — Mesa's atomic unit. A user keeps one ordered list of
// places they've been; the order (and the derived score) comes only from
// pairwise comparisons, never a star input. Vibe notes are the one-line "why"
// attached to a ranking — Mesa's identity, and the app's only UGC in Phase 1.

const { rankings, vibeNotes, restaurants, neighborhoods, userBlocks, user, follows, savedPlaces } =
  schema

// Vibe notes are deliberately short — one line, not a review.
const VIBE_MAX = 140

const placeSchema = z.object({
  restaurantId: z.string().uuid(),
  // 1-based slot in the user's list, as the pairwise flow settled it.
  position: z.number().int().min(1),
  vibeNote: z.string().trim().max(VIBE_MAX).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(4).optional(),
  // favoriteDish is NOT accepted here as of M11 — it's derived entirely from
  // POST /dishes' `alsoFavorite` flag now. zod strips the unknown key if an
  // un-reloaded dev client still sends one, rather than erroring.
})
const noteSchema = z.object({ body: z.string().trim().max(VIBE_MAX) })

export const rankingsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // My ordered list: rank, score, restaurant + neighborhood, and my vibe note
  // (if any, and not removed). One round trip via joins.
  // Returns the whole list, unpaginated and unfiltered — deliberately. Sorting
  // and filtering the "mine" tab happens on the client (see lib/rankingSort.ts):
  // this is one person's own list (bounded by places they've physically been),
  // the pairwise rank flow needs the complete ordered array in memory anyway,
  // and shareList / BarriosView both read the whole thing. The trigger to move
  // any of this server-side is PAGINATION, not filtering — don't parameterize
  // this the way /rankings/candidates (which queries the whole catalog) is.
  .get('/', async (c) => {
    const me = c.get('user')
    const rows = await db
      .select({
        id: rankings.id,
        position: rankings.position,
        score: rankings.score,
        createdAt: rankings.createdAt,
        tags: rankings.tags,
        favoriteDish: rankings.favoriteDish,
        restaurant: {
          id: restaurants.id,
          name: restaurants.name,
          cuisine: restaurants.cuisine,
          coverImageId: restaurants.coverImageId,
          priceTier: restaurants.priceTier,
          closesAt: restaurants.closesAt,
          phone: restaurants.phone,
          lat: restaurants.lat,
          lng: restaurants.lng,
        },
        neighborhood: neighborhoods.name,
        note: vibeNotes.body,
      })
      .from(rankings)
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        vibeNotes,
        and(
          eq(vibeNotes.userId, rankings.userId),
          eq(vibeNotes.restaurantId, rankings.restaurantId),
          isNull(vibeNotes.removedAt),
        ),
      )
      .where(eq(rankings.userId, me.id))
      .orderBy(asc(rankings.position))
    return c.json({ rankings: rows })
  })

  // Places I haven't ranked yet — the pool for rank-a-place's find step.
  // Query-driven with a limit, mirroring GET /restaurants: fetching the
  // WHOLE unranked catalog (once thousands of rows, post-Foursquare-import)
  // on every open of the rank flow, then filtering with String.includes in
  // the client, doesn't scale — RankAPlace.tsx now sends q/open as real
  // params instead. Re-ranking an already-ranked place is a separate path
  // (GET /rankings, always small — one user's own list — so it stays a plain
  // unfiltered fetch, searched client-side there).
  //
  // `reserve` was dropped: it filtered on `restaurants.phone is not null` for
  // a "Reservar" chip that led nowhere — Mesa has no reservation handoff (see
  // docs/BUILD_PLAN.md's note on the cut Milestone 5 feature).
  .get('/candidates', async (c) => {
    const me = c.get('user')
    const q = (c.req.query('q') ?? '').trim()
    const openNow = c.req.query('open') === '1'
    const hasQuery = q.length >= 2

    const mine = db
      .select({ id: rankings.restaurantId })
      .from(rankings)
      .where(eq(rankings.userId, me.id))

    const conds: (SQL | undefined)[] = [
      notInArray(restaurants.id, mine),
      isNull(restaurants.removedAt),
      isNull(restaurants.closedAt),
    ]
    if (openNow) conds.push(sql`${restaurants.closesAt} is not null`)
    let norm: ReturnType<typeof sql> | null = null
    if (hasQuery) {
      norm = sql`mesa_norm(${q})`
      conds.push(
        or(
          sql`${restaurants.nameKey} ilike '%' || ${norm} || '%'`,
          // Same fuzzy name match as the Explore search (WORD_MATCH_MIN in
          // routes/restaurants.ts) so "Olivia" finds "Casa Oliva" here too —
          // otherwise the rank flow's find step would offer the Google copy of a
          // place already in the catalog. Keep the two thresholds in sync.
          sql`word_similarity(${norm}, ${restaurants.nameKey}) >= 0.55`,
          sql`${restaurants.cuisineKey} ilike '%' || ${norm} || '%'`,
          sql`mesa_norm(${neighborhoods.name}) ilike '%' || ${norm} || '%'`,
        ),
      )
    }

    const rows = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        priceTier: restaurants.priceTier,
        closesAt: restaurants.closesAt,
        phone: restaurants.phone,
        lat: restaurants.lat,
        lng: restaurants.lng,
      })
      .from(restaurants)
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(and(...conds))
      .orderBy(
        norm
          ? sql`(${restaurants.nameKey} like ${norm} || '%') desc,
                similarity(${restaurants.nameKey}, ${norm}) desc,
                ${restaurants.name} asc`
          : asc(restaurants.name),
      )
      .limit(hasQuery ? 40 : 60)
    return c.json({ restaurants: rows })
  })

  // Another user's public ranked list + vibe notes — the surface where reporting
  // and blocking happen (M4's feed reuses the same visibility rules). Hidden if
  // the target is banned or either side has blocked the other.
  .get('/user/:userId', async (c) => {
    const me = c.get('user')
    const targetId = c.req.param('userId')

    const target = await db.query.user.findFirst({
      where: eq(user.id, targetId),
      columns: { id: true, name: true, handle: true, image: true, bannedAt: true },
      with: { neighborhood: { columns: { name: true } } },
    })
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    const block = await db
      .select({ b: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, targetId)),
          and(eq(userBlocks.blockerId, targetId), eq(userBlocks.blockedId, me.id)),
        ),
      )
      .limit(1)
    if (block.length > 0) return c.json({ error: 'not_found' }, 404)

    const rows = await db
      .select({
        id: rankings.id,
        position: rankings.position,
        score: rankings.score,
        restaurant: {
          id: restaurants.id,
          name: restaurants.name,
          cuisine: restaurants.cuisine,
          priceTier: restaurants.priceTier,
        },
        neighborhood: neighborhoods.name,
        noteId: vibeNotes.id,
        note: vibeNotes.body,
        tags: rankings.tags,
        favoriteDish: rankings.favoriteDish,
      })
      .from(rankings)
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        vibeNotes,
        and(
          eq(vibeNotes.userId, rankings.userId),
          eq(vibeNotes.restaurantId, rankings.restaurantId),
          isNull(vibeNotes.removedAt),
        ),
      )
      .where(eq(rankings.userId, targetId))
      .orderBy(asc(rankings.position))

    // Follow state + counts, so the passport can show a Follow button (M4).
    const [amFollowing] = await db
      .select({ x: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followerId, me.id), eq(follows.followingId, targetId)))
      .limit(1)
    const followerCount = await db.$count(follows, eq(follows.followingId, targetId))
    const followingCount = await db.$count(follows, eq(follows.followerId, targetId))

    // Match % (taste compatibility) — see tasteMatch.ts for the formula.
    // One query: count + avg gap over restaurants we've both ranked.
    const mine = aliasedTable(rankings, 'mine')
    const [match] = await db
      .select({
        shared: sql<number>`count(*)::int`,
        avgDiff: sql<number>`avg(abs(${mine.score} - ${rankings.score}))::float`,
      })
      .from(mine)
      .innerJoin(
        rankings,
        and(eq(rankings.restaurantId, mine.restaurantId), eq(rankings.userId, targetId)),
      )
      .where(eq(mine.userId, me.id))
    const matchPercent = match ? tasteMatch(match.avgDiff, match.shared) : null

    const { bannedAt: _drop, ...profile } = target
    return c.json({
      user: profile,
      rankings: rows,
      isFollowing: Boolean(amFollowing),
      followerCount,
      followingCount,
      matchPercent,
      sharedCount: match?.shared ?? 0,
    })
  })

  // The pair page (M16) — everything /match/[userId].tsx needs about a single
  // pair: both people, the score, and place-by-place agreement. `places` is one
  // join query (also where matchPercent's avgGap/sharedCount come from, so the
  // number on this page always matches the list under it); shared cuisines and
  // sectors come from those same shared places, not each person's full list —
  // it's the honest "what you actually overlap on", not a broader inference.
  .get('/user/:userId/match', async (c) => {
    const me = c.get('user')
    const targetId = c.req.param('userId')

    const [meProfile, target] = await Promise.all([
      db.query.user.findFirst({
        where: eq(user.id, me.id),
        columns: { id: true, name: true, handle: true, image: true },
      }),
      db.query.user.findFirst({
        where: eq(user.id, targetId),
        columns: { id: true, name: true, handle: true, image: true, bannedAt: true },
      }),
    ])
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    const block = await db
      .select({ b: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, targetId)),
          and(eq(userBlocks.blockerId, targetId), eq(userBlocks.blockedId, me.id)),
        ),
      )
      .limit(1)
    if (block.length > 0) return c.json({ error: 'not_found' }, 404)

    const mine = aliasedTable(rankings, 'mine')
    const sharedRows = await db
      .select({
        restaurantId: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        myPosition: mine.position,
        myScore: mine.score,
        theirPosition: rankings.position,
        theirScore: rankings.score,
      })
      .from(mine)
      .innerJoin(
        rankings,
        and(eq(rankings.restaurantId, mine.restaurantId), eq(rankings.userId, targetId)),
      )
      .innerJoin(restaurants, eq(restaurants.id, mine.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(eq(mine.userId, me.id))
      .orderBy(asc(sql`abs(${mine.score} - ${rankings.score})`))

    const sharedCount = sharedRows.length
    const avgGap =
      sharedCount > 0
        ? sharedRows.reduce((s, r) => s + Math.abs(r.myScore - r.theirScore), 0) / sharedCount
        : 0
    const matchPercent = tasteMatch(avgGap, sharedCount)

    const [myListSize, theirListSize] = await Promise.all([
      db.$count(rankings, eq(rankings.userId, me.id)),
      db.$count(rankings, eq(rankings.userId, targetId)),
    ])

    const sharedRestaurantIds = sharedRows.map((r) => r.restaurantId)
    const notTried = await db
      .select({
        restaurantId: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        position: rankings.position,
        score: rankings.score,
      })
      .from(rankings)
      .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(
        and(
          eq(rankings.userId, targetId),
          sharedRestaurantIds.length > 0
            ? notInArray(rankings.restaurantId, sharedRestaurantIds)
            : undefined,
        ),
      )
      .orderBy(asc(rankings.position))
      .limit(6)

    const sharedCuisines = [
      ...new Set(sharedRows.map((r) => r.cuisine).filter((c): c is string => Boolean(c))),
    ]
    const sharedNeighborhoods = [
      ...new Set(sharedRows.map((r) => r.neighborhood).filter((n): n is string => Boolean(n))),
    ]

    return c.json({
      me: meProfile,
      them: target,
      matchPercent,
      sharedCount,
      myListSize,
      theirListSize,
      places: sharedRows.map((r) => {
        const gap = Math.abs(r.myScore - r.theirScore)
        return {
          restaurantId: r.restaurantId,
          name: r.name,
          cuisine: r.cuisine,
          coverImageId: r.coverImageId,
          neighborhood: r.neighborhood,
          mine: { position: r.myPosition, score: r.myScore },
          theirs: { position: r.theirPosition, score: r.theirScore },
          gap,
          agree: isAgreement(gap),
        }
      }),
      sharedCuisines,
      sharedNeighborhoods,
      notTried,
    })
  })

  // Place a spot into my list at the position the pairwise flow chose, with an
  // optional vibe note. Rewrites positions/scores densely in one transaction.
  .post('/', async (c) => {
    const me = c.get('user')
    const parsed = placeSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const { restaurantId, position, vibeNote, tags } = parsed.data

    const exists = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, restaurantId),
      columns: { id: true, name: true },
    })
    if (!exists) return c.json({ error: 'unknown_restaurant' }, 400)

    let isFirstRanking = false
    await db.transaction(async (tx) => {
      await lockUserList(tx, me.id)
      const before = await currentOrder(tx, me.id)
      isFirstRanking = !before.includes(restaurantId)
      const order = before.filter((id) => id !== restaurantId)
      const idx = Math.min(Math.max(position - 1, 0), order.length)
      order.splice(idx, 0, restaurantId)
      await rewrite(tx, me.id, order)

      // Ranking a place resolves its "want to try" entry — a no-op delete if
      // it was never saved, so this is safe to run on every rank/re-rank.
      await tx
        .delete(savedPlaces)
        .where(and(eq(savedPlaces.userId, me.id), eq(savedPlaces.restaurantId, restaurantId)))

      if (tags !== undefined) {
        await tx
          .update(rankings)
          .set({ tags: tags.length ? tags : null })
          .where(and(eq(rankings.userId, me.id), eq(rankings.restaurantId, restaurantId)))
      }

      if (vibeNote && vibeNote.length > 0) {
        await tx
          .insert(vibeNotes)
          .values({ userId: me.id, restaurantId, body: vibeNote })
          .onConflictDoUpdate({
            target: [vibeNotes.userId, vibeNotes.restaurantId],
            set: { body: vibeNote, removedAt: null, updatedAt: new Date() },
          })
      }
    })

    // "A friend ranked a place you saved" — first ranking only (a re-rank/
    // reposition of a place you'd already ranked isn't news to anyone).
    // Recipients: people who follow ME (the one-directional "friend" this
    // app's feed already uses) and had this restaurant in their own saved
    // list, minus either direction of block.
    if (isFirstRanking) {
      const savers = await db
        .select({ userId: savedPlaces.userId })
        .from(savedPlaces)
        .where(
          and(
            eq(savedPlaces.restaurantId, restaurantId),
            inArray(savedPlaces.userId, followerIds(me.id)),
            notInArray(savedPlaces.userId, blockedByMe(me.id)),
            notInArray(savedPlaces.userId, blockedMe(me.id)),
          ),
        )
      sendPush(
        savers.map((s) => ({
          userId: s.userId,
          key: `saved-ranked:${restaurantId}:${s.userId}`,
          category: 'friends',
          title: 'Mesa',
          body: `${me.name || 'Alguien'} rankeó ${exists.name}, que tienes guardado`,
          data: { type: 'restaurant', restaurantId },
        })),
      )
    }

    return c.json({ ok: true })
  })

  // Set / replace / clear the vibe note on one of my rankings.
  .patch('/:id/note', async (c) => {
    const me = c.get('user')
    const parsed = noteSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const ranking = await db.query.rankings.findFirst({
      where: and(eq(rankings.id, c.req.param('id')), eq(rankings.userId, me.id)),
      columns: { restaurantId: true },
    })
    if (!ranking) return c.json({ error: 'not_found' }, 404)

    const body = parsed.data.body.trim()
    if (body.length === 0) {
      await db
        .delete(vibeNotes)
        .where(and(eq(vibeNotes.userId, me.id), eq(vibeNotes.restaurantId, ranking.restaurantId)))
      return c.json({ ok: true, note: null })
    }
    await db
      .insert(vibeNotes)
      .values({ userId: me.id, restaurantId: ranking.restaurantId, body })
      .onConflictDoUpdate({
        target: [vibeNotes.userId, vibeNotes.restaurantId],
        set: { body, removedAt: null, updatedAt: new Date() },
      })
    return c.json({ ok: true, note: body })
  })

  // Remove a spot from my list, then re-densify the remaining positions/scores.
  .delete('/:id', async (c) => {
    const me = c.get('user')
    const ranking = await db.query.rankings.findFirst({
      where: and(eq(rankings.id, c.req.param('id')), eq(rankings.userId, me.id)),
      columns: { restaurantId: true },
    })
    if (!ranking) return c.json({ error: 'not_found' }, 404)

    await db.transaction(async (tx) => {
      await lockUserList(tx, me.id)
      await tx.delete(rankings).where(eq(rankings.id, c.req.param('id')))
      await tx
        .delete(vibeNotes)
        .where(and(eq(vibeNotes.userId, me.id), eq(vibeNotes.restaurantId, ranking.restaurantId)))
      const order = (await currentOrder(tx, me.id)).filter((id) => id !== ranking.restaurantId)
      await rewrite(tx, me.id, order)
    })
    return c.json({ ok: true })
  })
