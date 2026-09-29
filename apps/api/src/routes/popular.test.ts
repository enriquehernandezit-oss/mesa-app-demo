import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Route-level checks for GET /popular: which places are eligible and how they order, the
// friend line, "New", the neighborhood filter and the cursor — the parts that live in
// SQL. The scoring rules themselves are unit-tested in lib/popular.test.ts; this proves
// the QUERIES feed them the right people and places (bans, blocks, closed and removed
// places, follows, recency). Real Postgres, same local-only, tag-and-clean-up harness as
// home.test.ts / social.test.ts (see events.test.ts's header for why it is gated).
//
// The local database also holds demo data, so every request narrows to the test's own
// neighborhood (`?hood=`): the list then holds only fixture places. (The city's average,
// which small samples drift toward, does include the demo data — so the assertions are
// about ORDER between fixtures that differ clearly, never about exact scores.)

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
  const [{ db, schema }, { popularRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./popular'),
  ])
  return { db, schema, popularRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Popular = {
  items: {
    phase: 'week' | 'all'
    restaurant: { id: string; name: string }
    score: number
    rankers: number
    isNew: boolean
    friends: { count: number; name: string | null; score: number | null }
  }[]
  nextCursor: string | null
}

describe.skipIf(!deps)('GET /popular (local DB)', () => {
  if (!deps) return
  const { db, schema, popularRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const uid = (label: string) => `${tag}-${label}`
  const DAY = 86_400_000
  const ago = (days: number) => new Date(Date.now() - days * DAY)

  const me: Me = {
    id: uid('me'),
    name: 'Popular Me',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const voters = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'] as const
  const userLabels = [...voters, 'f1', 'f2', 'blocked', 'banned'] as const

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/popular', popularRoutes)
  const get = async (query: string) =>
    (await (await app.request(`/popular${query}`)).json()) as Popular

  const hoods: Record<'h1' | 'h2' | 'h3', { id: string; slug: string }> = {
    h1: { id: '', slug: `${tag}-h1` },
    h2: { id: '', slug: `${tag}-h2` },
    h3: { id: '', slug: `${tag}-h3` },
  }
  const places: Record<string, string> = {}
  const keyOf = (id: string) => Object.entries(places).find(([, v]) => v === id)?.[0]
  const keys = (p: Popular) => p.items.map((i) => keyOf(i.restaurant.id))

  beforeAll(async () => {
    for (const key of Object.keys(hoods) as (keyof typeof hoods)[]) {
      const [n] = await db
        .insert(schema.neighborhoods)
        .values({
          slug: hoods[key].slug,
          name: hoods[key].slug,
          lat: 18.47,
          lng: -69.93,
          radiusM: 500,
        })
        .returning({ id: schema.neighborhoods.id })
      hoods[key].id = n!.id
    }

    // People: me, six strangers who do the ranking, two friends I follow (distinct first
    // names), a friend I have also blocked, and a friend Mesa banned.
    const person = (label: string, name: string, extra: object = {}) => ({
      id: uid(label),
      name,
      email: `${tag}-${label}@example.test`,
      handle: uid(label),
      ...extra,
    })
    await db
      .insert(schema.user)
      .values([
        { id: me.id, name: me.name, email: me.email },
        ...voters.map((v) => person(v, `Voter ${v}`)),
        person('f1', 'Alpha One'),
        person('f2', 'Beta Two'),
        person('blocked', 'Blocked'),
        person('banned', 'Banned', { bannedAt: new Date() }),
      ])
    await db.insert(schema.follows).values(
      (['f1', 'f2', 'blocked', 'banned'] as const).map((l) => ({
        followerId: me.id,
        followingId: uid(l),
      })),
    )
    await db.insert(schema.userBlocks).values({ blockerId: me.id, blockedId: uid('blocked') })

    // Places, added two months ago unless said otherwise (so "New" is a choice).
    const place = async (
      key: string,
      hood: keyof typeof hoods,
      extra: Partial<typeof schema.restaurants.$inferInsert> = {},
    ) => {
      const [r] = await db
        .insert(schema.restaurants)
        .values({
          name: `${tag}-${key}`,
          neighborhoodId: hoods[hood].id,
          lat: 18.47,
          lng: -69.93,
          isDemo: true,
          createdAt: ago(60),
          ...extra,
        })
        .returning({ id: schema.restaurants.id })
      places[key] = r!.id
    }
    await Promise.all([
      place('HOT', 'h1'),
      place('NEWP', 'h1', { createdAt: ago(5) }),
      place('BOTH', 'h1'),
      place('CALM', 'h1'),
      place('OLD', 'h1'),
      place('BF', 'h1'),
      place('FEW', 'h1'),
      place('BL', 'h1'),
      place('BAN', 'h1'),
      place('CLOSED', 'h1', { closedAt: new Date() }),
      place('REMOVED', 'h1', { removedAt: new Date() }),
      place('FAR', 'h2'),
      ...Array.from({ length: 22 }, (_, i) => place(`P${String(i).padStart(2, '0')}`, 'h3')),
    ])

    const rank = async (rows: [user: string, place: string, score: number, days: number][]) => {
      const out = await db
        .insert(schema.rankings)
        .values(
          rows.map(([u, p, score, days]) => ({
            userId: uid(u),
            restaurantId: places[p]!,
            position: 1,
            score,
            createdAt: ago(days),
          })),
        )
        .returning({
          id: schema.rankings.id,
          userId: schema.rankings.userId,
          restaurantId: schema.rankings.restaurantId,
        })
      return out
    }
    const hot = await rank([
      ['v1', 'HOT', 90, 1],
      ['v2', 'HOT', 90, 1],
      ['v3', 'HOT', 90, 2],
      ['f1', 'HOT', 95, 1],
    ])
    await rank([
      // Three fresh 85s, the place is new.
      ['v1', 'NEWP', 85, 1],
      ['v2', 'NEWP', 85, 1],
      ['v3', 'NEWP', 85, 1],
      // Two friends and a stranger, two days ago.
      ['f1', 'BOTH', 88, 2],
      ['f2', 'BOTH', 92, 2],
      ['v1', 'BOTH', 85, 2],
      // Three 80s, most of a week ago.
      ['v1', 'CALM', 80, 5],
      ['v2', 'CALM', 80, 6],
      ['v3', 'CALM', 80, 6],
      // Five 95s, none this week: the all-time tail.
      ...(['v1', 'v2', 'v3', 'v4', 'v5'] as const).map((v): [string, string, number, number] => [
        v,
        'OLD',
        95,
        20,
      ]),
      // A blocked friend is the third ranker here, so he must not count.
      ['v1', 'BF', 90, 1],
      ['v2', 'BF', 90, 1],
      ['v3', 'BF', 90, 1],
      ['blocked', 'BF', 90, 1],
      // Not enough people.
      ['v1', 'FEW', 99, 1],
      ['v2', 'FEW', 99, 1],
      // The third ranker is blocked / banned, so only two count.
      ['v1', 'BL', 90, 1],
      ['v2', 'BL', 90, 1],
      ['blocked', 'BL', 90, 1],
      ['v1', 'BAN', 90, 1],
      ['v2', 'BAN', 90, 1],
      ['banned', 'BAN', 90, 1],
      // Closed and removed places.
      ...(['v1', 'v2', 'v3', 'v4'] as const).flatMap((v): [string, string, number, number][] => [
        [v, 'CLOSED', 90, 1],
        [v, 'REMOVED', 90, 1],
      ]),
      // Another neighborhood.
      ['v1', 'FAR', 90, 1],
      ['v2', 'FAR', 90, 1],
      ['v3', 'FAR', 90, 1],
      // Twenty-two places for the cursor, best first by score (all this week).
      ...Array.from({ length: 22 }, (_, i) =>
        (['v1', 'v2', 'v3'] as const).map((v): [string, string, number, number] => [
          v,
          `P${String(i).padStart(2, '0')}`,
          96 - i,
          1,
        ]),
      ).flat(),
    ])
    // A save and a cheer this week lift HOT further.
    await db.insert(schema.savedPlaces).values({ userId: uid('v4'), restaurantId: places.HOT! })
    const v1Hot = hot.find((r) => r.userId === uid('v1'))!
    await db.insert(schema.cheers).values({ userId: uid('v5'), rankingId: v1Hot.id })
  })

  afterAll(async () => {
    // users cascade follows, blocks, rankings, saves and cheers.
    await db.delete(schema.user).where(inArray(schema.user.id, [me.id, ...userLabels.map(uid)]))
    const ids = Object.values(places)
    if (ids.length) await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, ids))
    await db.delete(schema.neighborhoods).where(
      inArray(
        schema.neighborhoods.id,
        Object.values(hoods).map((h) => h.id),
      ),
    )
  })

  test('the busiest, best-loved place is first, a quiet week later, the all-time tail last', async () => {
    const p = await get(`?hood=${hoods.h1.slug}`)
    const k = keys(p)
    expect(k[0]).toBe('HOT')
    expect(k.indexOf('NEWP')).toBeLessThan(k.indexOf('BOTH'))
    expect(k.indexOf('BOTH')).toBeLessThan(k.indexOf('CALM'))
    // Week places (any ranking in the last 7 days) come before the all-time tail.
    const phases = p.items.map((i) => i.phase)
    expect(phases).toEqual([...phases].sort((a, b) => (a === b ? 0 : a === 'week' ? -1 : 1)))
    expect(p.items.find((i) => keyOf(i.restaurant.id) === 'OLD')?.phase).toBe('all')
    expect(k[k.length - 1]).toBe('OLD')
  })

  test('two rankers, blocked or banned rankers, closed and removed places, other neighborhoods stay out', async () => {
    const k = keys(await get(`?hood=${hoods.h1.slug}`))
    for (const out of ['FEW', 'BL', 'BAN', 'CLOSED', 'REMOVED', 'FAR']) expect(k).not.toContain(out)
    expect([...k].sort()).toEqual(['BF', 'BOTH', 'CALM', 'HOT', 'NEWP', 'OLD'])
  })

  test("the score is everyone's average and rankers counts only people who count", async () => {
    const p = await get(`?hood=${hoods.h1.slug}`)
    const by = (key: string) => p.items.find((i) => keyOf(i.restaurant.id) === key)!
    // HOT: (90 + 90 + 90 + 95) / 4.
    expect(by('HOT').score).toBeCloseTo(91.25, 5)
    expect(by('HOT').rankers).toBe(4)
    // BF: the blocked friend is not a ranker and does not move the average.
    expect(by('BF').rankers).toBe(3)
    expect(by('BF').score).toBeCloseTo(90, 5)
  })

  test('the friend line: how many people I follow ranked it, and the highest of them', async () => {
    const p = await get(`?hood=${hoods.h1.slug}`)
    const by = (key: string) => p.items.find((i) => keyOf(i.restaurant.id) === key)!
    expect(by('HOT').friends).toEqual({ count: 1, name: 'Alpha', score: 95 })
    // f2's 92 beats f1's 88, and only first names are sent.
    expect(by('BOTH').friends).toEqual({ count: 2, name: 'Beta', score: 92 })
    // A blocked friend is nobody; a place no friend ranked has none.
    expect(by('BF').friends.count).toBe(0)
    expect(by('CALM').friends).toEqual({ count: 0, name: null, score: null })
  })

  test('"New" is a place added in the last three weeks', async () => {
    const p = await get(`?hood=${hoods.h1.slug}`)
    const isNew = (key: string) => p.items.find((i) => keyOf(i.restaurant.id) === key)!.isNew
    expect(isNew('NEWP')).toBe(true)
    expect(isNew('HOT')).toBe(false)
  })

  test('a neighborhood narrows the list to its places', async () => {
    expect(keys(await get(`?hood=${hoods.h2.slug}`))).toEqual(['FAR'])
  })

  test('pages of twenty by cursor, with nothing repeated or missed', async () => {
    const one = await get(`?hood=${hoods.h3.slug}`)
    expect(one.items).toHaveLength(20)
    expect(one.nextCursor).not.toBeNull()
    const two = await get(`?hood=${hoods.h3.slug}&cursor=${encodeURIComponent(one.nextCursor!)}`)
    expect(two.items).toHaveLength(2)
    expect(two.nextCursor).toBeNull()
    const all = [...one.items, ...two.items].map((i) => keyOf(i.restaurant.id))
    // Higher scores rank higher, so P00 (96) leads and P21 (75) is last; each appears once.
    expect(all).toEqual(Array.from({ length: 22 }, (_, i) => `P${String(i).padStart(2, '0')}`))
  })

  test('a cursor that is not one is a 400', async () => {
    const res = await app.request('/popular?cursor=garbage')
    expect(res.status).toBe(400)
  })
})
