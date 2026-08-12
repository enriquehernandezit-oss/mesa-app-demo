import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Dish posts (Phase 6). A dish is a photo attached to one of your own rankings —
// linking to a ranking is required, so you can only post a dish for a place
// you've ranked. The image is a client-resized data URL in dev (no Cloudinary);
// in prod this endpoint would instead take a Cloudinary public id from a signed
// direct upload. Soft-removal + reporting (via 'dish' report target) satisfy
// App Store 1.2.
const { dishes, rankings, user, follows, userBlocks } = schema

// ~700 KB cap on the inline data URL (a resized ~1280px JPEG lands well under).
const MAX_IMAGE_CHARS = 700_000

const createSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  caption: z.string().trim().max(140).optional(),
  image: z
    .string()
    .max(MAX_IMAGE_CHARS)
    .refine(
      (s) => s.startsWith('data:image/') || s.startsWith('http'),
      'image must be a data URL or URL',
    ),
  grain: z.enum(['candlelit', 'daylight', 'none']).default('none'),
  visibility: z.enum(['friends', 'public']).default('friends'),
  alsoFavorite: z.boolean().optional(),
})

export const dishesRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // Post a dish. The linked ranking is derived from my ranking of this place —
  // if I haven't ranked it, I can't post a dish for it.
  .post('/', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    const { restaurantId, name, caption, image, grain, visibility, alsoFavorite } = parsed.data

    const [myRanking] = await db
      .select({ id: rankings.id })
      .from(rankings)
      .where(and(eq(rankings.userId, me.id), eq(rankings.restaurantId, restaurantId)))
      .limit(1)
    if (!myRanking) return c.json({ error: 'rank_it_first' }, 400)

    const [dish] = await db
      .insert(dishes)
      .values({
        userId: me.id,
        rankingId: myRanking.id,
        restaurantId,
        name,
        caption: caption || null,
        imageId: image,
        grain,
        visibility,
      })
      .returning({ id: dishes.id })

    // Optional: also set this as the ranking's favorite dish (no schema change —
    // integrates with the existing rankings.favoriteDish field).
    if (alsoFavorite) {
      await db.update(rankings).set({ favoriteDish: name }).where(eq(rankings.id, myRanking.id))
    }

    return c.json({ ok: true, id: dish?.id })
  })

  // Popular dishes at a place — visible ones (mine, public, or from people I
  // follow), newest first. One query with the block/visibility rules.
  .get('/restaurant/:id', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const id = c.req.param('id')

    const following = db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, me.id))
    const blockedEither = db
      .select({ id: userBlocks.blockedId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, me.id))

    const rows = await db
      .select({
        id: dishes.id,
        name: dishes.name,
        caption: dishes.caption,
        imageId: dishes.imageId,
        grain: dishes.grain,
        createdAt: dishes.createdAt,
        user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      })
      .from(dishes)
      .innerJoin(user, eq(user.id, dishes.userId))
      .where(
        and(
          eq(dishes.restaurantId, id),
          isNull(dishes.removedAt),
          isNull(user.bannedAt),
          or(
            eq(dishes.userId, me.id),
            eq(dishes.visibility, 'public'),
            inArray(dishes.userId, following),
          ),
        ),
      )
      .orderBy(desc(dishes.createdAt))
      .limit(12)

    // Drop dishes from anyone I've blocked (kept out of the SQL for clarity).
    const blocked = new Set((await blockedEither).map((b) => b.id))
    return c.json({ dishes: rows.filter((d) => !blocked.has(d.user.id)) })
  })

  // Soft-remove my own dish.
  .delete('/:id', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const found = await db.query.dishes.findFirst({
      where: and(eq(dishes.id, c.req.param('id')), eq(dishes.userId, me.id)),
      columns: { id: true },
    })
    if (!found) return c.json({ error: 'not_found' }, 404)
    await db.update(dishes).set({ removedAt: new Date() }).where(eq(dishes.id, found.id))
    return c.json({ ok: true })
  })
