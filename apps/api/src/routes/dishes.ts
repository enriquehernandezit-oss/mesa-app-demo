import { DISH_CATEGORIES, DISH_GROUPS, db, guessDishCategory, mesaNorm, schema } from '@mesa/db'
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Dish posts (Phase 6; categorized + photo-optional as of M11). A dish is
// evidence attached to one of your own rankings — linking to a ranking is
// required, so you can only post a dish for a place you've ranked. The image
// is a client-resized data URL in dev (no Cloudinary); in prod this endpoint
// would instead take a Cloudinary public id from a signed direct upload.
// Soft-removal + reporting (via 'dish' report target) satisfy App Store 1.2.
const { dishes, rankings, user, follows, userBlocks } = schema

// ~700 KB cap on the inline data URL (a resized ~1280px JPEG lands well under).
const MAX_IMAGE_CHARS = 700_000

const createSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  caption: z.string().trim().max(140).optional(),
  // Optional as of M11 — a dish with a name and category but no photo is a
  // first-class row, not a broken one.
  image: z
    .string()
    .max(MAX_IMAGE_CHARS)
    // A resized data-image URL (dev) or an https URL (prod / Cloudinary).
    // Plain http and any other scheme are rejected so a stored value can't
    // smuggle a tracking pixel or a javascript: href into others' feeds.
    // Tighten to a bare Cloudinary public id once signed uploads are wired.
    .refine(
      (s) => s.startsWith('data:image/') || s.startsWith('https://'),
      'image must be a data URL or https URL',
    )
    .optional(),
  // A follow-up post (M13's "saved as you tap") that wants to clear a photo
  // set by an earlier one — plain omission of `image` means "leave it as is"
  // (see the upsert doc comment below), so removal needs its own explicit
  // signal. Ignored on insert; there's nothing to clear yet.
  removeImage: z.boolean().optional(),
  // Optional as of M13 — the rank flow never asks for a category (that's the
  // whole point: nobody should have to categorize their own food), so this
  // falls back to guessDishCategory(name) server-side. The standalone
  // composer still sends one explicitly (its own guess, pill-correctable).
  categoryId: z.string().optional(),
  sentiment: z.enum(['loved', 'fine', 'disliked']).optional(),
  grain: z.enum(['candlelit', 'daylight', 'none']).default('none'),
  visibility: z.enum(['friends', 'public']).default('friends'),
  alsoFavorite: z.boolean().optional(),
})

export const dishesRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // The closed category taxonomy, with keywords, for the picker's search.
  // Served straight from the in-memory list (the same one the POST handler
  // validates against and the backfill script guesses from) — no DB query,
  // since packages/db's seed migration and this module share one source.
  .get('/categories', (c) => {
    c.header('Cache-Control', 'private, max-age=60')
    return c.json({ groups: DISH_GROUPS, categories: DISH_CATEGORIES })
  })

  // Distinct dish names already logged at a restaurant, most-common first —
  // the chip source for the reveal's "¿Qué pediste?" step (M13). Aggregated names
  // and counts ONLY, never dish rows or posters: a name several people have
  // logged is catalog data, not any one person's content, so this
  // deliberately skips the visibility/block filters every other dish query
  // applies. One query, grouped on the same generated nameKey column the
  // search index already uses.
  .get('/restaurant/:id/names', async (c) => {
    const id = c.req.param('id')
    if (!z.string().uuid().safeParse(id).success) return c.json({ names: [] })

    const rows = await db
      .select({
        nameKey: dishes.nameKey,
        label: sql<string>`mode() within group (order by ${dishes.name})`,
        count: sql<number>`count(*)::int`,
        categoryId: sql<string>`coalesce(mode() within group (order by ${dishes.categoryId}), 'otro')`,
      })
      .from(dishes)
      .innerJoin(user, eq(user.id, dishes.userId))
      .where(and(eq(dishes.restaurantId, id), isNull(dishes.removedAt), isNull(user.bannedAt)))
      .groupBy(dishes.nameKey)
      .orderBy(desc(sql`count(*)`), asc(dishes.nameKey))
      .limit(20)

    c.header('Cache-Control', 'private, max-age=60')
    return c.json({ names: rows })
  })

  // Post a dish. The linked ranking is derived from my ranking of this place —
  // if I haven't ranked it, I can't post a dish for it. Upserts on
  // (rankingId, nameKey, not removed) regardless of image state — the reveal
  // step (M13) posts a dish the instant it's picked and then re-posts on
  // every sentiment change or photo attach, so "already has this dish, no
  // photo yet" and "already has this dish, now attaching a photo" both need
  // to land on the SAME row, not a second one. `imageId`/`grain` are only
  // included in the update when this call actually sent an image, so a
  // sentiment-only re-post can never blank out a photo a previous call set —
  // clearing one takes the explicit `removeImage` flag instead of bare
  // omission. The backfill script's own anti-join uses this identical rule.
  .post('/', async (c) => {
    const me = c.get('user')
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    const {
      restaurantId,
      name,
      caption,
      image,
      removeImage,
      categoryId: requestedCategoryId,
      sentiment,
      grain,
      visibility,
      alsoFavorite,
    } = parsed.data

    if (requestedCategoryId && !DISH_CATEGORIES.some((cat) => cat.id === requestedCategoryId)) {
      return c.json({ error: 'unknown_category' }, 400)
    }
    const categoryId = requestedCategoryId ?? guessDishCategory(name)

    const [myRanking] = await db
      .select({ id: rankings.id })
      .from(rankings)
      .where(and(eq(rankings.userId, me.id), eq(rankings.restaurantId, restaurantId)))
      .limit(1)
    if (!myRanking) return c.json({ error: 'rank_it_first' }, 400)

    let dishId: string | undefined
    let created = true

    const [existing] = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(
        and(
          eq(dishes.rankingId, myRanking.id),
          eq(dishes.nameKey, mesaNorm(name)),
          isNull(dishes.removedAt),
        ),
      )
      .limit(1)
    if (existing) {
      await db
        .update(dishes)
        .set({
          categoryId,
          sentiment: sentiment ?? null,
          updatedAt: new Date(),
          ...(image ? { imageId: image, grain } : removeImage ? { imageId: null } : {}),
        })
        .where(eq(dishes.id, existing.id))
      dishId = existing.id
      created = false
    }

    if (!dishId) {
      const [dish] = await db
        .insert(dishes)
        .values({
          userId: me.id,
          rankingId: myRanking.id,
          restaurantId,
          name,
          caption: caption || null,
          imageId: image ?? null,
          categoryId,
          sentiment: sentiment ?? null,
          grain,
          visibility,
        })
        .returning({ id: dishes.id })
      dishId = dish?.id
    }

    // Optional: also set this as the ranking's favorite dish (no schema change —
    // integrates with the existing rankings.favoriteDish field).
    if (alsoFavorite) {
      await db.update(rankings).set({ favoriteDish: name }).where(eq(rankings.id, myRanking.id))
    }

    return c.json({ ok: true, id: dishId, created })
  })

  // Popular dishes at a place — visible ones (mine, public, or from people I
  // follow), newest first. One query with the block/visibility rules. This
  // rail is photo-led, so a photo-less dish (a bare "Qué pedir" pick with no
  // image) is excluded rather than rendered with a placeholder.
  .get('/restaurant/:id', async (c) => {
    const me = c.get('user')
    const id = c.req.param('id')

    const rows = await db
      .select({
        id: dishes.id,
        name: dishes.name,
        caption: dishes.caption,
        imageId: dishes.imageId,
        categoryId: dishes.categoryId,
        grain: dishes.grain,
        createdAt: dishes.createdAt,
        user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      })
      .from(dishes)
      .innerJoin(user, eq(user.id, dishes.userId))
      // Block filter is in the WHERE, not a JS post-filter: filtering after
      // .limit(12) returned FEWER than 12 dishes whenever a blocked poster sat
      // in the top 12, even when more visible dishes existed below. Both
      // directions, matching the feed — a block is symmetric.
      .where(
        and(
          eq(dishes.restaurantId, id),
          isNull(dishes.removedAt),
          sql`${dishes.imageId} is not null`,
          isNull(user.bannedAt),
          notInArray(dishes.userId, blockedByMe(me.id)),
          notInArray(dishes.userId, blockedMe(me.id)),
          or(
            eq(dishes.userId, me.id),
            eq(dishes.visibility, 'public'),
            inArray(dishes.userId, followingIds(me.id)),
          ),
        ),
      )
      .orderBy(desc(dishes.createdAt))
      .limit(12)

    return c.json({ dishes: rows })
  })

  // One dish + its linked ranking summary (Phase 6 dish detail, screen C3).
  // Visible if it's mine, public, or from someone I follow — and never if the
  // poster is banned or blocked. Returns the linked place so the detail can show
  // the characteristics block + the poster's own score, attributed.
  .get('/:id', async (c) => {
    const me = c.get('user')
    const id = c.req.param('id')
    // A malformed id would otherwise reach Postgres as an invalid uuid cast
    // and surface as a 500 — reject it as not-found before it gets there.
    if (!z.string().uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404)
    const { restaurants, neighborhoods } = schema

    const [row] = await db
      .select({
        id: dishes.id,
        name: dishes.name,
        caption: dishes.caption,
        imageId: dishes.imageId,
        categoryId: dishes.categoryId,
        grain: dishes.grain,
        createdAt: dishes.createdAt,
        visibility: dishes.visibility,
        user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
        score: rankings.score,
        restaurant: {
          id: restaurants.id,
          name: restaurants.name,
          cuisine: restaurants.cuisine,
          priceTier: restaurants.priceTier,
          phone: restaurants.phone,
          website: restaurants.website,
          closesAt: restaurants.closesAt,
          lat: restaurants.lat,
          lng: restaurants.lng,
          coverImageId: restaurants.coverImageId,
        },
        neighborhood: neighborhoods.name,
      })
      .from(dishes)
      .innerJoin(user, eq(user.id, dishes.userId))
      .innerJoin(rankings, eq(rankings.id, dishes.rankingId))
      .innerJoin(restaurants, eq(restaurants.id, dishes.restaurantId))
      .innerJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .where(and(eq(dishes.id, id), isNull(dishes.removedAt), isNull(user.bannedAt)))
      .limit(1)
    if (!row) return c.json({ error: 'not_found' }, 404)

    // Visibility: mine, public, someone I follow — or, unconditionally, a
    // moderator's. The moderation queue links straight to this endpoint so a
    // report can be reviewed with real context, and a moderator reviewing a
    // report is very often looking at exactly the case they don't follow the
    // poster — the same visibility gate that protects everyone else would
    // otherwise 404 the one person whose job is to look at it. Moderators
    // could already act on any dish blind via DELETE /moderation/dishes/:id;
    // this only lets them see it first.
    const posterIsMe = row.user.id === me.id
    if (!posterIsMe && !me.isModerator && row.visibility !== 'public') {
      const [f] = await db
        .select({ id: follows.followingId })
        .from(follows)
        .where(and(eq(follows.followerId, me.id), eq(follows.followingId, row.user.id)))
        .limit(1)
      if (!f) return c.json({ error: 'not_found' }, 404)
    }
    // Never surface a dish when either of us has blocked the other (symmetric)
    // — including for a moderator, who still shouldn't see a blocked poster's
    // content through this path (they have the queue for that).
    if (!posterIsMe) {
      const [blocked] = await db
        .select({ id: userBlocks.blockerId })
        .from(userBlocks)
        .where(
          or(
            and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, row.user.id)),
            and(eq(userBlocks.blockerId, row.user.id), eq(userBlocks.blockedId, me.id)),
          ),
        )
        .limit(1)
      if (blocked) return c.json({ error: 'not_found' }, 404)
    }

    const { visibility: _v, ...dish } = row
    return c.json({ dish: { ...dish, posterIsMe } })
  })

  // Soft-remove my own dish, and clear it as the ranking's favorite pick if
  // it was one — favoriteDish always mirrors a live dish now, never a
  // dangling name.
  .delete('/:id', async (c) => {
    const me = c.get('user')
    const found = await db.query.dishes.findFirst({
      where: and(eq(dishes.id, c.req.param('id')), eq(dishes.userId, me.id)),
      columns: { id: true, name: true, rankingId: true },
    })
    if (!found) return c.json({ error: 'not_found' }, 404)
    await db.update(dishes).set({ removedAt: new Date() }).where(eq(dishes.id, found.id))
    await db
      .update(rankings)
      .set({ favoriteDish: null })
      .where(and(eq(rankings.id, found.rankingId), eq(rankings.favoriteDish, found.name)))
    return c.json({ ok: true })
  })
