import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// "People you both know": who among the people I follow and the people who follow me also follows
// a given person — through GET /social/mutuals, the profile's `mutual` field and the suggestions'
// `mutual` field. Real Postgres, same local-only, tag-and-clean-up harness as social.test.ts.

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
  const [{ db, schema }, { socialRoutes }, { rankingsRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('../routes/social'),
    import('../routes/rankings'),
  ])
  return { db, schema, socialRoutes, rankingsRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Person = { id: string; name: string; image: string | null }
type Row = { id: string; isFollowing: boolean }

describe.skipIf(!deps)('mutual connections (local DB)', () => {
  if (!deps) return
  const { db, schema, socialRoutes, rankingsRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const id = (label: string) => `${tag}-${label}`

  // target — the person whose mutuals are read.
  //   followed   I follow them, they follow target            -> counts, first
  //   privFollowed  private, I follow them, they follow target -> counts (I follow them)
  //   follower   follows ME (I don't follow back), follows target -> counts, after the people I follow
  //   privFollower  private, follows me, I don't follow back, follows target -> hidden: Ana's follows
  //                 are not mine to see
  //   stranger   follows target, unconnected to me             -> not mine
  //   banned / blocked  connected to me and follow target      -> excluded
  const labels = [
    'target',
    'followed',
    'privFollowed',
    'follower',
    'privFollower',
    'stranger',
    'banned',
    'blocked',
    'blockedTarget',
    'bannedTarget',
  ] as const
  const me: Me = {
    id: id('me'),
    name: 'Mutuals Me',
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
    .route('/social', socialRoutes)
    .route('/rankings', rankingsRoutes)

  const f = (follower: string, following: string, at?: string) => ({
    followerId: id(follower),
    followingId: id(following),
    ...(at ? { createdAt: new Date(at) } : {}),
  })

  beforeAll(async () => {
    await db.insert(schema.user).values([
      { id: me.id, name: me.name, email: me.email, handle: id('me') },
      ...labels.map((label) => ({
        id: id(label),
        name: `Mutual ${label}`,
        email: `${tag}-${label}@example.test`,
        handle: id(label),
        isPrivate: label === 'privFollowed' || label === 'privFollower',
        bannedAt: label === 'banned' || label === 'bannedTarget' ? new Date() : null,
      })),
    ])
    await db.insert(schema.follows).values([
      // my side: who I follow, who follows me
      { followerId: me.id, followingId: id('followed') },
      { followerId: me.id, followingId: id('privFollowed') },
      { followerId: me.id, followingId: id('banned') },
      { followerId: me.id, followingId: id('blocked') },
      { followerId: id('follower'), followingId: me.id },
      { followerId: id('privFollower'), followingId: me.id },
      // who follows the target (createdAt pinned: newest of the people I follow comes first)
      f('followed', 'target', '2026-01-01'),
      f('privFollowed', 'target', '2026-02-01'),
      f('follower', 'target', '2026-03-01'),
      f('privFollower', 'target', '2026-03-02'),
      f('stranger', 'target'),
      f('banned', 'target'),
      f('blocked', 'target'),
    ])
    await db.insert(schema.userBlocks).values([
      { blockerId: me.id, blockedId: id('blocked') },
      { blockerId: me.id, blockedId: id('blockedTarget') },
    ])
  })

  afterAll(async () => {
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [me.id, ...labels.map((label) => id(label))]))
  })

  const mutuals = async (userId: string) => app.request(`/social/mutuals?userId=${userId}`)

  test('counts my followers as well as the people I follow, people I follow first', async () => {
    const res = await mutuals(id('target'))
    expect(res.status).toBe(200)
    const { users } = (await res.json()) as { users: Row[] }
    // privFollowed (newest follow of someone I follow), followed, then follower (follows me only).
    expect(users.map((u) => u.id)).toEqual([id('privFollowed'), id('followed'), id('follower')])
    expect(users.map((u) => u.isFollowing)).toEqual([true, true, false])
  })

  test('leaves out a private follower I am not approved on, strangers, banned and blocked people', async () => {
    const { users } = (await (await mutuals(id('target'))).json()) as { users: Row[] }
    const ids = users.map((u) => u.id)
    for (const hidden of ['privFollower', 'stranger', 'banned', 'blocked']) {
      expect(ids).not.toContain(id(hidden))
    }
  })

  test('a banned or blocked target is not found, and my own profile has none', async () => {
    expect((await mutuals(id('blockedTarget'))).status).toBe(404)
    expect((await mutuals(id('bannedTarget'))).status).toBe(404)
    expect((await mutuals(`${tag}-nobody`)).status).toBe(404)
    const mine = (await (await mutuals(me.id)).json()) as { users: Row[] }
    expect(mine.users).toEqual([])
  })

  test("the profile carries the same count and the first faces, and an unconnected person's is empty", async () => {
    const res = await app.request(`/rankings/user/${id('target')}`)
    const body = (await res.json()) as { mutual: { count: number; sample: Person[] } }
    expect(body.mutual.count).toBe(3)
    expect(body.mutual.sample.map((p) => p.id)).toEqual([
      id('privFollowed'),
      id('followed'),
      id('follower'),
    ])

    const other = await app.request(`/rankings/user/${id('stranger')}`)
    expect(((await other.json()) as { mutual: { count: number } }).mutual.count).toBe(0)
  })

  test('the suggestion for the target says who follows them and counts every mutual', async () => {
    const res = await app.request('/social/suggestions')
    const { users } = (await res.json()) as {
      users: {
        id: string
        mutual: { count: number; sample: Person[] }
        reason: { kind: string; name?: string; extraCount?: number }
      }[]
    }
    const row = users.find((u) => u.id === id('target'))
    expect(row?.mutual.count).toBe(3)
    expect(row?.reason).toMatchObject({
      kind: 'mutual',
      name: 'Mutual privFollowed',
      extraCount: 2,
    })
  })
})
