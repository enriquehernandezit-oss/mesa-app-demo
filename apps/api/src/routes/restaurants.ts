import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Restaurant profile (M4): the place itself, which of the people you follow
// ranked it (with their scores + vibe notes), and your own state — saved or
// already ranked. The MapBox map and Cloudinary cover image arrive in M5; this
// ships the social substance. Each piece is one indexed read; none loop.
const { rankings, vibeNotes, restaurants, follows, userBlocks, user, savedPlaces } = schema

export const restaurantRoutes = new Hono<AppEnv>().use(requireAuth).get('/:id', async (c) => {
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

  return c.json({
    restaurant,
    friendsRankings,
    myRanking: myRanking ?? null,
    saved: Boolean(savedRow),
  })
})
