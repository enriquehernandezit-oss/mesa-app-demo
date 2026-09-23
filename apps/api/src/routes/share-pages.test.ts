import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AppEnv } from '../context'

// Route-level checks for the three list share pages added in M8 (curated
// list / collection / dish list) — real Postgres, same local-only,
// tag-and-clean-up harness as events.test.ts and leaderboard.test.ts; see
// events.test.ts's own header for why it's gated this way. These are HTML
// pages, not JSON, so assertions grep the returned markup rather than
// parsing a response body.

const url = process.env.DATABASE_URL ?? ''
const isLocalUrl = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)

async function localDbReachable(): Promise<boolean> {
  if (!isLocalUrl) return false
  try {
    const { pool } = await import('@mesa/db')
    await pool.query('select 1')
    return true
  } catch {
    return false
  }
}

async function loadDeps() {
  const [{ db, schema }, { sharePagesRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./share-pages'),
  ])
  return { db, schema, sharePagesRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

describe.skipIf(!deps)('share pages: curated list / collection / dish list (local DB)', () => {
  if (!deps) return
  const { db, schema, sharePagesRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const app = new Hono<AppEnv>().route('/p', sharePagesRoutes)
  const get = (path: string) => app.request(path)

  let neighborhoodId = ''
  const restaurantIds: string[] = []
  const userIds: string[] = []
  const rankingIds: string[] = []
  const dishIds: string[] = []
  let ownerId = ''
  let bannedOwnerId = ''
  let listSlug = ''
  let collectionId = ''
  let bannedOwnerCollectionId = ''
  let dishListId = ''
  let unrankedDishListId = ''

  beforeAll(async () => {
    ownerId = `${tag}-owner`
    bannedOwnerId = `${tag}-banned`
    userIds.push(ownerId, bannedOwnerId)
    await db.insert(schema.user).values([
      { id: ownerId, name: 'Share Pages Owner', email: `${tag}-owner@example.test`, handle: tag },
      {
        id: bannedOwnerId,
        name: 'Banned Owner',
        email: `${tag}-banned@example.test`,
        handle: `${tag}-banned`,
        bannedAt: new Date(),
      },
    ])

    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    if (!n) throw new Error('fixture neighborhood insert failed')
    neighborhoodId = n.id

    const restaurants = await db
      .insert(schema.restaurants)
      .values(
        Array.from({ length: 3 }, (_, i) => ({
          name: `${tag}-r${i}`,
          neighborhoodId,
          lat: 18.47,
          lng: -69.93,
          isDemo: true,
        })),
      )
      .returning({ id: schema.restaurants.id })
    restaurantIds.push(...restaurants.map((r) => r.id))
    // Named to match the fixture's own restaurant names (r0/r1/r2 = "${tag}-r0"
    // etc.) — not 1-indexed — so an assertion reading "${tag}-r1" and a fixture
    // row referencing r1 are visibly the same restaurant, nothing to re-derive.
    const [r0, r1, r2] = restaurantIds

    // Curated list: two items, editorial (authorKind: 'creator').
    listSlug = tag
    const [list] = await db
      .insert(schema.lists)
      .values({
        slug: listSlug,
        title: 'Curated Test List',
        subtitle: 'A hand-picked subtitle',
        authorKind: 'creator',
        authorHandle: `${tag}-curator`,
      })
      .returning({ id: schema.lists.id })
    if (!list) throw new Error('fixture list insert failed')
    await db.insert(schema.listItems).values([
      { listId: list.id, restaurantId: r0 as string, position: 1 },
      { listId: list.id, restaurantId: r1 as string, position: 2 },
    ])

    // A ranking + two dishes off it (a ranking can own up to 3) — one
    // public, one 'friends' (the default) — to prove the collection page
    // excludes the private one.
    const [ranking] = await db
      .insert(schema.rankings)
      .values({ userId: ownerId, restaurantId: r0 as string, position: 1, score: 90 })
      .returning({ id: schema.rankings.id })
    if (!ranking) throw new Error('fixture ranking insert failed')
    rankingIds.push(ranking.id)
    const dishRows = await db
      .insert(schema.dishes)
      .values([
        {
          userId: ownerId,
          rankingId: ranking.id,
          restaurantId: r0 as string,
          name: 'Public Dish',
          visibility: 'public',
        },
        {
          userId: ownerId,
          rankingId: ranking.id,
          restaurantId: r0 as string,
          name: 'Friends Only Dish',
          // visibility defaults to 'friends' — the case a public page must
          // never name.
        },
      ])
      .returning({ id: schema.dishes.id })
    dishIds.push(...dishRows.map((d) => d.id))
    const [publicDish, friendsDish] = dishRows

    const [collection] = await db
      .insert(schema.collections)
      .values({ userId: ownerId, name: 'Test Collection' })
      .returning({ id: schema.collections.id })
    if (!collection) throw new Error('fixture collection insert failed')
    collectionId = collection.id
    await db.insert(schema.collectionItems).values([
      { collectionId: collection.id, restaurantId: r2 as string },
      { collectionId: collection.id, dishId: publicDish?.id as string },
      { collectionId: collection.id, dishId: friendsDish?.id as string },
    ])

    const [bannedCollection] = await db
      .insert(schema.collections)
      .values({ userId: bannedOwnerId, name: 'Banned Owner Collection' })
      .returning({ id: schema.collections.id })
    if (!bannedCollection) throw new Error('fixture banned-owner collection insert failed')
    bannedOwnerCollectionId = bannedCollection.id

    // Dish list: ranked (has an order) and a second, unranked one (rankedAt
    // null) that must 404 — nothing to show a stranger mid-flow.
    const [dishList] = await db
      .insert(schema.dishLists)
      .values({ userId: ownerId, nameKey: tag, label: 'Test Dish', rankedAt: new Date() })
      .returning({ id: schema.dishLists.id })
    if (!dishList) throw new Error('fixture dish list insert failed')
    dishListId = dishList.id
    await db.insert(schema.dishListItems).values([
      { listId: dishList.id, restaurantId: r2 as string, position: 1 },
      { listId: dishList.id, restaurantId: r1 as string, position: 2 },
    ])

    const [unrankedList] = await db
      .insert(schema.dishLists)
      .values({ userId: ownerId, nameKey: `${tag}-unranked`, label: 'Unranked Dish' })
      .returning({ id: schema.dishLists.id })
    if (!unrankedList) throw new Error('fixture unranked dish list insert failed')
    unrankedDishListId = unrankedList.id
  })

  afterAll(async () => {
    if (dishListId) await db.delete(schema.dishLists).where(eq(schema.dishLists.id, dishListId))
    if (unrankedDishListId) {
      await db.delete(schema.dishLists).where(eq(schema.dishLists.id, unrankedDishListId))
    }
    if (collectionId)
      await db.delete(schema.collections).where(eq(schema.collections.id, collectionId))
    if (bannedOwnerCollectionId) {
      await db.delete(schema.collections).where(eq(schema.collections.id, bannedOwnerCollectionId))
    }
    if (dishIds.length) await db.delete(schema.dishes).where(inArray(schema.dishes.id, dishIds))
    if (rankingIds.length) {
      await db.delete(schema.rankings).where(inArray(schema.rankings.id, rankingIds))
    }
    if (listSlug) await db.delete(schema.lists).where(eq(schema.lists.slug, listSlug))
    if (restaurantIds.length) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
    await db.delete(schema.user).where(inArray(schema.user.id, userIds))
  })

  describe('GET /p/list/:slug', () => {
    test('renders the title and both items in position order', async () => {
      const res = await get(`/p/list/${listSlug}`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Curated Test List')
      expect(html).toContain(`${tag}-r0`)
      expect(html).toContain(`${tag}-r1`)
      expect(html.indexOf(`${tag}-r0`)).toBeLessThan(html.indexOf(`${tag}-r1`))
      expect(html).toContain('list--noscore')
    })

    test('an unknown slug 404s', async () => {
      const res = await get('/p/list/does-not-exist')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /p/collection/:id', () => {
    test("names the restaurant and the public dish, never the 'friends' one", async () => {
      const res = await get(`/p/collection/${collectionId}`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Test Collection')
      expect(html).toContain(`${tag}-r2`) // the plain restaurant item
      expect(html).toContain('Public Dish')
      expect(html).not.toContain('Friends Only Dish')
    })

    test('an unknown id 404s', async () => {
      const res = await get(`/p/collection/${crypto.randomUUID()}`)
      expect(res.status).toBe(404)
    })

    test("a banned owner's collection 404s, not just render as if orphaned", async () => {
      const res = await get(`/p/collection/${bannedOwnerCollectionId}`)
      expect(res.status).toBe(404)
    })
  })

  describe('GET /p/dish-list/:id', () => {
    test('renders both ranked items in position order', async () => {
      const res = await get(`/p/dish-list/${dishListId}`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Test Dish')
      expect(html).toContain(`${tag}-r2`)
      expect(html).toContain(`${tag}-r1`)
      // position 1 is r2, position 2 is r1 — the fixture deliberately
      // inserts them out of restaurant-array order to prove this isn't
      // just insertion order.
      expect(html.indexOf(`${tag}-r2`)).toBeLessThan(html.indexOf(`${tag}-r1`))
    })

    test('an unranked list 404s — nothing to show mid-flow', async () => {
      const res = await get(`/p/dish-list/${unrankedDishListId}`)
      expect(res.status).toBe(404)
    })

    test('an unknown id 404s', async () => {
      const res = await get(`/p/dish-list/${crypto.randomUUID()}`)
      expect(res.status).toBe(404)
    })
  })
})
