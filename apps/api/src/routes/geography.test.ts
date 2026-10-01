import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Places outside Santo Domingo: the area made for their city, and where that area does and does not
// show. Real Postgres, same local-only, tag-and-clean-up harness as restaurantFacts.test.ts (see
// events.test.ts's header for why it is gated this way).

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
  const [{ db, schema }, { restaurantRoutes }, { onboardingRoutes }, geo] = await Promise.all([
    import('@mesa/db'),
    import('./restaurants'),
    import('./onboarding'),
    import('../lib/geo'),
  ])
  return { db, schema, restaurantRoutes, onboardingRoutes, geo }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('places outside Santo Domingo (local DB)', () => {
  if (!deps) return
  const { db, schema, restaurantRoutes, onboardingRoutes, geo } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const ana: Me = {
    id: `${tag}-ana`,
    name: 'Person ana',
    email: `${tag}-ana@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const request = async <T>(mount: string, router: Hono<AuthedEnv>, path: string) => {
    const res = await new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', ana)
        c.set('session', null)
        await next()
      })
      .route(mount, router)
      .request(`${mount}${path}`)
    return { status: res.status, json: (await res.json().catch(() => null)) as T }
  }

  const draft = {
    slug: `${tag}-do-punta-cana`,
    name: 'Punta Cana',
    city: 'Punta Cana',
    countryCode: 'do',
    lat: 18.5584,
    lng: -68.3827,
  }
  let sectorId = ''
  let areaId = ''
  const placeIds: Record<'inSector' | 'inArea', string> = { inSector: '', inArea: '' }

  beforeAll(async () => {
    await db
      .insert(schema.user)
      .values({ id: ana.id, name: ana.name, email: ana.email, handle: ana.id })
    const [sector] = await db
      .insert(schema.neighborhoods)
      .values({
        slug: `${tag}-sector`,
        name: `${tag} sector`,
        lat: 18.47,
        lng: -69.93,
        radiusM: 500,
      })
      .returning({ id: schema.neighborhoods.id })
    sectorId = sector?.id ?? ''
    areaId = (await geo.ensureArea(draft)).id

    const fresh = new Date() // keeps GET /:id from starting a background Google refresh
    const base = { isDemo: true, source: 'seed' as const, sourceRefreshedAt: fresh }
    const rows = await db
      .insert(schema.restaurants)
      .values([
        { ...base, name: `${tag} in sector`, neighborhoodId: sectorId, lat: 18.47, lng: -69.93 },
        { ...base, name: `${tag} in area`, neighborhoodId: areaId, lat: 18.5584, lng: -68.3827 },
      ])
      .returning({ id: schema.restaurants.id, name: schema.restaurants.name })
    for (const r of rows) {
      placeIds[r.name.endsWith('in sector') ? 'inSector' : 'inArea'] = r.id
    }
    // Both ranked, so the Map's "worth plotting" pool holds both and only the area can exclude one.
    await db.insert(schema.rankings).values([
      { userId: ana.id, restaurantId: placeIds.inSector, position: 1, score: 90 },
      { userId: ana.id, restaurantId: placeIds.inArea, position: 2, score: 80 },
    ])
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, ana.id))
    const ids = Object.values(placeIds).filter(Boolean)
    if (ids.length > 0)
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, ids))
    await db.delete(schema.neighborhoods).where(like(schema.neighborhoods.slug, `${tag}%`))
  })

  describe('ensureArea', () => {
    test('makes an unlisted area for the city, in its country', async () => {
      const row = await db.query.neighborhoods.findFirst({
        where: eq(schema.neighborhoods.id, areaId),
      })
      expect(row).toMatchObject({
        slug: draft.slug,
        name: 'Punta Cana',
        city: 'Punta Cana',
        countryCode: 'do',
        listed: false,
      })
    })

    test('asking again returns the same area and makes no second one', async () => {
      expect((await geo.ensureArea(draft)).id).toBe(areaId)
      const rows = await db
        .select({ id: schema.neighborhoods.id })
        .from(schema.neighborhoods)
        .where(eq(schema.neighborhoods.slug, draft.slug))
      expect(rows).toHaveLength(1)
    })

    test('two members adding the same new city at once still make exactly one area', async () => {
      const racing = { ...draft, slug: `${tag}-us-miami`, name: 'Miami', city: 'Miami' }
      const ids = await Promise.all([1, 2, 3, 4].map(() => geo.ensureArea(racing)))
      expect(new Set(ids.map((r) => r.id)).size).toBe(1)
    })
  })

  describe('the Santo Domingo sectors stay the only choices', () => {
    test('GET /onboarding/neighborhoods offers the sector, not the area', async () => {
      const { json } = await request<{ neighborhoods: { slug: string }[] }>(
        '/onboarding',
        onboardingRoutes,
        '/neighborhoods',
      )
      const slugs = json.neighborhoods.map((n) => n.slug)
      expect(slugs).toContain(`${tag}-sector`)
      expect(slugs).not.toContain(draft.slug)
    })

    test('GET /restaurants/map plots the place in the sector, not the one in the area', async () => {
      const { json } = await request<{ spots: { id: string }[] }>(
        '/restaurants',
        restaurantRoutes,
        '/map',
      )
      const plotted = json.spots.map((s) => s.id)
      expect(plotted).toContain(placeIds.inSector)
      expect(plotted).not.toContain(placeIds.inArea)
    })
  })

  describe('GET /restaurants/:id', () => {
    type Profile = { restaurant: { neighborhood: { name: string; city: string } | null } }

    test('says which city a place is in, so the page never claims Santo Domingo for Punta Cana', async () => {
      const inArea = await request<Profile>('/restaurants', restaurantRoutes, `/${placeIds.inArea}`)
      expect(inArea.json.restaurant.neighborhood).toMatchObject({
        name: 'Punta Cana',
        city: 'Punta Cana',
      })
      const inSector = await request<Profile>(
        '/restaurants',
        restaurantRoutes,
        `/${placeIds.inSector}`,
      )
      expect(inSector.json.restaurant.neighborhood?.city).toBe('Santo Domingo')
    })

    test('a place in an area is still found by name in Explore', async () => {
      const { json } = await request<{ restaurants: { id: string }[] }>(
        '/restaurants',
        restaurantRoutes,
        `?q=${encodeURIComponent(`${tag} in area`)}`,
      )
      expect(json.restaurants.map((r) => r.id)).toContain(placeIds.inArea)
    })
  })
})
