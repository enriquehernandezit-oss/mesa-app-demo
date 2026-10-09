import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// A shared list opens in the app for anyone its owner's account lets see it, read-only: the same
// link the public /p page serves. Public owner → anyone; private owner → approved followers only;
// banned owner or a block either way → not found. The owner still sees their own, and only the
// owner sees what is left to rank. Real Postgres, same local-only harness as dishVisibility.test.ts.

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
  const [{ db, schema }, { collectionsRoutes }, { dishListsRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./collections'),
    import('./dishLists'),
  ])
  return { db, schema, collectionsRoutes, dishListsRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('shared lists open for the people their owner allows (local DB)', () => {
  if (!deps) return
  const { db, schema, collectionsRoutes, dishListsRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const person = (label: string): Me =>
    ({
      id: `${tag}-${label}`,
      name: `List ${label}`,
      email: `${tag}-${label}@example.test`,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      eulaAcceptedAt: new Date(),
    }) as Me
  const owner = person('owner')
  const closed = person('closed')
  const banned = person('banned')
  const stranger = person('stranger')
  const follower = person('follower')
  const blocked = person('blocked')
  const everyone = [owner, closed, banned, stranger, follower, blocked]
  let current: Me = owner
  let placeA = ''
  let placeB = ''
  const ids = { owner: '', closed: '', banned: '', dishOwner: '', dishClosed: '' }

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', current)
      c.set('session', null)
      await next()
    })
    .route('/collections', collectionsRoutes)
    .route('/dish-lists', dishListsRoutes)
  const get = async (path: string, as: Me) => {
    current = as
    return app.request(path)
  }

  beforeAll(async () => {
    const [hood] = await db.select({ id: schema.neighborhoods.id }).from(schema.neighborhoods)
    if (!hood) throw new Error('no neighborhoods: seed the local database first')
    await db.insert(schema.user).values(
      everyone.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        handle: p.id,
        eulaAcceptedAt: p.eulaAcceptedAt,
        isPrivate: p.id === closed.id,
        bannedAt: p.id === banned.id ? new Date() : null,
      })),
    )
    const places = await db
      .insert(schema.restaurants)
      .values([
        { name: `Lists A ${tag}`, neighborhoodId: hood.id, lat: 18.47, lng: -69.93 },
        { name: `Lists B ${tag}`, neighborhoodId: hood.id, lat: 18.47, lng: -69.93 },
      ])
      .returning({ id: schema.restaurants.id })
    placeA = places[0]?.id ?? ''
    placeB = places[1]?.id ?? ''
    for (const [key, who] of [
      ['owner', owner],
      ['closed', closed],
      ['banned', banned],
    ] as const) {
      const [col] = await db
        .insert(schema.collections)
        .values({ userId: who.id, name: `Lista ${key}` })
        .returning({ id: schema.collections.id })
      ids[key] = col?.id ?? ''
      await db
        .insert(schema.collectionItems)
        .values({ collectionId: ids[key], restaurantId: placeA })
    }
    // A dish list with one ranked place and one still to rank.
    for (const [key, who] of [
      ['dishOwner', owner],
      ['dishClosed', closed],
    ] as const) {
      const [rankA, rankB] = await db
        .insert(schema.rankings)
        .values([
          { userId: who.id, restaurantId: placeA, position: 1, score: 8 },
          { userId: who.id, restaurantId: placeB, position: 2, score: 7 },
        ])
        .returning({ id: schema.rankings.id })
      const made = await db
        .insert(schema.dishes)
        .values([
          {
            userId: who.id,
            restaurantId: placeA,
            rankingId: rankA?.id ?? '',
            name: `Carbonara ${tag}`,
          },
          {
            userId: who.id,
            restaurantId: placeB,
            rankingId: rankB?.id ?? '',
            name: `Carbonara ${tag}`,
          },
        ])
        .returning({ nameKey: schema.dishes.nameKey })
      const [list] = await db
        .insert(schema.dishLists)
        .values({ userId: who.id, nameKey: made[0]?.nameKey ?? '', label: 'carbonara' })
        .returning({ id: schema.dishLists.id })
      ids[key] = list?.id ?? ''
      await db
        .insert(schema.dishListItems)
        .values({ listId: ids[key], restaurantId: placeA, position: 1 })
    }
    await db.insert(schema.follows).values({ followerId: follower.id, followingId: closed.id })
    await db.insert(schema.userBlocks).values({ blockerId: owner.id, blockedId: blocked.id })
  })

  afterAll(async () => {
    await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, [placeA, placeB]))
    await db.delete(schema.user).where(
      inArray(
        schema.user.id,
        everyone.map((p) => p.id),
      ),
    )
  })

  test('the owner opens their own list and is told so', async () => {
    const res = await get(`/collections/${ids.owner}`, owner)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { isOwner: boolean; owner: { id: string } }
    expect(body.isOwner).toBe(true)
    expect(body.owner.id).toBe(owner.id)
  })

  test("a stranger opens a public member's list, read-only, with the owner named", async () => {
    const res = await get(`/collections/${ids.owner}`, stranger)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      isOwner: boolean
      owner: { name: string }
      items: unknown[]
    }
    expect(body.isOwner).toBe(false)
    expect(body.owner.name).toBe(owner.name)
    expect(body.items).toHaveLength(1)
  })

  test("a private account's list is for its approved followers only", async () => {
    expect((await get(`/collections/${ids.closed}`, stranger)).status).toBe(404)
    expect((await get(`/collections/${ids.closed}`, follower)).status).toBe(200)
    expect((await get(`/collections/${ids.closed}`, closed)).status).toBe(200)
  })

  test('a banned owner, or a block in either direction, is not found', async () => {
    expect((await get(`/collections/${ids.banned}`, stranger)).status).toBe(404)
    expect((await get(`/collections/${ids.owner}`, blocked)).status).toBe(404)
    expect((await get(`/collections/not-an-id`, stranger)).status).toBe(404)
  })

  test('someone else can not change a list they can open', async () => {
    current = stranger
    const patch = await app.request(`/collections/${ids.owner}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'mine now' }),
    })
    expect(patch.status).toBe(404)
    expect((await app.request(`/collections/${ids.owner}`, { method: 'DELETE' })).status).toBe(404)
  })

  test('a dish list shows its ranked order to others, and what is left to rank only to its owner', async () => {
    const mine = (await (await get(`/dish-lists/${ids.dishOwner}`, owner)).json()) as {
      isOwner: boolean
      ranked: unknown[]
      unranked: unknown[]
    }
    expect(mine.isOwner).toBe(true)
    expect(mine.ranked).toHaveLength(1)
    expect(mine.unranked).toHaveLength(1)

    const theirs = (await (await get(`/dish-lists/${ids.dishOwner}`, stranger)).json()) as {
      isOwner: boolean
      ranked: unknown[]
      unranked: unknown[]
    }
    expect(theirs.isOwner).toBe(false)
    expect(theirs.ranked).toHaveLength(1)
    expect(theirs.unranked).toHaveLength(0)

    expect((await get(`/dish-lists/${ids.dishClosed}`, stranger)).status).toBe(404)
    expect((await get(`/dish-lists/${ids.dishClosed}`, follower)).status).toBe(200)
  })
})
