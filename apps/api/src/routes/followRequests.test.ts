import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { and, eq, inArray, or } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Private accounts and follow requests (F1): the request lifecycle, what the inbox does with a
// request, and — the point of it — that a private member's content stays behind approval on every
// surface that showed it. Real Postgres, same local-only, tag-and-clean-up harness as
// notifications.test.ts (see events.test.ts's header for why it is gated this way).

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
    { socialRoutes },
    { rankingsRoutes },
    { meRoutes },
    { notificationsRoutes },
    { moderationRoutes },
    { leaderboardRoutes },
    { dishesRoutes },
    { sharePagesRoutes },
    { settleNotify },
  ] = await Promise.all([
    import('@mesa/db'),
    import('./social'),
    import('./rankings'),
    import('./me'),
    import('./notifications'),
    import('./moderation'),
    import('./leaderboard'),
    import('./dishes'),
    import('./share-pages'),
    import('../lib/notify'),
  ])
  return {
    db,
    schema,
    socialRoutes,
    rankingsRoutes,
    meRoutes,
    notificationsRoutes,
    moderationRoutes,
    leaderboardRoutes,
    dishesRoutes,
    sharePagesRoutes,
    settleNotify,
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Profile = {
  user: { id: string; name: string; isPrivate: boolean }
  locked: boolean
  rankings: { id: string }[]
  rankedCount: number
  isFollowing: boolean
  followStatus: 'none' | 'requested' | 'following'
  followerCount: number
  followingCount: number
  matchPercent: number | null
}

describe.skipIf(!deps)('private accounts and follow requests (local DB)', () => {
  if (!deps) return
  const {
    db,
    schema,
    socialRoutes,
    rankingsRoutes,
    meRoutes,
    notificationsRoutes,
    moderationRoutes,
    leaderboardRoutes,
    dishesRoutes,
    sharePagesRoutes,
    settleNotify,
  } = deps
  const { notifications, follows, followRequests } = schema

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const uid = (label: string) => `${tag}-${label}`
  const person = (label: string): Me => ({
    id: uid(label),
    name: `Person ${label}`,
    email: `${tag}-${label}@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  // priv is the private account; ana asks; bo is an outsider who never asks; cy is approved;
  // pub is an open account.
  const priv = person('priv')
  const ana = person('ana')
  const bo = person('bo')
  const cy = person('cy')
  const pub = person('pub')

  const appAs = (who: Me) =>
    new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', who)
        c.set('session', null)
        await next()
      })
      .route('/social', socialRoutes)
      .route('/rankings', rankingsRoutes)
      .route('/me', meRoutes)
      .route('/notifications', notificationsRoutes)
      .route('/moderation', moderationRoutes)
      .route('/leaderboard', leaderboardRoutes)
      .route('/dishes', dishesRoutes)
  const call = async <T>(who: Me, method: string, path: string, body?: unknown) => {
    const res = await appAs(who).request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, json: (await res.json().catch(() => null)) as T }
  }
  const setPrivate = (value: boolean) =>
    db.update(schema.user).set({ isPrivate: value }).where(eq(schema.user.id, priv.id))
  const requestRows = () =>
    db.select().from(followRequests).where(eq(followRequests.targetId, priv.id))
  const notifRows = (userId: string, kind: string) =>
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.kind, kind as 'follow')))

  let neighborhoodId = ''
  let restaurantId = ''
  let dishId = ''

  beforeAll(async () => {
    await db.insert(schema.user).values(
      [priv, ana, bo, cy, pub].map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        handle: p.id,
      })),
    )
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n!.id
    const [r] = await db
      .insert(schema.restaurants)
      .values({ name: tag, neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true })
      .returning({ id: schema.restaurants.id })
    restaurantId = r!.id
    // priv has ranked a place and posted a PUBLIC dish; cy follows priv (approved already).
    const [k] = await db
      .insert(schema.rankings)
      .values({ userId: priv.id, restaurantId, position: 1, score: 90 })
      .returning({ id: schema.rankings.id })
    await db
      .insert(schema.rankings)
      .values({ userId: ana.id, restaurantId, position: 1, score: 80 })
    const [d] = await db
      .insert(schema.dishes)
      .values({
        userId: priv.id,
        rankingId: k!.id,
        restaurantId,
        name: 'Pizza',
        visibility: 'public',
      })
      .returning({ id: schema.dishes.id })
    dishId = d!.id
  })

  beforeEach(async () => {
    await setPrivate(true)
    await db
      .delete(followRequests)
      .where(or(eq(followRequests.targetId, priv.id), eq(followRequests.requesterId, priv.id)))
    await db
      .delete(follows)
      .where(or(eq(follows.followingId, priv.id), eq(follows.followerId, priv.id)))
    await db.insert(follows).values({ followerId: cy.id, followingId: priv.id })
    await db
      .delete(notifications)
      .where(inArray(notifications.userId, [priv.id, ana.id, bo.id, cy.id]))
    await db.delete(schema.userBlocks).where(eq(schema.userBlocks.blockerId, priv.id))
  })

  afterAll(async () => {
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [priv.id, ana.id, bo.id, cy.id, pub.id]))
    if (restaurantId)
      await db.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurantId))
    if (neighborhoodId)
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
  })

  describe('asking to follow', () => {
    test('an open account is followed at once, with no request', async () => {
      const res = await call<{ status: string }>(ana, 'POST', '/social/follow', { userId: pub.id })
      expect(res.json.status).toBe('following')
      expect(await db.select().from(follows).where(eq(follows.followingId, pub.id))).toHaveLength(1)
      expect(
        await db.select().from(followRequests).where(eq(followRequests.targetId, pub.id)),
      ).toHaveLength(0)
      await db.delete(follows).where(eq(follows.followingId, pub.id))
    })

    test('a private account is asked, once, and the owner is told', async () => {
      const ask = () => call<{ status: string }>(ana, 'POST', '/social/follow', { userId: priv.id })
      expect((await ask()).json.status).toBe('requested')
      expect((await ask()).json.status).toBe('requested')
      await settleNotify()
      expect(await requestRows()).toHaveLength(1)
      expect(await db.select().from(follows).where(eq(follows.followerId, ana.id))).toHaveLength(0)
      expect(await notifRows(priv.id, 'follow_request')).toHaveLength(1)
    })

    test('someone who already follows stays following, and asking again changes nothing', async () => {
      const res = await call<{ status: string }>(cy, 'POST', '/social/follow', { userId: priv.id })
      expect(res.json.status).toBe('following')
      expect(await requestRows()).toHaveLength(0)
    })

    test('withdrawing a request removes it and its notification', async () => {
      await call(ana, 'POST', '/social/follow', { userId: priv.id })
      await settleNotify()
      await call(ana, 'DELETE', `/social/follow/${priv.id}`)
      expect(await requestRows()).toHaveLength(0)
      expect(await notifRows(priv.id, 'follow_request')).toHaveLength(0)
    })

    test('a request is in the badge but not in the inbox list', async () => {
      await call(ana, 'POST', '/social/follow', { userId: priv.id })
      await settleNotify()
      const inbox = await call<{ notifications: unknown[] }>(priv, 'GET', '/notifications/inbox')
      expect(inbox.json.notifications).toHaveLength(0)
      const unread = await call<{ count: number }>(priv, 'GET', '/notifications/unread')
      expect(unread.json.count).toBe(1)
    })
  })

  describe('answering requests', () => {
    beforeEach(async () => {
      await call(ana, 'POST', '/social/follow', { userId: priv.id })
      await settleNotify()
    })

    test('the owner sees who asked', async () => {
      const res = await call<{ requests: { id: string; name: string }[]; count: number }>(
        priv,
        'GET',
        '/social/requests',
      )
      expect(res.json.count).toBe(1)
      expect(res.json.requests[0]).toEqual(expect.objectContaining({ id: ana.id, name: ana.name }))
    })

    test('accepting makes the asker a follower and tells them; accepting twice is a 404', async () => {
      expect((await call(priv, 'POST', `/social/requests/${ana.id}/accept`)).status).toBe(200)
      await settleNotify()
      expect(await requestRows()).toHaveLength(0)
      expect(
        await db
          .select()
          .from(follows)
          .where(and(eq(follows.followerId, ana.id), eq(follows.followingId, priv.id))),
      ).toHaveLength(1)
      expect(await notifRows(priv.id, 'follow_request')).toHaveLength(0)
      const [told] = await notifRows(ana.id, 'follow_accepted')
      expect(told?.actorId).toBe(priv.id)
      expect((await call(priv, 'POST', `/social/requests/${ana.id}/accept`)).status).toBe(404)
    })

    test('declining deletes the request quietly', async () => {
      await call(priv, 'POST', `/social/requests/${ana.id}/decline`)
      await settleNotify()
      expect(await requestRows()).toHaveLength(0)
      expect(await notifRows(priv.id, 'follow_request')).toHaveLength(0)
      expect(await notifRows(ana.id, 'follow_accepted')).toHaveLength(0)
      expect(await db.select().from(follows).where(eq(follows.followerId, ana.id))).toHaveLength(0)
    })

    test('a block takes the pending request with it', async () => {
      await call(priv, 'POST', '/moderation/blocks', { userId: ana.id })
      expect(await requestRows()).toHaveLength(0)
      const res = await call<{ count: number }>(priv, 'GET', '/social/requests')
      expect(res.json.count).toBe(0)
    })

    test('turning the account public approves everyone waiting and tells them', async () => {
      const res = await call<{ isPrivate: boolean }>(priv, 'PATCH', '/me/privacy', {
        isPrivate: false,
      })
      expect(res.json.isPrivate).toBe(false)
      await settleNotify()
      expect(await requestRows()).toHaveLength(0)
      expect(
        await db
          .select()
          .from(follows)
          .where(and(eq(follows.followerId, ana.id), eq(follows.followingId, priv.id))),
      ).toHaveLength(1)
      expect(await notifRows(ana.id, 'follow_accepted')).toHaveLength(1)
    })

    test('turning it on leaves existing followers alone', async () => {
      await setPrivate(false)
      await call(priv, 'PATCH', '/me/privacy', { isPrivate: true })
      expect(await db.select().from(follows).where(eq(follows.followingId, priv.id))).toHaveLength(
        1,
      )
    })
  })

  describe('what a private account shows', () => {
    test('an outsider sees the header and counts, never the list', async () => {
      const res = await call<Profile>(bo, 'GET', `/rankings/user/${priv.id}`)
      expect(res.json.locked).toBe(true)
      expect(res.json.rankings).toEqual([])
      expect(res.json.rankedCount).toBe(1)
      expect(res.json.followerCount).toBe(1)
      expect(res.json.matchPercent).toBeNull()
      expect(res.json.followStatus).toBe('none')
      expect(res.json.user.isPrivate).toBe(true)
    })

    test('someone who asked sees "requested", still locked', async () => {
      await call(ana, 'POST', '/social/follow', { userId: priv.id })
      const res = await call<Profile>(ana, 'GET', `/rankings/user/${priv.id}`)
      expect(res.json.locked).toBe(true)
      expect(res.json.followStatus).toBe('requested')
    })

    test('an approved follower and the owner see everything', async () => {
      const approved = await call<Profile>(cy, 'GET', `/rankings/user/${priv.id}`)
      expect(approved.json.locked).toBe(false)
      expect(approved.json.rankings).toHaveLength(1)
      expect(approved.json.followStatus).toBe('following')
      const own = await call<Profile>(priv, 'GET', `/rankings/user/${priv.id}`)
      expect(own.json.locked).toBe(false)
    })

    test('the taste-match page is closed to an outsider, open to a follower', async () => {
      expect((await call(bo, 'GET', `/rankings/user/${priv.id}/match`)).status).toBe(404)
      expect((await call(cy, 'GET', `/rankings/user/${priv.id}/match`)).status).toBe(200)
    })

    test('the follower and following lists are locked to an outsider', async () => {
      const locked = await call<{ users: unknown[]; locked?: boolean }>(
        bo,
        'GET',
        `/social/followers?userId=${priv.id}`,
      )
      expect(locked.json).toEqual({ users: [], locked: true })
      const open = await call<{ users: { id: string }[] }>(
        cy,
        'GET',
        `/social/followers?userId=${priv.id}`,
      )
      expect(open.json.users.map((u) => u.id)).toEqual([cy.id])
    })

    test('the city leaderboard leaves a private account out for outsiders only', async () => {
      const ids = async (who: Me) =>
        (
          await call<{ leaderboard: { id: string }[] }>(who, 'GET', '/leaderboard')
        ).json.leaderboard.map((r) => r.id)
      expect(await ids(bo)).not.toContain(priv.id)
      expect(await ids(cy)).toContain(priv.id)
      expect(await ids(priv)).toContain(priv.id)
      await setPrivate(false)
      expect(await ids(bo)).toContain(priv.id)
    })

    test('a public dish from a private account is still only for approved followers', async () => {
      expect((await call(bo, 'GET', `/dishes/${dishId}`)).status).toBe(404)
      expect((await call(cy, 'GET', `/dishes/${dishId}`)).status).toBe(200)
      await setPrivate(false)
      expect((await call(bo, 'GET', `/dishes/${dishId}`)).status).toBe(200)
    })

    test('a private account has no public page, and is not quoted on a place page', async () => {
      const pages = new Hono().route('/p', sharePagesRoutes)
      expect((await pages.request(`/p/u/${priv.id}`)).status).toBe(404)
      await setPrivate(false)
      expect((await pages.request(`/p/u/${priv.id}`)).status).toBe(200)
    })
  })
})
