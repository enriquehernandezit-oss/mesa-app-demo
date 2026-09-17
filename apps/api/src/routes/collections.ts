import { db, schema } from '@mesa/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Named lists (M19) — user-created folders layered on top of the two master
// "want to try" lists (routes/saved.ts). A list's items always ALSO live in
// their master list (enforced here, on add); removing an item from just one
// list (below) leaves it in the master and any other list — the master-level
// "remove everywhere" unsave lives in saved.ts instead.
const {
  collections,
  collectionItems,
  restaurants,
  neighborhoods,
  dishes,
  rankings,
  savedPlaces,
  savedDishes,
} = schema

const NAME_MAX = 60
const createSchema = z.object({ name: z.string().trim().min(1).max(NAME_MAX) })
const addItemSchema = z
  .object({
    restaurantId: z.string().uuid().optional(),
    dishId: z.string().uuid().optional(),
  })
  .refine((b) => Boolean(b.restaurantId) !== Boolean(b.dishId), {
    message: 'exactly one of restaurantId or dishId is required',
  })

async function loadOwnedCollection(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const row = await db.query.collections.findFirst({
    where: and(eq(collections.id, id), eq(collections.userId, userId)),
  })
  return row ?? null
}

export const collectionsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // `?restaurantId=` or `?dishId=` adds `itemId` per list (the matching
  // collection_items row, or null) — app/guardar.tsx's checkmarks AND the id
  // it needs to un-check one (DELETE .../items/:itemId), both from this one
  // query. Safe as a MAX(...) FILTER: the unique constraints on
  // collection_items guarantee at most one match per list. Cast to text —
  // Postgres has no MAX(uuid) — the cast is lossless for id equality and
  // there's at most one non-null value in the filtered set anyway.
  .get('/', async (c) => {
    const me = c.get('user')
    const restaurantId = c.req.query('restaurantId')
    const dishId = c.req.query('dishId')
    const matchedItemId = restaurantId
      ? sql<
          string | null
        >`max(${collectionItems.id}::text) filter (where ${collectionItems.restaurantId} = ${restaurantId})`
      : dishId
        ? sql<
            string | null
          >`max(${collectionItems.id}::text) filter (where ${collectionItems.dishId} = ${dishId})`
        : sql<string | null>`null`

    const rows = await db
      .select({
        id: collections.id,
        name: collections.name,
        createdAt: collections.createdAt,
        itemCount: sql<number>`count(${collectionItems.id})::int`,
        itemId: matchedItemId,
      })
      .from(collections)
      .leftJoin(collectionItems, eq(collectionItems.collectionId, collections.id))
      .where(eq(collections.userId, me.id))
      .groupBy(collections.id)
      .orderBy(desc(collections.createdAt))
    return c.json({ collections: rows })
  })

  .post('/', async (c) => {
    const me = c.get('user')
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const [row] = await db
      .insert(collections)
      .values({ userId: me.id, name: parsed.data.name })
      .onConflictDoNothing()
      .returning({ id: collections.id, name: collections.name })
    if (!row) return c.json({ error: 'name_taken' }, 409)
    return c.json(row)
  })

  .delete('/:id', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedCollection(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    await db.delete(collections).where(eq(collections.id, found.id))
    return c.json({ ok: true })
  })

  // A list's full contents — restaurant items carry my own ranking of that
  // place, if I've since ranked it ("Ya fuiste · #N" instead of the normal
  // saved-place row; see collectionItems' own header on why ranking a place
  // never removes it from a named list the way it clears the master one).
  .get('/:id', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedCollection(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)

    const rows = await db
      .select({
        itemId: collectionItems.id,
        addedAt: collectionItems.createdAt,
        restaurant: {
          id: restaurants.id,
          name: restaurants.name,
          cuisine: restaurants.cuisine,
          priceTier: restaurants.priceTier,
          coverImageId: restaurants.coverImageId,
        },
        neighborhood: neighborhoods.name,
        dish: { id: dishes.id, name: dishes.name, imageId: dishes.imageId },
        dishRestaurant: { id: dishes.restaurantId },
        myRanking: { position: rankings.position, score: rankings.score },
      })
      .from(collectionItems)
      .leftJoin(restaurants, eq(restaurants.id, collectionItems.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(dishes, eq(dishes.id, collectionItems.dishId))
      .leftJoin(
        rankings,
        and(eq(rankings.restaurantId, collectionItems.restaurantId), eq(rankings.userId, me.id)),
      )
      .where(eq(collectionItems.collectionId, found.id))
      .orderBy(desc(collectionItems.createdAt))

    return c.json({
      id: found.id,
      name: found.name,
      items: rows.map((r) => ({
        itemId: r.itemId,
        addedAt: r.addedAt,
        restaurant: r.restaurant?.id
          ? {
              ...r.restaurant,
              neighborhood: r.neighborhood,
              myRanking: r.myRanking?.position ? r.myRanking : null,
            }
          : null,
        dish: r.dish?.id ? { ...r.dish, restaurantId: r.dishRestaurant?.id ?? null } : null,
      })),
    })
  })

  // Adding to a named list always also saves to the master list — a place
  // in a list you forgot to separately bookmark would otherwise vanish from
  // Guardados' own "saved places" section.
  .post('/:id/items', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedCollection(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    const parsed = addItemSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    if (parsed.data.restaurantId) {
      const restaurantId = parsed.data.restaurantId
      const exists = await db.query.restaurants.findFirst({
        where: eq(restaurants.id, restaurantId),
        columns: { id: true },
      })
      if (!exists) return c.json({ error: 'unknown_restaurant' }, 400)
      await db.transaction(async (tx) => {
        await tx.insert(savedPlaces).values({ userId: me.id, restaurantId }).onConflictDoNothing()
        await tx
          .insert(collectionItems)
          .values({ collectionId: found.id, restaurantId })
          .onConflictDoNothing()
      })
    } else {
      const dishId = parsed.data.dishId as string
      const exists = await db.query.dishes.findFirst({
        where: eq(dishes.id, dishId),
        columns: { id: true },
      })
      if (!exists) return c.json({ error: 'unknown_dish' }, 400)
      await db.transaction(async (tx) => {
        await tx.insert(savedDishes).values({ userId: me.id, dishId }).onConflictDoNothing()
        await tx
          .insert(collectionItems)
          .values({ collectionId: found.id, dishId })
          .onConflictDoNothing()
      })
    }
    return c.json({ ok: true })
  })

  // Removes an item from just THIS list — the master save (and any other
  // list) is untouched. The master-level "remove everywhere" unsave is
  // DELETE /saved/:restaurantId or /saved/dishes/:dishId.
  .delete('/:id/items/:itemId', async (c) => {
    const me = c.get('user')
    const found = await loadOwnedCollection(c.req.param('id'), me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    await db
      .delete(collectionItems)
      .where(
        and(
          eq(collectionItems.id, c.req.param('itemId')),
          eq(collectionItems.collectionId, found.id),
        ),
      )
    return c.json({ ok: true })
  })
