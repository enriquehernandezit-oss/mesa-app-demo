import { db, schema } from '@mesa/db'
import { and, asc, eq, isNull, notInArray, or, sql } from 'drizzle-orm'
import { aliasedTable } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { scoreFor } from '../lib/score'
import { requireAuth } from '../middleware/session'

// The ranking loop — Mesa's atomic unit. A user keeps one ordered list of
// places they've been; the order (and the derived score) comes only from
// pairwise comparisons, never a star input. Vibe notes are the one-line "why"
// attached to a ranking — Mesa's identity, and the app's only UGC in Phase 1.

const { rankings, vibeNotes, restaurants, neighborhoods, userBlocks, user, follows, savedPlaces } =
  schema

// The transaction executor type, so helpers can run against either db or an open
// transaction without an unsafe cast.
type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Vibe notes are deliberately short — one line, not a review.
const VIBE_MAX = 140

const placeSchema = z.object({
  restaurantId: z.string().uuid(),
  // 1-based slot in the user's list, as the pairwise flow settled it.
  position: z.number().int().min(1),
  vibeNote: z.string().trim().max(VIBE_MAX).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(4).optional(),
  favoriteDish: z.string().trim().max(60).optional(),
})
const noteSchema = z.object({ body: z.string().trim().max(VIBE_MAX) })

// Read the user's current order as restaurantIds, best-first. Takes the executor
// (db or an open transaction) so callers inside a tx see in-flight state. Small
// list, so a full read is cheap.
async function currentOrder(exec: Executor, userId: string): Promise<string[]> {
  const rows = await exec
    .select({ restaurantId: rankings.restaurantId })
    .from(rankings)
    .where(eq(rankings.userId, userId))
    .orderBy(asc(rankings.position))
  return rows.map((r) => r.restaurantId)
}

// Rewrite the whole list's positions (dense 1..n) and derived scores in one
// upsert. The list is per-user and small, so a full rewrite is simpler and
// safer than shifting a window of rows, and it's a single statement.
async function rewrite(tx: Executor, userId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return
  const total = orderedIds.length
  await tx
    .insert(rankings)
    .values(
      orderedIds.map((restaurantId, i) => ({
        userId,
        restaurantId,
        position: i + 1,
        score: scoreFor(i, total),
      })),
    )
    .onConflictDoUpdate({
      target: [rankings.userId, rankings.restaurantId],
      set: { position: sql`excluded.position`, score: sql`excluded.score`, updatedAt: new Date() },
    })
}

export const rankingsRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // My ordered list: rank, score, restaurant + neighborhood, and my vibe note
  // (if any, and not removed). One round trip via joins.
  .get('/', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const rows = await db
      .select({
        id: rankings.id,
        position: rankings.position,
        score: rankings.score,
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
  // the client, doesn't scale — RankAPlace.tsx now sends q/open/reserve as
  // real params instead. Re-ranking an already-ranked place is a separate
  // path (GET /rankings, always small — one user's own list — so it stays a
  // plain unfiltered fetch, searched client-side there).
  .get('/candidates', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const q = (c.req.query('q') ?? '').trim()
    const openNow = c.req.query('open') === '1'
    const reserveOnly = c.req.query('reserve') === '1'
    const hasQuery = q.length >= 2

    const mine = db
      .select({ id: rankings.restaurantId })
      .from(rankings)
      .where(eq(rankings.userId, me.id))

    const conds = [
      notInArray(restaurants.id, mine),
      isNull(restaurants.removedAt),
      isNull(restaurants.closedAt),
    ]
    if (openNow) conds.push(sql`${restaurants.closesAt} is not null`)
    if (reserveOnly) conds.push(sql`${restaurants.phone} is not null`)
    let norm: ReturnType<typeof sql> | null = null
    if (hasQuery) {
      norm = sql`mesa_norm(${q})`
      const searchCond = or(
        sql`${restaurants.nameKey} ilike '%' || ${norm} || '%'`,
        sql`${restaurants.cuisineKey} ilike '%' || ${norm} || '%'`,
        sql`mesa_norm(${neighborhoods.name}) ilike '%' || ${norm} || '%'`,
      )
      if (searchCond) conds.push(searchCond)
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
    if (!me) return c.json({ error: 'unauthorized' }, 401)
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

    // Match % (Beli-style taste compatibility): over restaurants we've both
    // ranked, 100 minus the average score gap. Needs ≥2 shared spots.
    const mine = aliasedTable(rankings, 'mine')
    const [match] = await db
      .select({
        shared: sql<number>`count(*)::int`,
        avgDiff: sql<number>`avg(abs(${mine.score} - ${rankings.score}))`,
      })
      .from(mine)
      .innerJoin(
        rankings,
        and(eq(rankings.restaurantId, mine.restaurantId), eq(rankings.userId, targetId)),
      )
      .where(eq(mine.userId, me.id))
    const matchPercent =
      match && match.shared >= 2
        ? Math.max(0, Math.min(100, Math.round(100 - match.avgDiff)))
        : null

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

  // Place a spot into my list at the position the pairwise flow chose, with an
  // optional vibe note. Rewrites positions/scores densely in one transaction.
  .post('/', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const parsed = placeSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const { restaurantId, position, vibeNote, tags, favoriteDish } = parsed.data

    const exists = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, restaurantId),
      columns: { id: true },
    })
    if (!exists) return c.json({ error: 'unknown_restaurant' }, 400)

    await db.transaction(async (tx) => {
      const order = (await currentOrder(tx, me.id)).filter((id) => id !== restaurantId)
      const idx = Math.min(Math.max(position - 1, 0), order.length)
      order.splice(idx, 0, restaurantId)
      await rewrite(tx, me.id, order)

      // Ranking a place resolves its "want to try" entry — a no-op delete if
      // it was never saved, so this is safe to run on every rank/re-rank.
      await tx
        .delete(savedPlaces)
        .where(and(eq(savedPlaces.userId, me.id), eq(savedPlaces.restaurantId, restaurantId)))

      if (tags?.length || favoriteDish) {
        await tx
          .update(rankings)
          .set({ tags: tags ?? null, favoriteDish: favoriteDish ?? null })
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
    return c.json({ ok: true })
  })

  // Set / replace / clear the vibe note on one of my rankings.
  .patch('/:id/note', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
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
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const ranking = await db.query.rankings.findFirst({
      where: and(eq(rankings.id, c.req.param('id')), eq(rankings.userId, me.id)),
      columns: { restaurantId: true },
    })
    if (!ranking) return c.json({ error: 'not_found' }, 404)

    await db.transaction(async (tx) => {
      await tx.delete(rankings).where(eq(rankings.id, c.req.param('id')))
      await tx
        .delete(vibeNotes)
        .where(and(eq(vibeNotes.userId, me.id), eq(vibeNotes.restaurantId, ranking.restaurantId)))
      const order = (await currentOrder(tx, me.id)).filter((id) => id !== ranking.restaurantId)
      await rewrite(tx, me.id, order)
    })
    return c.json({ ok: true })
  })
