import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// What a restaurant profile says about where its facts came from, and Explore's occasion
// filter. Real Postgres, same local-only, tag-and-clean-up harness as followRequests.test.ts
// (see events.test.ts's header for why it is gated this way).

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
  const [{ db, schema }, { restaurantRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./restaurants'),
  ])
  return { db, schema, restaurantRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('restaurant facts and the occasion filter (local DB)', () => {
  if (!deps) return
  const { db, schema, restaurantRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const person = (label: string): Me => ({
    id: `${tag}-${label}`,
    name: `Person ${label}`,
    email: `${tag}-${label}@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  const ana = person('ana')
  const bo = person('bo')

  const get = async <T>(who: Me, path: string) => {
    const res = await new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', who)
        c.set('session', null)
        await next()
      })
      .route('/restaurants', restaurantRoutes)
      .request(path)
    return { status: res.status, json: (await res.json().catch(() => null)) as T }
  }

  let neighborhoodId = ''
  const ids: Record<'catalog' | 'seed' | 'member' | 'plain', string> = {
    catalog: '',
    seed: '',
    member: '',
    plain: '',
  }

  // The accented, space-bearing value is the point: it reaches Postgres as a bound array
  // element, and the stored vocabulary is Spanish.
  const terraza = `${tag} Al aire libre`
  const romantica = `${tag} Cena romántica`

  beforeAll(async () => {
    await db
      .insert(schema.user)
      .values([ana, bo].map((p) => ({ id: p.id, name: p.name, email: p.email, handle: p.id })))
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n?.id ?? ''

    // A fresh sourceRefreshedAt keeps GET /:id from starting a background Google refresh.
    const fresh = new Date()
    const base = { neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true }
    const rows = await db
      .insert(schema.restaurants)
      .values([
        {
          ...base,
          name: `${tag} catalog`,
          source: 'catalog',
          googlePlaceId: `${tag}-g1`,
          sourceRefreshedAt: fresh,
        },
        {
          ...base,
          name: `${tag} seed`,
          source: 'seed',
          googlePlaceId: `${tag}-g2`,
          sourceRefreshedAt: fresh,
        },
        {
          ...base,
          name: `${tag} member`,
          source: 'member',
          googlePlaceId: `${tag}-g3`,
          sourceRefreshedAt: fresh,
        },
        { ...base, name: `${tag} plain`, source: 'seed' },
      ])
      .returning({ id: schema.restaurants.id, name: schema.restaurants.name })
    for (const r of rows) {
      const key = r.name.slice(tag.length + 1) as keyof typeof ids
      ids[key] = r.id
    }

    // catalog: two rankings, one carrying the terraza tag; seed: only a different tag;
    // member: a ranking with no tags at all; plain: unranked.
    await db.insert(schema.rankings).values([
      { userId: ana.id, restaurantId: ids.catalog, position: 1, score: 90, tags: [terraza, 'x'] },
      { userId: bo.id, restaurantId: ids.catalog, position: 1, score: 80, tags: [romantica] },
      { userId: ana.id, restaurantId: ids.seed, position: 2, score: 70, tags: [romantica] },
      { userId: bo.id, restaurantId: ids.member, position: 2, score: 60 },
    ])
  })

  afterAll(async () => {
    await db.delete(schema.user).where(inArray(schema.user.id, [ana.id, bo.id]))
    const restaurantIds = Object.values(ids).filter(Boolean)
    if (restaurantIds.length > 0) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
  })

  describe('GET /restaurants/:id — "Powered by Google"', () => {
    type Profile = { restaurant: Record<string, unknown> & { google: boolean } }

    test('is on for any place carrying a Google id, whichever way it entered Mesa', async () => {
      for (const key of ['catalog', 'seed', 'member'] as const) {
        const res = await get<Profile>(ana, `/restaurants/${ids[key]}`)
        expect(res.status).toBe(200)
        expect(res.json.restaurant.google).toBe(true)
      }
    })

    test('is off for a place with no Google id', async () => {
      const res = await get<Profile>(ana, `/restaurants/${ids.plain}`)
      expect(res.json.restaurant.google).toBe(false)
    })

    test("never hands the client Google's id, the source, or the refresh clock", async () => {
      const { restaurant } = (await get<Profile>(ana, `/restaurants/${ids.catalog}`)).json
      for (const internal of ['googlePlaceId', 'source', 'sourceRefreshedAt', 'neighborhoodId']) {
        expect(restaurant).not.toHaveProperty(internal)
      }
    })
  })

  describe('GET /restaurants?occasion=', () => {
    type Explore = { restaurants: { id: string }[] }
    const occasion = async (value: string) =>
      (
        await get<Explore>(ana, `/restaurants?occasion=${encodeURIComponent(value)}`)
      ).json.restaurants
        .map((r) => r.id)
        .sort()

    test('returns the places where at least one ranking carries the tag', async () => {
      expect(await occasion(terraza)).toEqual([ids.catalog])
    })

    test('matches a tag with accents and spaces exactly as stored', async () => {
      expect(await occasion(romantica)).toEqual([ids.catalog, ids.seed].sort())
    })

    test('does not match a substring, a different case, or a tag nobody used', async () => {
      expect(await occasion(`${tag} Al aire`)).toEqual([])
      expect(await occasion(terraza.toLowerCase())).toEqual([])
      expect(await occasion(`${tag} nunca`)).toEqual([])
    })

    test('a place whose rankings carry no tags never matches', async () => {
      expect(await occasion(romantica)).not.toContain(ids.member)
    })

    test('several occasions match a place carrying ANY of them', async () => {
      const both = (
        await get<Explore>(
          ana,
          `/restaurants?occasion=${encodeURIComponent(terraza)}&occasion=${encodeURIComponent(`${tag} nunca`)}`,
        )
      ).json.restaurants
        .map((r) => r.id)
        .sort()
      expect(both).toEqual([ids.catalog])
      const union = (
        await get<Explore>(
          ana,
          `/restaurants?occasion=${encodeURIComponent(terraza)}&occasion=${encodeURIComponent(romantica)}`,
        )
      ).json.restaurants
        .map((r) => r.id)
        .sort()
      expect(union).toEqual([ids.catalog, ids.seed].sort())
    })

    test('a repeated or blank value changes nothing', async () => {
      const once = await occasion(romantica)
      const twice = (
        await get<Explore>(
          ana,
          `/restaurants?occasion=${encodeURIComponent(romantica)}&occasion=${encodeURIComponent(romantica)}&occasion=`,
        )
      ).json.restaurants
        .map((r) => r.id)
        .sort()
      expect(twice).toEqual(once)
    })
  })

  describe('GET /restaurants?highlight=', () => {
    type Explore = { restaurants: { id: string }[] }
    const ids_ = async (query: string) =>
      (await get<Explore>(ana, `/restaurants?${query}`)).json.restaurants.map((r) => r.id).sort()
    const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`

    test('is the same filter as occasion, on its own param', async () => {
      expect(await ids_(q('highlight', terraza))).toEqual([ids.catalog])
      expect(await ids_(q('highlight', romantica))).toEqual([ids.catalog, ids.seed].sort())
    })

    test('with both set, a place needs a ranking for each', async () => {
      expect(await ids_(`${q('occasion', romantica)}&${q('highlight', terraza)}`)).toEqual([
        ids.catalog,
      ])
      expect(await ids_(`${q('occasion', terraza)}&${q('highlight', `${tag} nunca`)}`)).toEqual([])
    })

    test('several sectors or cuisines widen the match; a set facet still narrows it', async () => {
      // Every tagged place sits in this test's own sector; adding a second sector keeps them all.
      const inSector = await ids_(`${q('occasion', romantica)}&${q('neighborhood', tag)}`)
      expect(inSector).toEqual([ids.catalog, ids.seed].sort())
      expect(
        await ids_(
          `${q('occasion', romantica)}&${q('neighborhood', tag)}&${q('neighborhood', `${tag}-otro`)}`,
        ),
      ).toEqual(inSector)
      // A sector none of them is in, on its own, finds none of them.
      expect(await ids_(`${q('occasion', romantica)}&${q('neighborhood', `${tag}-otro`)}`)).toEqual(
        [],
      )
    })
  })
})
