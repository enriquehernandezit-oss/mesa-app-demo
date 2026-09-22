import { db, schema } from '@mesa/db'
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Dish ranking (M20) — "Tus platos": once a member has posted the same dish
// (by nameKey) at 3+ restaurants, routes/dishes.ts auto-creates a dish_lists
// row and returns a nudge to rank it. This file is everything after that:
// list the member's dish lists, show one's full detail (ranked + any
// not-yet-placed restaurants), record a finished pairwise session's order,
// and dismiss a nudge without ranking. Nothing here ever creates a list —
// that stays exclusively routes/dishes.ts's job, so "3+ restaurants" is the
// one and only trigger.
const { dishLists, dishListItems, dishes, restaurants, neighborhoods } = schema

async function loadOwnedList(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const row = await db.query.dishLists.findFirst({
    where: and(eq(dishLists.id, id), eq(dishLists.userId, userId)),
  })
  return row ?? null
}

const orderSchema = z.object({
  restaurantIds: z.array(z.string().uuid()).min(1),
})

export const dishListsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // "Tus platos" on Profile — every dish list I have, ranked or not.
  // restaurantCount always comes live from `dishes` (not dish_list_items),
  // so an unranked list's count keeps growing if more posts arrive before
  // the member gets to it.
  .get('/', async (c) => {
    const me = c.get('user')
    const rows = await db
      .select({
        id: dishLists.id,
        nameKey: dishLists.nameKey,
        label: dishLists.label,
        rankedAt: dishLists.rankedAt,
        restaurantCount: sql<number>`count(distinct ${dishes.restaurantId})::int`,
      })
      .from(dishLists)
      .innerJoin(
        dishes,
        and(
          eq(dishes.userId, dishLists.userId),
          eq(dishes.nameKey, dishLists.nameKey),
          isNull(dishes.removedAt),
        ),
      )
      .where(eq(dishLists.userId, me.id))
      .groupBy(dishLists.id)
      .orderBy(asc(dishLists.label))
    return c.json({ lists: rows })
  })

  // One list's full contents — the ranked order plus any restaurant that has
  // posted this dish since (or before the member got to a prior nudge) but
  // isn't placed yet. `dish` on each entry is looked up by (me, nameKey,
  // restaurantId) — see dishLists.ts schema's own header for why restaurantId
  // alone is enough to find it back.
  .get('/:id', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedList(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)

    const dishCols = {
      id: dishes.id,
      name: dishes.name,
      caption: dishes.caption,
      imageId: dishes.imageId,
      sentiment: dishes.sentiment,
    }
    const restaurantCols = {
      id: restaurants.id,
      name: restaurants.name,
      cuisine: restaurants.cuisine,
      priceTier: restaurants.priceTier,
      coverImageId: restaurants.coverImageId,
    }

    const rankedRows = await db
      .select({
        position: dishListItems.position,
        restaurant: restaurantCols,
        neighborhood: neighborhoods.name,
        dish: dishCols,
      })
      .from(dishListItems)
      .innerJoin(restaurants, eq(restaurants.id, dishListItems.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .innerJoin(
        dishes,
        and(
          eq(dishes.userId, found.userId),
          eq(dishes.nameKey, found.nameKey),
          eq(dishes.restaurantId, dishListItems.restaurantId),
          isNull(dishes.removedAt),
        ),
      )
      .where(eq(dishListItems.listId, found.id))
      .orderBy(asc(dishListItems.position))

    const placedIds = rankedRows.map((r) => r.restaurant.id)
    const unrankedRows = await db
      .select({
        restaurant: restaurantCols,
        neighborhood: neighborhoods.name,
        dish: dishCols,
      })
      .from(dishes)
      .innerJoin(restaurants, eq(restaurants.id, dishes.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(
        and(
          eq(dishes.userId, found.userId),
          eq(dishes.nameKey, found.nameKey),
          isNull(dishes.removedAt),
          placedIds.length > 0 ? notInArray(dishes.restaurantId, placedIds) : undefined,
        ),
      )

    return c.json({
      id: found.id,
      label: found.label,
      nameKey: found.nameKey,
      rankedAt: found.rankedAt,
      ranked: rankedRows,
      unranked: unrankedRows,
    })
  })

  // Records a finished (or re-run) pairwise session — the full final order,
  // restaurant ids only. Every id must be a live, not-removed dish of mine
  // for this exact list's nameKey; anything else is rejected outright rather
  // than silently dropped, since a partial write here would desync the
  // ranked/unranked split the detail route depends on.
  .put('/:id/order', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedList(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    const parsed = orderSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const { restaurantIds } = parsed.data
    if (new Set(restaurantIds).size !== restaurantIds.length) {
      return c.json({ error: 'duplicate_restaurant' }, 400)
    }

    const mine = await db
      .select({ restaurantId: dishes.restaurantId })
      .from(dishes)
      .where(
        and(
          eq(dishes.userId, found.userId),
          eq(dishes.nameKey, found.nameKey),
          isNull(dishes.removedAt),
          inArray(dishes.restaurantId, restaurantIds),
        ),
      )
    if (mine.length !== restaurantIds.length) {
      return c.json({ error: 'unknown_restaurant' }, 400)
    }

    await db.transaction(async (tx) => {
      await tx.delete(dishListItems).where(eq(dishListItems.listId, found.id))
      await tx.insert(dishListItems).values(
        restaurantIds.map((restaurantId, i) => ({
          listId: found.id,
          restaurantId,
          position: i + 1,
        })),
      )
      await tx.update(dishLists).set({ rankedAt: new Date() }).where(eq(dishLists.id, found.id))
    })
    return c.json({ ok: true })
  })

  // Dismiss the nudge — stops the inline card and the ~20h push for this
  // list without ranking it. Profile's "Tus platos" still reaches it anytime.
  .post('/:id/dismiss', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedList(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    await db.update(dishLists).set({ dismissedAt: new Date() }).where(eq(dishLists.id, found.id))
    return c.json({ ok: true })
  })
