import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Route-level checks for scope filtering and the myRank/citywideRank
// reconciliation (M7) — both live in SQL, so they need a real Postgres. Same
// local-only, tag-and-clean-up harness as events.test.ts; see its own header
// for why it's gated this way.

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
  const [{ db, schema }, { leaderboardRoutes }, { citywideRank }] = await Promise.all([
    import('@mesa/db'),
    import('./leaderboard'),
    import('../lib/visibility'),
  ])
  return { db, schema, leaderboardRoutes, citywideRank }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Row = { id: string; count: number }

describe.skipIf(!deps)('leaderboard routes (local DB)', () => {
  if (!deps) return
  const { db, schema, leaderboardRoutes, citywideRank } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const userId = (label: string) => `${tag}-${label}`

  // me: 2 rankings. friend: I follow them, 5. follower: they follow me, 3
  // (exercises the OR's other branch). stranger: no relation, 25 — comfortably
  // above every other ranker in a fresh local DB, so scope=all's top-50 cap
  // can't crowd them out and turn "scope=all includes them" into a flake.
  const me: Me = {
    id: userId('me'),
    name: 'Leaderboard Me',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const others: { label: 'friend' | 'follower' | 'stranger'; count: number }[] = [
    { label: 'friend', count: 5 },
    { label: 'follower', count: 3 },
    { label: 'stranger', count: 25 },
  ]

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/leaderboard', leaderboardRoutes)

  let neighborhoodId = ''
  const restaurantIds: string[] = []

  beforeAll(async () => {
    await db.insert(schema.user).values([
      { id: me.id, name: me.name, email: me.email, handle: userId('me') },
      ...others.map((o) => ({
        id: userId(o.label),
        name: `Leaderboard ${o.label}`,
        email: `${tag}-${o.label}@example.test`,
        handle: userId(o.label),
      })),
    ])
    await db.insert(schema.follows).values([
      { followerId: me.id, followingId: userId('friend') },
      { followerId: userId('follower'), followingId: me.id },
    ])

    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    if (!n) throw new Error('fixture neighborhood insert failed')
    neighborhoodId = n.id

    // 25 shared restaurants (the highest count needed) — each user ranks a
    // prefix of them, so the unique (user, restaurant) constraint never collides.
    const restaurants = await db
      .insert(schema.restaurants)
      .values(
        Array.from({ length: 25 }, (_, i) => ({
          name: `${tag}-r${i}`,
          neighborhoodId,
          lat: 18.47,
          lng: -69.93,
          isDemo: true,
        })),
      )
      .returning({ id: schema.restaurants.id })
    restaurantIds.push(...restaurants.map((r) => r.id))

    const rankingRow = (uid: string, restaurantId: string, position: number) => ({
      userId: uid,
      restaurantId,
      position,
      score: 80,
    })
    await db
      .insert(schema.rankings)
      .values([
        ...restaurantIds.slice(0, 2).map((rid, i) => rankingRow(me.id, rid, i + 1)),
        ...others.flatMap((o) =>
          restaurantIds.slice(0, o.count).map((rid, i) => rankingRow(userId(o.label), rid, i + 1)),
        ),
      ])
  })

  afterAll(async () => {
    // rankings cascade off both user and restaurant deletes.
    await db.delete(schema.follows).where(eq(schema.follows.followingId, me.id))
    await db.delete(schema.follows).where(eq(schema.follows.followerId, me.id))
    if (restaurantIds.length) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [me.id, ...others.map((o) => userId(o.label))]))
  })

  const leaderboard = async (qs: string) => {
    const res = await app.request(`/leaderboard?${qs}`)
    return (await res.json()) as { leaderboard: Row[]; myRank: number | null; scope: string }
  }

  test('scope=friends is followingIds ∪ followerIds ∪ me — not just one direction', async () => {
    const body = await leaderboard('scope=friends&period=all')
    const ids = body.leaderboard.map((r) => r.id)
    expect(ids).toContain(me.id)
    expect(ids).toContain(userId('friend')) // I follow them
    expect(ids).toContain(userId('follower')) // they follow me
    expect(ids).not.toContain(userId('stranger'))
  })

  test('scope=all (default) includes everyone, unlike scope=friends', async () => {
    const body = await leaderboard('period=all')
    expect(body.scope).toBe('all')
    const ids = body.leaderboard.map((r) => r.id)
    expect(ids).toContain(userId('stranger'))
  })

  test("myRank (scope=all, period=all) is exactly citywideRank's own count — the two numbers this milestone reconciles can never disagree", async () => {
    const body = await leaderboard('period=all')
    const expected = await citywideRank(me.id, 2) // me's fixture count
    expect(body.myRank).toBe(expected)
  })

  test('period=month does not borrow the all-time citywideRank path (myRank stays list-relative)', async () => {
    // All fixture rankings were just inserted, so they're all "this month" —
    // the friend/follower/stranger counts (5/3/25) all still outrank me's 2
    // within the month-filtered rows, same as they do all-time. If this ever
    // read the all-time citywideRank instead, it would silently ignore the
    // period filter — this pins the branch, not just the returned value.
    const body = await leaderboard('period=month')
    const i = body.leaderboard.findIndex((r) => r.id === me.id)
    expect(body.myRank).toBe(i >= 0 ? i + 1 : null)
  })
})
