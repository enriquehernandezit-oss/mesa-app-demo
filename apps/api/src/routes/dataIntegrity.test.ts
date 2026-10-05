import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { and, eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AppEnv, AuthedEnv } from '../context'
import { requestBodyLimit } from '../lib/bodyLimit'

// F3, the data-integrity fixes from the October audit: the feed pages through rows that share a
// timestamp, event reminders move on past people already reminded, two quick posts of one dish make
// one dish, malformed ids are a 404, a "%" in a search is not a wildcard, counts skip banned accounts,
// and a request body has a size limit. Real Postgres, local only (see routes/social.test.ts).

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
  const [
    { db, schema },
    { feedRoutes },
    { dishesRoutes },
    { restaurantRoutes },
    { savedRoutes },
    { moderationRoutes },
    { sharePagesRoutes },
    { legalPagesRoutes },
    { rankingsRoutes },
    { dueReminders },
  ] = await Promise.all([
    import('@mesa/db'),
    import('./feed'),
    import('./dishes'),
    import('./restaurants'),
    import('./saved'),
    import('./moderation'),
    import('./share-pages'),
    import('./legal-pages'),
    import('./rankings'),
    import('../lib/pushSweep'),
  ])
  return {
    db,
    schema,
    feedRoutes,
    dishesRoutes,
    restaurantRoutes,
    savedRoutes,
    moderationRoutes,
    sharePagesRoutes,
    legalPagesRoutes,
    rankingsRoutes,
    dueReminders,
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe('request body limit', () => {
  test('a body over 1 MB is refused with 413; a normal one passes', async () => {
    const app = new Hono<AppEnv>().use('*', requestBodyLimit).post('/echo', async (c) => {
      const body = await c.req.text()
      return c.json({ n: body.length })
    })
    const post = (body: string) => app.request('/echo', { method: 'POST', body })
    expect((await post('x'.repeat(1000))).status).toBe(200)
    const big = await post('x'.repeat(1024 * 1024 + 10))
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'payload_too_large' })
  })
})

describe.skipIf(!deps)('data integrity (local DB)', () => {
  if (!deps) return
  const {
    db,
    schema,
    feedRoutes,
    dishesRoutes,
    restaurantRoutes,
    savedRoutes,
    moderationRoutes,
    sharePagesRoutes,
    legalPagesRoutes,
    rankingsRoutes,
    dueReminders,
  } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const id = (label: string) => `${tag}-${label}`
  const person = (label: string): Me => ({
    id: id(label),
    name: `Integrity ${label}`,
    email: `${tag}-${label}@example.test`,
    emailVerified: false,
    eulaAcceptedAt: new Date(),
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  const me = person('me')
  const labels = ['me', 'author', 'bannedfriend'] as const

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/feed', feedRoutes)
    .route('/dishes', dishesRoutes)
    .route('/restaurants', restaurantRoutes)
    .route('/saved', savedRoutes)
    .route('/moderation', moderationRoutes)
    .route('/rankings', rankingsRoutes)
  const pub = new Hono().route('/p', sharePagesRoutes).route('/legal', legalPagesRoutes)

  let neighborhoodId = ''
  const restaurantIds: string[] = []
  const PLACES = 45

  beforeAll(async () => {
    await db.insert(schema.user).values(
      labels.map((label) => ({
        id: id(label),
        name: `Integrity ${label}`,
        email: `${tag}-${label}@example.test`,
        handle: id(label),
        eulaAcceptedAt: new Date(),
        bannedAt: label === 'bannedfriend' ? new Date() : null,
      })),
    )
    await db.insert(schema.follows).values([
      { followerId: id('me'), followingId: id('author') },
      { followerId: id('me'), followingId: id('bannedfriend') },
      { followerId: id('bannedfriend'), followingId: id('me') },
    ])
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n!.id
    const rows = await db
      .insert(schema.restaurants)
      .values(
        Array.from({ length: PLACES }, (_, i) => ({
          name: `${tag}-place-${i}`,
          neighborhoodId,
          lat: 18.47,
          lng: -69.93,
          isDemo: true,
        })),
      )
      .returning({ id: schema.restaurants.id })
    restaurantIds.push(...rows.map((r) => r.id))
    // ONE statement: every ranking gets the identical microsecond created_at — the case that lost
    // rows at a page boundary.
    await db.insert(schema.rankings).values(
      restaurantIds.map((rid, i) => ({
        userId: id('author'),
        restaurantId: rid,
        position: i + 1,
        score: 90,
      })),
    )
  })

  afterAll(async () => {
    await db.delete(schema.user).where(like(schema.user.id, `${tag}%`))
    await db.delete(schema.events).where(like(schema.events.slug, `${tag}%`))
    if (restaurantIds.length) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
  })

  test('the feed pages through rankings that share one timestamp without skipping or repeating', async () => {
    const seen: string[] = []
    let cursor = ''
    for (let page = 0; page < 6; page++) {
      const res = await app.request(`/feed${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        feed: { rankingId: string; user: { id: string } }[]
        nextCursor: string | null
      }
      seen.push(...body.feed.filter((r) => r.user.id === id('author')).map((r) => r.rankingId))
      if (!body.nextCursor) break
      cursor = body.nextCursor
    }
    expect(seen).toHaveLength(PLACES)
    expect(new Set(seen).size).toBe(PLACES)
  })

  test('event reminders skip people already reminded, so the next batch is reached', async () => {
    const [ev] = await db
      .insert(schema.events)
      .values({
        slug: `${tag}-ev`,
        title: 'Reminder test',
        restaurantId: restaurantIds[0]!,
        startsAt: new Date(Date.now() + 2 * 3600_000 - 60_000), // inside the 2h window
      })
      .returning({ id: schema.events.id })
    await db.insert(schema.eventRsvps).values([
      { eventId: ev!.id, userId: id('me'), status: 'going' },
      { eventId: ev!.id, userId: id('author'), status: 'going' },
    ])
    const offset = 2 * 3600_000
    const due = async () =>
      (await dueReminders(offset, new Date()))
        .filter((d) => d.eventId === ev!.id)
        .map((d) => d.userId)
        .sort()
    expect(await due()).toEqual([id('author'), id('me')])
    // me is reminded (push_log claims the key); only author is still due.
    await db
      .insert(schema.pushLog)
      .values({ userId: id('me'), key: `event-reminder:${ev!.id}:${offset}` })
    expect(await due()).toEqual([id('author')])
    // A reminder sent at a different offset (3h) does not count as this one (2h).
    await db
      .insert(schema.pushLog)
      .values({ userId: id('author'), key: `event-reminder:${ev!.id}:${3 * 3600_000}` })
    expect(await due()).toEqual([id('author')])
  })

  test('two simultaneous posts of the same dish make one dish', async () => {
    await db
      .insert(schema.rankings)
      .values({ userId: id('me'), restaurantId: restaurantIds[1]!, position: 1, score: 90 })
    const post = () =>
      app.request('/dishes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurantIds[1], name: `${tag} croquetas` }),
      })
    const results = await Promise.all([post(), post(), post(), post()])
    expect(results.every((r) => r.status < 300)).toBe(true)
    const live = await db.query.dishes.findMany({
      where: and(eq(schema.dishes.userId, id('me')), like(schema.dishes.name, `${tag}%`)),
    })
    expect(live.filter((d) => d.removedAt === null)).toHaveLength(1)
  })

  test('a malformed id is a plain 404 everywhere it used to be a 500', async () => {
    for (const [method, path] of [
      ['GET', '/restaurants/not-a-uuid'],
      ['GET', '/restaurants/not-a-uuid/menu'],
      ['DELETE', '/saved/not-a-uuid'],
      ['DELETE', '/saved/dishes/not-a-uuid'],
      ['DELETE', '/dishes/not-a-uuid'],
      ['PATCH', '/rankings/not-a-uuid/note'],
      ['DELETE', '/rankings/not-a-uuid'],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'PATCH' ? { body: JSON.stringify({ body: 'x' }) } : {}),
      })
      expect([path, res.status]).toEqual([path, 404])
    }
    for (const path of [
      '/p/spot/x)',
      '/p/plan/not-a-uuid',
      '/p/collection/not-a-uuid',
      '/p/dish-list/not-a-uuid',
      '/legal/constructor',
      '/legal/toString',
    ]) {
      const res = await pub.request(path)
      expect([path, res.status]).toEqual([path, 404])
    }
  })

  test('an unknown place or member is a 404, not a database error', async () => {
    const save = await app.request('/saved', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurantId: crypto.randomUUID() }),
    })
    expect(save.status).toBe(404)
    const block = await app.request('/moderation/blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `${tag}-nobody` }),
    })
    expect(block.status).toBe(404)
  })

  test('a % or _ in a search is a character, not a wildcard', async () => {
    const find = async (q: string) =>
      (
        (await (
          await app.request(`/restaurants?where=none&q=${encodeURIComponent(q)}`)
        ).json()) as {
          restaurants: { id: string }[]
        }
      ).restaurants.map((r) => r.id)
    // sanity: a real fragment finds the fixture places
    expect((await find(`${tag}-place-1`)).length).toBeGreaterThan(0)
    // "%%" and "__" matched every place before; no place name contains either
    expect(await find('%%')).toEqual([])
    expect(await find('__')).toEqual([])
  })

  test("a profile's follower counts leave out banned accounts, matching the list", async () => {
    const res = await app.request(`/rankings/user/${id('me')}`)
    const body = (await res.json()) as { followerCount: number; followingCount: number }
    // me follows author and bannedfriend; bannedfriend follows me.
    expect(body.followingCount).toBe(1)
    expect(body.followerCount).toBe(0)
  })
})
