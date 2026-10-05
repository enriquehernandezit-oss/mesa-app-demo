import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import { sdMonthStart } from '../lib/sdTime'

// The API half of F4: an event carries its venue's neighbourhood where the app reads it, the
// leaderboard's month is the calendar month in Santo Domingo, and a banned member's rankings do not
// count towards a place's friend average. Real Postgres, local only (see routes/social.test.ts).

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
  const [{ db, schema }, { eventsRoutes }, { leaderboardRoutes }, { restaurantRoutes }] =
    await Promise.all([
      import('@mesa/db'),
      import('./events'),
      import('./leaderboard'),
      import('./restaurants'),
    ])
  return { db, schema, eventsRoutes, leaderboardRoutes, restaurantRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('app-facing API fixes (local DB)', () => {
  if (!deps) return
  const { db, schema, eventsRoutes, leaderboardRoutes, restaurantRoutes } = deps
  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const id = (label: string) => `${tag}-${label}`
  const me: Me = {
    id: id('me'),
    name: 'Fixes me',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/events', eventsRoutes)
    .route('/leaderboard', leaderboardRoutes)
    .route('/restaurants', restaurantRoutes)

  let neighborhoodId = ''
  const restaurantIds: string[] = []
  let eventId = ''

  beforeAll(async () => {
    await db.insert(schema.user).values(
      ['me', 'monthly', 'banned'].map((label) => ({
        id: id(label),
        name: `Fixes ${label}`,
        email: `${tag}-${label}@example.test`,
        handle: id(label),
        bannedAt: label === 'banned' ? new Date() : null,
      })),
    )
    await db.insert(schema.follows).values({ followerId: id('me'), followingId: id('banned') })
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: `${tag} Hood`, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n!.id
    const rows = await db
      .insert(schema.restaurants)
      .values(
        [0, 1, 2].map((i) => ({
          name: `${tag}-spot-${i}`,
          neighborhoodId,
          lat: 18.47,
          lng: -69.93,
          isDemo: true,
        })),
      )
      .returning({ id: schema.restaurants.id })
    restaurantIds.push(...rows.map((r) => r.id))
    const [ev] = await db
      .insert(schema.events)
      .values({
        slug: `${tag}-ev`,
        title: 'Hood event',
        restaurantId: restaurantIds[0]!,
        startsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: schema.events.id })
    eventId = ev!.id

    // monthly: two rankings this month, one the month before.
    const lastMonth = new Date(sdMonthStart().getTime() - 5 * 86_400_000)
    await db.insert(schema.rankings).values([
      { userId: id('monthly'), restaurantId: restaurantIds[0]!, position: 1, score: 90 },
      { userId: id('monthly'), restaurantId: restaurantIds[1]!, position: 2, score: 80 },
      {
        userId: id('monthly'),
        restaurantId: restaurantIds[2]!,
        position: 3,
        score: 72,
        createdAt: lastMonth,
      },
      // the banned friend ranked spot 0
      { userId: id('banned'), restaurantId: restaurantIds[0]!, position: 1, score: 96 },
    ])
  })

  afterAll(async () => {
    await db.delete(schema.user).where(like(schema.user.id, `${tag}%`))
    await db.delete(schema.events).where(eq(schema.events.id, eventId))
    if (restaurantIds.length) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
  })

  test("an event carries its venue's neighbourhood inside `restaurant`, where the app reads it", async () => {
    const res = await app.request(`/events/${eventId}`)
    const { event } = (await res.json()) as {
      event: { neighborhood: string | null; restaurant: { neighborhood: string | null } }
    }
    expect(event.restaurant.neighborhood).toBe(`${tag} Hood`)
    expect(event.neighborhood).toBe(`${tag} Hood`) // an app that read it at the top still works
  })

  test('the leaderboard month is the calendar month: a ranking from before it does not count', async () => {
    const board = async (period: string) =>
      (
        (await (await app.request(`/leaderboard?period=${period}`)).json()) as {
          leaderboard: { id: string; count: number }[]
        }
      ).leaderboard.find((r) => r.id === id('monthly'))?.count
    expect(await board('month')).toBe(2)
    expect(await board('all')).toBe(3)
  })

  test("a banned member's ranking does not count in a place's friend average or ranker count", async () => {
    const res = await app.request(
      `/restaurants?where=none&q=${encodeURIComponent(`${tag}-spot-0`)}`,
    )
    const { restaurants } = (await res.json()) as {
      restaurants: {
        id: string
        friendCount: number
        friendAvg: number | null
        mesaCount: number
      }[]
    }
    const row = restaurants.find((r) => r.id === restaurantIds[0])
    expect(row).toBeDefined()
    expect(row?.friendCount).toBe(0) // me follows only the banned account
    expect(row?.friendAvg).toBeNull()
    expect(row?.mesaCount).toBe(1) // monthly's ranking counts; banned's does not
  })
})
