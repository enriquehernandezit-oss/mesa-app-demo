import { db, schema } from '@mesa/db'
import { aliasedTable, and, asc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AuthedEnv } from '../context'
import { followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Editorial curated lists (Phase 6). The carousel shows each list with YOUR
// progress through it; the detail page shows its members with friend signal.
// Editorial-only — no user-created lists in Phase 1.
const { lists, listItems, restaurants, neighborhoods, rankings } = schema

export const listsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Carousel: every list with its size and how many of its spots I've ranked.
  // One grouped query — the "mine" count is a filtered join on my rankings.
  .get('/', async (c) => {
    const me = c.get('user')
    const rows = await db
      .select({
        id: lists.id,
        slug: lists.slug,
        title: lists.title,
        subtitle: lists.subtitle,
        coverImageId: lists.coverImageId,
        total: sql<number>`count(${listItems.restaurantId})::int`,
        mine: sql<number>`count(${rankings.id})::int`,
      })
      .from(lists)
      .leftJoin(listItems, eq(listItems.listId, lists.id))
      .leftJoin(
        rankings,
        and(eq(rankings.restaurantId, listItems.restaurantId), eq(rankings.userId, me.id)),
      )
      .groupBy(lists.id)
      .orderBy(asc(lists.sortOrder))
    return c.json({ lists: rows })
  })

  // One list + its members in order, each with the friend signal. One query.
  .get('/:slug', async (c) => {
    const me = c.get('user')
    const list = await db.query.lists.findFirst({ where: eq(lists.slug, c.req.param('slug')) })
    if (!list) return c.json({ error: 'not_found' }, 404)

    const following = followingIds(me.id)

    // Second aliased join for "did I rank it" — the join above is already
    // filtered to people I follow, so it can't also answer that. Safe to
    // aggregate with max() rather than adding to GROUP BY: rankings is unique
    // on (userId, restaurantId), so `mine` contributes at most one row per
    // restaurant and can't inflate friendAvg/friendCount.
    const mine = aliasedTable(rankings, 'mine')

    const items = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisine: restaurants.cuisine,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        priceTier: restaurants.priceTier,
        position: listItems.position,
        friendAvg: sql<number | null>`avg(${rankings.score})::float`,
        friendCount: sql<number>`count(${rankings.id})::int`,
        myScore: sql<number | null>`max(${mine.score})::float`,
      })
      .from(listItems)
      .innerJoin(restaurants, eq(restaurants.id, listItems.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        rankings,
        and(eq(rankings.restaurantId, restaurants.id), inArray(rankings.userId, following)),
      )
      .leftJoin(mine, and(eq(mine.restaurantId, restaurants.id), eq(mine.userId, me.id)))
      .where(eq(listItems.listId, list.id))
      .groupBy(restaurants.id, neighborhoods.name, listItems.position)
      .orderBy(asc(listItems.position))
    return c.json({ list, items })
  })
