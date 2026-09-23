import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Route-level checks for GET /suggestions' M9 rescore (one merged ranking —
// mutual-follower count, then taste match, then follower count as the tail
// fallback — replacing the old disjoint-tier concatenation) and the new
// dismiss endpoint. Real Postgres, same local-only, tag-and-clean-up harness
// as events.test.ts/leaderboard.test.ts/share-pages.test.ts; see
// events.test.ts's own header for why it's gated this way.

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
  const [{ db, schema }, { socialRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./social'),
  ])
  return { db, schema, socialRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Suggestion = {
  id: string
  handle: string | null
  reason:
    | { kind: 'mutual'; name: string; extraCount: number }
    | { kind: 'taste'; percent: number }
    | { kind: 'popular' }
}

describe.skipIf(!deps)('social suggestions + dismissal (local DB)', () => {
  if (!deps) return
  const { db, schema, socialRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const userId = (label: string) => `${tag}-${label}`

  // me follows two connectors. mutualA is followed by both connectors
  // (mutualCount 2); mutualB by only connector1 (mutualCount 1) but ranks
  // identically to me on 3 shared places, a PERFECT taste match — set up
  // specifically to prove mutual count wins even against the best possible
  // taste score. tasteHigh/tasteLow share no follows with me at all
  // (mutualCount 0) but rank the same 3 places at two different gaps, to
  // prove taste tie-breaks within that zero-mutual bucket. popularNoHandle
  // has neither signal, only real followers and a null handle.
  const me: Me = {
    id: userId('me'),
    name: 'Suggestions Me',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const labels = [
    'connector1',
    'connector2',
    'mutualA',
    'mutualB',
    'tasteHigh',
    'tasteLow',
    'popularNoHandle',
  ] as const

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/social', socialRoutes)

  const suggestions = async () => {
    const res = await app.request('/social/suggestions')
    return ((await res.json()) as { users: Suggestion[] }).users
  }
  const post = (path: string) => app.request(path, { method: 'POST' })

  let neighborhoodId = ''
  const restaurantIds: string[] = []
  let fillerIds: string[] = []

  beforeAll(async () => {
    // popularRows ranks EVERY user in the DB by real followerCount, unlike
    // the mutual/taste pools (which are inherently scoped to this fixture's
    // own fresh follow/ranking graph and can't be crowded by pre-existing
    // data) — so popularNoHandle needs a follower count that beats whatever
    // the local DB's real max happens to be today, not a guessed constant.
    // leaderboard.test.ts hit this same crowding risk once already this
    // session (its "stranger" fixture) and hardcoded a headroom bump; this
    // reads the real max instead so it can't go stale as real data grows.
    const maxFollowersRes = await db.execute(
      sql`select max(c)::int as max from (select count(*) as c from ${schema.follows} group by ${schema.follows.followingId}) t`,
    )
    const realMaxFollowers =
      (maxFollowersRes.rows[0] as { max: number | null } | undefined)?.max ?? 0
    fillerIds = Array.from({ length: realMaxFollowers + 10 }, (_, i) => userId(`filler${i}`))

    await db.insert(schema.user).values([
      { id: me.id, name: me.name, email: me.email, handle: userId('me') },
      ...labels.map((label) => ({
        id: userId(label),
        name: `Suggestions ${label}`,
        email: `${tag}-${label}@example.test`,
        handle: label === 'popularNoHandle' ? null : userId(label),
      })),
      ...fillerIds.map((id) => ({ id, name: id, email: `${id}@example.test`, handle: id })),
    ])

    await db
      .insert(schema.follows)
      .values([
        { followerId: me.id, followingId: userId('connector1') },
        { followerId: me.id, followingId: userId('connector2') },
        { followerId: userId('connector1'), followingId: userId('mutualA') },
        { followerId: userId('connector2'), followingId: userId('mutualA') },
        { followerId: userId('connector1'), followingId: userId('mutualB') },
        ...fillerIds.map((fid) => ({ followerId: fid, followingId: userId('popularNoHandle') })),
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

    // Scores are stored directly, not run through scoreFor — a shared gap of
    // exactly 16 (OPPOSITE_GAP for SCORE_TOP=96/SCORE_BOTTOM=72) drives
    // tasteMatch's raw to exactly 0, so both fixture percentages land on
    // whole numbers with no floating-point rounding risk: avgGap 0 -> 80%,
    // avgGap 16 -> 20%.
    const rankingRow = (uid: string, scores: number[]) =>
      restaurantIds.map((rid, i) => ({
        userId: uid,
        restaurantId: rid,
        position: i + 1,
        score: scores[i]!,
      }))
    await db
      .insert(schema.rankings)
      .values([
        ...rankingRow(me.id, [96, 84, 72]),
        ...rankingRow(userId('mutualB'), [96, 84, 72]),
        ...rankingRow(userId('tasteHigh'), [96, 84, 72]),
        ...rankingRow(userId('tasteLow'), [80, 68, 56]),
      ])
  })

  afterAll(async () => {
    // user delete cascades follows, rankings, and dismissals.
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [me.id, ...labels.map(userId), ...fillerIds]))
    if (restaurantIds.length) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
  })

  test('mutual-follower count strictly outranks taste match, even against a perfect taste score', async () => {
    const users = await suggestions()
    const aIdx = users.findIndex((u) => u.id === userId('mutualA'))
    const bIdx = users.findIndex((u) => u.id === userId('mutualB'))
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    expect(aIdx).toBeLessThan(bIdx) // mutualA (2 mutuals) outranks mutualB (1 mutual, 80% taste)

    // mutualA has two qualifying connectors, so which one sampleMutualFriend
    // picked isn't deterministic — only extraCount (2 - 1) is pinned.
    expect(users[aIdx]).toMatchObject({ reason: { kind: 'mutual', extraCount: 1 } })
    // mutualB has exactly one, so its reason is fully deterministic — and
    // still "mutual", not "taste", even though taste is what's carrying its
    // rank: the displayed reason is always the strongest signal available.
    expect(users[bIdx]).toMatchObject({
      reason: { kind: 'mutual', name: 'Suggestions connector1', extraCount: 0 },
    })
  })

  test('taste match tie-breaks correctly within the zero-mutual bucket', async () => {
    const users = await suggestions()
    const highIdx = users.findIndex((u) => u.id === userId('tasteHigh'))
    const lowIdx = users.findIndex((u) => u.id === userId('tasteLow'))
    expect(highIdx).toBeGreaterThanOrEqual(0)
    expect(lowIdx).toBeGreaterThanOrEqual(0)
    expect(highIdx).toBeLessThan(lowIdx)

    expect(users[highIdx]).toMatchObject({ reason: { kind: 'taste', percent: 80 } })
    expect(users[lowIdx]).toMatchObject({ reason: { kind: 'taste', percent: 20 } })
  })

  test('a candidate with no mutual/taste signal but real followers still appears, ranked below the taste tier, with a null handle', async () => {
    const users = await suggestions()
    const popularIdx = users.findIndex((u) => u.id === userId('popularNoHandle'))
    const lowIdx = users.findIndex((u) => u.id === userId('tasteLow'))
    expect(popularIdx).toBeGreaterThanOrEqual(0)
    expect(popularIdx).toBeGreaterThan(lowIdx) // the weakest taste candidate still outranks the tail

    expect(users[popularIdx]).toMatchObject({ handle: null, reason: { kind: 'popular' } })
  })

  test('dismiss rejects targeting yourself and 404s on an unknown user', async () => {
    expect((await post(`/social/suggestions/${me.id}/dismiss`)).status).toBe(400)
    expect((await post(`/social/suggestions/${tag}-nonexistent/dismiss`)).status).toBe(404)
  })

  // Declared last: it dismisses tasteLow, which the taste-tie-break and
  // popular-tail tests above both depend on being present. bun:test runs
  // tests within a describe sequentially in declaration order, so this is
  // intentional — reordering it would break those assertions.
  test('dismissing a suggestion removes it from a later GET, leaving the rest untouched', async () => {
    const before = await suggestions()
    expect(before.some((u) => u.id === userId('tasteLow'))).toBe(true)

    const res = await post(`/social/suggestions/${userId('tasteLow')}/dismiss`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const after = await suggestions()
    expect(after.some((u) => u.id === userId('tasteLow'))).toBe(false)
    expect(after.some((u) => u.id === userId('tasteHigh'))).toBe(true)
    expect(after.some((u) => u.id === userId('mutualA'))).toBe(true)
  })
})
