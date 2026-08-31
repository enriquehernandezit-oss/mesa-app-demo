import { db, schema } from '@mesa/db'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Want-to-try list — the "saved" tab beside Rankings. A place you haven't been
// yet; ranking it later moves it into the ordered list.
const { savedPlaces, restaurants, neighborhoods } = schema
const saveSchema = z.object({ restaurantId: z.string().uuid() })

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
    // Idempotent: saving twice is a no-op.
    await db
      .insert(savedPlaces)
      .values({ userId: me.id, restaurantId: parsed.data.restaurantId })
      .onConflictDoNothing()
    return c.json({ ok: true })
  })

  .delete('/:restaurantId', async (c) => {
    const me = c.get('user')
    await db
      .delete(savedPlaces)
      .where(
        and(
          eq(savedPlaces.userId, me.id),
          eq(savedPlaces.restaurantId, c.req.param('restaurantId')),
        ),
      )
    return c.json({ ok: true })
  })
