import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { isUuid } from '../lib/ids'
import { dishVisibleTo, visibleDish } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Want-to-try lists — the "Guardados" tab beside Rankings (M19). Two master
// lists (this file): saved_places (restaurants, pre-existing) and
// saved_dishes (new). Named lists layered on top of both live in
// routes/collections.ts. The one rule enforced HERE rather than there:
// unsaving a place/dish from its master list also removes it from every
// named list it was added to — see each DELETE handler's own comment.
const {
  savedPlaces,
  savedDishes,
  restaurants,
  neighborhoods,
  dishes,
  collections,
  collectionItems,
  user,
} = schema
const saveSchema = z.object({ restaurantId: z.string().uuid() })
const saveDishSchema = z.object({ dishId: z.string().uuid() })

export const savedRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .get('/', async (c) => {
    const me = c.get('user')
    const rows = await db
      .select({
        restaurant: {
          id: restaurants.id,
          name: restaurants.name,
          cuisine: restaurants.cuisine,
          priceTier: restaurants.priceTier,
          // The picture on a saved-place row (Your list); null → the name card.
          coverImageId: restaurants.coverImageId,
        },
        neighborhood: neighborhoods.name,
        savedAt: savedPlaces.createdAt,
      })
      .from(savedPlaces)
      .innerJoin(restaurants, eq(restaurants.id, savedPlaces.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(eq(savedPlaces.userId, me.id))
      .orderBy(asc(restaurants.name))
    return c.json({ saved: rows })
  })

  .post('/', async (c) => {
    const me = c.get('user')
    const parsed = saveSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    // The place must exist and be listed: an unknown id used to hit the foreign key (a 500), and a
    // place a moderator removed or that has permanently closed is not something to save.
    const place = await db.query.restaurants.findFirst({
      where: and(
        eq(restaurants.id, parsed.data.restaurantId),
        isNull(restaurants.removedAt),
        isNull(restaurants.closedAt),
      ),
      columns: { id: true },
    })
    if (!place) return c.json({ error: 'not_found' }, 404)
    // Idempotent: saving twice is a no-op.
    await db
      .insert(savedPlaces)
      .values({ userId: me.id, restaurantId: parsed.data.restaurantId })
      .onConflictDoNothing()
    return c.json({ ok: true })
  })

  // Unsave — removes the master save AND every named list it's in. A member
  // tapping the bookmark off expects the place gone from Guardados
  // entirely, not orphaned inside a list they forgot they'd added it to.
  .delete('/:restaurantId', async (c) => {
    const me = c.get('user')
    const restaurantId = c.req.param('restaurantId')
    if (!isUuid(restaurantId)) return c.json({ error: 'not_found' }, 404)
    const myCollections = db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.userId, me.id))
    await db.transaction(async (tx) => {
      await tx
        .delete(savedPlaces)
        .where(and(eq(savedPlaces.userId, me.id), eq(savedPlaces.restaurantId, restaurantId)))
      await tx
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.restaurantId, restaurantId),
            inArray(collectionItems.collectionId, myCollections),
          ),
        )
    })
    return c.json({ ok: true })
  })

  // The dish equivalent of the three routes above.
  .get('/dishes', async (c) => {
    const me = c.get('user')
    const rows = await db
      .select({
        dish: { id: dishes.id, name: dishes.name, imageId: dishes.imageId },
        restaurant: { id: restaurants.id, name: restaurants.name },
        savedAt: savedDishes.createdAt,
      })
      .from(savedDishes)
      .innerJoin(dishes, eq(dishes.id, savedDishes.dishId))
      .innerJoin(user, eq(user.id, dishes.userId))
      .innerJoin(restaurants, eq(restaurants.id, dishes.restaurantId))
      // Saved earlier does not mean visible now: a dish that went private, was removed or whose
      // poster was banned or blocked drops out.
      .where(and(eq(savedDishes.userId, me.id), dishVisibleTo(me.id)))
      .orderBy(desc(savedDishes.createdAt))
    return c.json({ saved: rows })
  })

  .post('/dishes', async (c) => {
    const me = c.get('user')
    const parsed = saveDishSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const exists = await visibleDish(me.id, parsed.data.dishId)
    if (!exists) return c.json({ error: 'not_found' }, 404)
    await db
      .insert(savedDishes)
      .values({ userId: me.id, dishId: parsed.data.dishId })
      .onConflictDoNothing()
    return c.json({ ok: true })
  })

  .delete('/dishes/:dishId', async (c) => {
    const me = c.get('user')
    const dishId = c.req.param('dishId')
    if (!isUuid(dishId)) return c.json({ error: 'not_found' }, 404)
    const myCollections = db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.userId, me.id))
    await db.transaction(async (tx) => {
      await tx
        .delete(savedDishes)
        .where(and(eq(savedDishes.userId, me.id), eq(savedDishes.dishId, dishId)))
      await tx
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.dishId, dishId),
            inArray(collectionItems.collectionId, myCollections),
          ),
        )
    })
    return c.json({ ok: true })
  })
