import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Dishes and their photos are public: whatever an older app sends as `visibility`, a dish is stored
// public, and anyone signed in sees it on the place's page — even when the poster's account is
// private. A place has no picture of its own (migration 0044). Real Postgres, same local-only,
// tag-and-clean-up harness as mutuals.test.ts.

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
  const [{ db, schema }, { dishesRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./dishes'),
  ])
  return { db, schema, dishesRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('dishes are public (local DB)', () => {
  if (!deps) return
  const { db, schema, dishesRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const person = (label: string): Me =>
    ({
      id: `${tag}-${label}`,
      name: `Dish ${label}`,
      email: `${tag}-${label}@example.test`,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      eulaAcceptedAt: new Date(),
    }) as Me
  const poster = person('poster')
  const stranger = person('stranger')
  const base = 'https://photos.example.test'
  const photo = `${base}/u/${poster.id}/${crypto.randomUUID()}.jpg`
  let placeId = ''
  let current: Me = poster

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', current)
      c.set('session', null)
      await next()
    })
    .route('/dishes', dishesRoutes)

  const post = (body: Record<string, unknown>) =>
    app.request('/dishes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurantId: placeId, name: 'Pasta de prueba', ...body }),
    })
  const dishRow = async () =>
    (await db.select().from(schema.dishes).where(eq(schema.dishes.userId, poster.id)))[0]
  const coverOfPlace = async () =>
    (
      await db
        .select({ c: schema.restaurants.coverImageId })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.id, placeId))
    )[0]?.c

  beforeAll(async () => {
    process.env.R2_PUBLIC_BASE_URL = base
    const [hood] = await db.select({ id: schema.neighborhoods.id }).from(schema.neighborhoods)
    if (!hood) throw new Error('no neighborhoods: seed the local database first')
    await db.insert(schema.user).values([
      {
        id: poster.id,
        name: poster.name,
        email: poster.email,
        handle: poster.id,
        eulaAcceptedAt: poster.eulaAcceptedAt,
        isPrivate: true,
      },
      { id: stranger.id, name: stranger.name, email: stranger.email, handle: stranger.id },
    ])
    const [place] = await db
      .insert(schema.restaurants)
      .values({ name: `Dish place ${tag}`, neighborhoodId: hood.id, lat: 18.47, lng: -69.93 })
      .returning({ id: schema.restaurants.id })
    placeId = place?.id ?? ''
    await db.insert(schema.rankings).values({
      userId: poster.id,
      restaurantId: placeId,
      position: 1,
      score: 8,
    })
  })

  afterAll(async () => {
    delete process.env.R2_PUBLIC_BASE_URL
    await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, [placeId]))
    await db.delete(schema.user).where(inArray(schema.user.id, [poster.id, stranger.id]))
  })

  test("a dish is stored public even when an older app asks for 'friends'", async () => {
    expect((await post({ visibility: 'friends' })).status).toBe(200)
    expect((await dishRow())?.visibility).toBe('public')
  })

  test('a photo and a sentiment re-post keep it public, and the place gets no picture', async () => {
    expect((await post({ visibility: 'friends', image: photo, grain: 'daylight' })).status).toBe(
      200,
    )
    expect((await post({ sentiment: 'loved' })).status).toBe(200)
    const row = await dishRow()
    expect(row?.visibility).toBe('public')
    expect(row?.imageId).toBe(photo)
    expect(await coverOfPlace()).toBeNull()
  })

  test("a stranger sees a private account's dish photo on the place's page and opens the dish", async () => {
    current = stranger
    const rail = await app.request(`/dishes/restaurant/${placeId}`)
    expect(rail.status).toBe(200)
    const { dishes } = (await rail.json()) as { dishes: { id: string; imageId: string }[] }
    expect(dishes.map((d) => d.imageId)).toContain(photo)

    const row = await dishRow()
    expect((await app.request(`/dishes/${row?.id}`)).status).toBe(200)
    current = poster
  })
})
