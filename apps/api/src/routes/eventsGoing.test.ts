import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// "Friends going" on events: the exact count, the list of who, and who is told when a
// member signs up. Real Postgres, same local-only, tag-and-clean-up harness as
// events.test.ts / home.test.ts (see events.test.ts's header for why it is gated).

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
  const [{ db, schema }, { eventsRoutes, eventGoingRecipients }] = await Promise.all([
    import('@mesa/db'),
    import('./events'),
  ])
  return { db, schema, eventsRoutes, eventGoingRecipients }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Detail = {
  event: { friendsGoing: { id: string }[]; friendsGoingCount: number; goingCount: number }
}

describe.skipIf(!deps)('friends going on events (local DB)', () => {
  if (!deps) return
  const { db, schema, eventsRoutes, eventGoingRecipients } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const uid = (label: string) => `${tag}-${label}`
  const hours = (h: number) => new Date(Date.now() + h * 3600_000)

  const me: Me = {
    id: uid('me'),
    name: 'Going Me',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  // Seven friends I follow (all going), one I follow who is only "interested", one I
  // blocked, one Mesa banned, a stranger; and people who follow ME.
  const friends = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'] as const
  const others = ['interested', 'blocked', 'banned', 'stranger'] as const
  const followers = ['g1', 'g2', 'gblocked', 'gbanned', 'gblocker'] as const
  const allLabels = [...friends, ...others, ...followers]

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/events', eventsRoutes)
  const get = async (path: string) => app.request(`/events${path}`)

  const ids = { upcoming: crypto.randomUUID(), ended: crypto.randomUUID() }
  let neighborhoodId = ''
  let restaurantId = ''

  beforeAll(async () => {
    const person = (label: string, extra: object = {}) => ({
      id: uid(label),
      name: `Person ${label}`,
      email: `${tag}-${label}@example.test`,
      handle: uid(label),
      ...extra,
    })
    await db
      .insert(schema.user)
      .values([
        { id: me.id, name: me.name, email: me.email },
        ...allLabels.map((l) =>
          person(l, l === 'banned' || l === 'gbanned' ? { bannedAt: new Date() } : {}),
        ),
      ])
    // I follow the seven, the interested one, the blocked one and the banned one.
    await db.insert(schema.follows).values(
      [...friends, 'interested', 'blocked', 'banned'].map((l) => ({
        followerId: me.id,
        followingId: uid(l),
      })),
    )
    // Who follows ME: two who can be told, and three who cannot.
    await db
      .insert(schema.follows)
      .values(followers.map((l) => ({ followerId: uid(l), followingId: me.id })))
    await db.insert(schema.userBlocks).values([
      { blockerId: me.id, blockedId: uid('blocked') },
      { blockerId: me.id, blockedId: uid('gblocked') },
      { blockerId: uid('gblocker'), blockedId: me.id },
    ])

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
    await db.insert(schema.events).values([
      { id: ids.upcoming, restaurantId, title: tag, slug: `${tag}-up`, startsAt: hours(24) },
      { id: ids.ended, restaurantId, title: tag, slug: `${tag}-ended`, startsAt: hours(-6) },
    ])

    // Friends f1..f7 signed up one after another (f7 most recently).
    await db.insert(schema.eventRsvps).values(
      friends.map((l, i) => ({
        eventId: ids.upcoming,
        userId: uid(l),
        status: 'going' as const,
        updatedAt: new Date(Date.now() - (friends.length - i) * 60_000),
      })),
    )
    await db.insert(schema.eventRsvps).values([
      { eventId: ids.upcoming, userId: uid('interested'), status: 'interested' as const },
      { eventId: ids.upcoming, userId: uid('blocked'), status: 'going' as const },
      { eventId: ids.upcoming, userId: uid('banned'), status: 'going' as const },
      { eventId: ids.upcoming, userId: uid('stranger'), status: 'going' as const },
    ])
  })

  afterAll(async () => {
    // users cascade follows, blocks, rsvps and push_log; events cascade rsvps.
    await db.delete(schema.events).where(inArray(schema.events.id, Object.values(ids)))
    await db.delete(schema.user).where(inArray(schema.user.id, [me.id, ...allLabels.map(uid)]))
    if (restaurantId)
      await db.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurantId))
    if (neighborhoodId)
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
  })

  test('the detail counts every friend going, and only the first three are faces', async () => {
    const { event } = (await (await get(`/${ids.upcoming}`)).json()) as Detail
    // Seven friends — not the blocked, banned, "interested" or stranger — though the
    // event's own going-count is everyone who said going.
    expect(event.friendsGoingCount).toBe(7)
    expect(event.friendsGoing).toHaveLength(3)
    expect(event.goingCount).toBeGreaterThanOrEqual(7)
  })

  test('the browse list carries the same count', async () => {
    const res = (await (await get('?when=upcoming')).json()) as {
      events: { id: string; friendsGoingCount: number }[]
    }
    expect(res.events.find((e) => e.id === ids.upcoming)?.friendsGoingCount).toBe(7)
  })

  test('the who-is-going list is the people I follow, latest sign-up first, without blocked or banned', async () => {
    const res = (await (await get(`/${ids.upcoming}/going`)).json()) as {
      friends: { id: string; name: string; handle: string | null }[]
    }
    expect(res.friends.map((f) => f.id)).toEqual(
      ['f7', 'f6', 'f5', 'f4', 'f3', 'f2', 'f1'].map(uid),
    )
    expect(res.friends[0]?.name).toBe('Person f7')
  })

  test('the list 404s for a missing or malformed event', async () => {
    expect((await get(`/${crypto.randomUUID()}/going`)).status).toBe(404)
    expect((await get('/not-a-uuid/going')).status).toBe(404)
  })

  test('only followers who can be told are recipients: not banned, not blocked either way', async () => {
    const recipients = (await eventGoingRecipients(me)).sort()
    expect(recipients).toEqual([uid('g1'), uid('g2')].sort())
  })

  test('my first "going" to an upcoming event is announced once, however often I toggle', async () => {
    const marker = () =>
      db
        .select()
        .from(schema.pushLog)
        .where(
          and(
            eq(schema.pushLog.userId, me.id),
            eq(schema.pushLog.key, `event-going-announced:${ids.upcoming}`),
          ),
        )
    const put = (id: string) =>
      app.request(`/events/${id}/rsvp`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'going' }),
      })
    expect(await marker()).toHaveLength(0)
    expect((await put(ids.upcoming)).status).toBe(200)
    expect(await marker()).toHaveLength(1)
    // Away and back: the marker is still the one row (a second insert is a no-op).
    await app.request(`/events/${ids.upcoming}/rsvp`, { method: 'DELETE' })
    expect((await put(ids.upcoming)).status).toBe(200)
    expect(await marker()).toHaveLength(1)
  })

  test('an event that has ended is not announced', async () => {
    const res = await app.request(`/events/${ids.ended}/rsvp`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'going' }),
    })
    expect(res.status).toBe(200)
    const rows = await db
      .select()
      .from(schema.pushLog)
      .where(eq(schema.pushLog.key, `event-going-announced:${ids.ended}`))
    expect(rows).toHaveLength(0)
  })
})
