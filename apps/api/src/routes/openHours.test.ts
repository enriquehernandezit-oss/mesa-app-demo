import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import { hoursColumns, sdMinuteOfWeek } from '../lib/openingHours'

// H1: "Abierto ahora" means open at this minute, from Google's weekly hours — in Explore, in the
// rank flow's candidates, and as the place page's open status. Real Postgres, same local-only,
// tag-and-clean-up harness as restaurantFacts.test.ts.

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
  const [{ db, schema }, { restaurantRoutes }, { rankingsRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./restaurants'),
    import('./rankings'),
  ])
  return { db, schema, restaurantRoutes, rankingsRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

// A period `fromNow` minutes ahead lasting `length` minutes, in Google's shape.
function periodFromNow(fromNow: number, length: number) {
  const at = (m: number) => {
    const w = ((m % 10080) + 10080) % 10080
    return { day: Math.floor(w / 1440), hour: Math.floor((w % 1440) / 60), minute: w % 60 }
  }
  const start = sdMinuteOfWeek() + fromNow
  return { open: at(start), close: at(start + length) }
}

describe.skipIf(!deps)('opening hours and "open now" (local DB)', () => {
  if (!deps) return
  const { db, schema, restaurantRoutes, rankingsRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const me: Me = {
    id: `${tag}-me`,
    name: 'Hours Tester',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    eulaAcceptedAt: new Date(),
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
    .route('/restaurants', restaurantRoutes)
    .route('/rankings', rankingsRoutes)
  const get = async <T>(path: string) => (await (await app.request(path)).json()) as T

  let neighborhoodId = ''
  const ids: Record<'open' | 'closed' | 'nohours' | 'allday', string> = {
    open: '',
    closed: '',
    nohours: '',
    allday: '',
  }

  beforeAll(async () => {
    await db.insert(schema.user).values({ id: me.id, name: me.name, email: me.email })
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n?.id ?? ''
    const base = { neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true }
    const rows = await db
      .insert(schema.restaurants)
      .values([
        // open now, closing in an hour
        { ...base, name: `${tag} open`, ...hoursColumns([periodFromNow(-60, 120)]) },
        // opens in three hours
        { ...base, name: `${tag} closed`, ...hoursColumns([periodFromNow(180, 60)]) },
        { ...base, name: `${tag} nohours`, closesAt: '1a' },
        {
          ...base,
          name: `${tag} allday`,
          ...hoursColumns([{ open: { day: 0, hour: 0, minute: 0 } }]),
        },
      ])
      .returning({ id: schema.restaurants.id, name: schema.restaurants.name })
    for (const r of rows) ids[r.name.slice(tag.length + 1) as keyof typeof ids] = r.id
  })

  afterAll(async () => {
    await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, Object.values(ids)))
    await db.delete(schema.neighborhoods).where(inArray(schema.neighborhoods.id, [neighborhoodId]))
    await db.delete(schema.user).where(inArray(schema.user.id, [me.id]))
  })

  type Hit = { id: string; openNow: boolean | null }

  test('Explore: "open now" keeps only places open this minute, not ones that merely list a closing time', async () => {
    const all = await get<{ restaurants: Hit[] }>(`/restaurants?q=${encodeURIComponent(tag)}`)
    const byId = new Map(all.restaurants.map((r) => [r.id, r.openNow]))
    expect(byId.get(ids.open)).toBe(true)
    expect(byId.get(ids.closed)).toBe(false)
    expect(byId.get(ids.nohours)).toBeNull()
    expect(byId.get(ids.allday)).toBe(true)

    const open = await get<{ restaurants: Hit[] }>(
      `/restaurants?q=${encodeURIComponent(tag)}&open=1`,
    )
    expect(open.restaurants.map((r) => r.id).sort()).toEqual([ids.open, ids.allday].sort())
  })

  test('rank flow candidates use the same rule', async () => {
    const open = await get<{ restaurants: { id: string }[] }>(
      `/rankings/candidates?q=${encodeURIComponent(tag)}&open=1`,
    )
    const got = open.restaurants.map((r) => r.id)
    expect(got).toContain(ids.open)
    expect(got).not.toContain(ids.closed)
    expect(got).not.toContain(ids.nohours)
  })

  test('the place page says open and until when, or closed and when it opens', async () => {
    type Place = { restaurant: { openStatus: unknown } }
    const open = await get<Place>(`/restaurants/${ids.open}`)
    expect(open.restaurant.openStatus).toMatchObject({ open: true })
    const closed = await get<Place>(`/restaurants/${ids.closed}`)
    expect(closed.restaurant.openStatus).toMatchObject({ open: false })
    expect((closed.restaurant.openStatus as { opensAt: unknown }).opensAt).not.toBeNull()
    const none = await get<Place>(`/restaurants/${ids.nohours}`)
    expect(none.restaurant.openStatus).toBeNull()
    const allday = await get<Place>(`/restaurants/${ids.allday}`)
    expect(allday.restaurant.openStatus).toEqual({ open: true, closesAt: null })
  })
})
