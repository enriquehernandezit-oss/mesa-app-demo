import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// The abuse limits and small gaps closed in F6: daily budgets, a plan's invitee cap, event capacity,
// the sign-in lock lifted by a reset link, dish-name suggestions that respect visibility, reserved
// handles and the 18+ rule. Real Postgres, same local-only, tag-and-clean-up harness as
// privacyGaps.test.ts.

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
    { plansRoutes },
    { eventsRoutes },
    { dishesRoutes },
    { meRoutes },
    { sharePagesRoutes },
    budget,
    throttle,
    notifyLib,
    meLib,
  ] = await Promise.all([
    import('@mesa/db'),
    import('./plans'),
    import('./events'),
    import('./dishes'),
    import('./me'),
    import('./share-pages'),
    import('../lib/usageBudget'),
    import('../lib/authThrottle'),
    import('../lib/notify'),
    import('./me'),
  ])
  return {
    db,
    schema,
    plansRoutes,
    eventsRoutes,
    dishesRoutes,
    meRoutes,
    sharePagesRoutes,
    budget,
    throttle,
    notifyLib,
    meLib,
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('abuse limits and small gaps (local DB)', () => {
  if (!deps) return
  const {
    db,
    schema,
    plansRoutes,
    eventsRoutes,
    dishesRoutes,
    meRoutes,
    sharePagesRoutes,
    budget,
    throttle,
    notifyLib,
    meLib,
  } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const id = (label: string) => `${tag}-${label}`
  const person = (label: string, extra: Partial<Me> = {}): Me => ({
    id: id(label),
    name: `Limits ${label}`,
    email: `${tag}-${label}@example.test`,
    emailVerified: false,
    eulaAcceptedAt: new Date(),
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  })

  const host = person('host')
  const ana = person('ana')
  const ben = person('ben')
  const stranger = person('stranger')
  const poster = person('poster')
  const followerLabels = Array.from({ length: 51 }, (_, i) => `f${i}`)
  const allLabels = ['host', 'ana', 'ben', 'stranger', 'poster', ...followerLabels]

  let actor: Me = host
  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', actor)
      c.set('session', null)
      await next()
    })
    .route('/plans', plansRoutes)
    .route('/events', eventsRoutes)
    .route('/dishes', dishesRoutes)
    .route('/me', meRoutes)
  const publicApp = new Hono().route('/p', sharePagesRoutes)
  const as = (who: Me) => {
    actor = who
  }
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })

  let neighborhoodId = ''
  let restaurantId = ''
  let planId = ''
  let eventId = ''

  beforeAll(async () => {
    await db.insert(schema.user).values(
      allLabels.map((l) => ({
        id: id(l),
        name: `Limits ${l}`,
        email: `${tag}-${l}@example.test`,
        handle: `${tag}-${l}`,
      })),
    )
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n?.id ?? ''
    const [r] = await db
      .insert(schema.restaurants)
      .values({ name: `${tag}-r`, neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true })
      .returning({ id: schema.restaurants.id })
    restaurantId = r?.id ?? ''

    // 51 followers of the host; the first 50 are already on a plan.
    await db
      .insert(schema.follows)
      .values(followerLabels.map((l) => ({ followerId: id(l), followingId: host.id })))
    const [plan] = await db
      .insert(schema.plans)
      .values({
        hostId: host.id,
        startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'confirmed',
        chosenRestaurantId: restaurantId,
      })
      .returning({ id: schema.plans.id })
    planId = plan?.id ?? ''
    await db.insert(schema.planOptions).values({ planId, restaurantId, position: 0 })
    await db
      .insert(schema.planInvites)
      .values(followerLabels.slice(0, 50).map((l) => ({ planId, userId: id(l) })))

    // An event with exactly one spot.
    const [event] = await db
      .insert(schema.events)
      .values({
        slug: tag,
        restaurantId,
        title: 'One spot left',
        startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        capacity: 1,
      })
      .returning({ id: schema.events.id })
    eventId = event?.id ?? ''

    // Two dishes at the restaurant from a public account: one public, one friends-only.
    const [ranking] = await db
      .insert(schema.rankings)
      .values({ userId: poster.id, restaurantId, position: 1, score: 90 })
      .returning({ id: schema.rankings.id })
    await db.insert(schema.dishes).values([
      {
        userId: poster.id,
        rankingId: ranking?.id as string,
        restaurantId,
        name: 'Public Mofongo',
        visibility: 'public',
      },
      {
        userId: poster.id,
        rankingId: ranking?.id as string,
        restaurantId,
        name: 'Secret Tostones',
      },
    ])
  })

  afterAll(async () => {
    if (restaurantId)
      await db.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurantId))
    if (neighborhoodId)
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    await db.delete(schema.user).where(inArray(schema.user.id, allLabels.map(id)))
    await db.delete(schema.usageCounter).where(like(schema.usageCounter.key, `%${tag}%`))
    await db.delete(schema.authThrottle).where(like(schema.authThrottle.key, `%${tag}%`))
  })

  describe('daily budgets', () => {
    test('uploads: the 61st presigned URL of a day is refused', async () => {
      let allowed = 0
      for (let i = 0; i < 62; i++) if (await budget.spendUploadBudget(id('uploader'))) allowed++
      expect(allowed).toBe(budget.UPLOAD_DAILY_LIMIT)
    })

    test('plans: the 11th plan of a day is refused', async () => {
      let allowed = 0
      for (let i = 0; i < 12; i++) if (await budget.spendPlanBudget(id('planner'))) allowed++
      expect(allowed).toBe(budget.PLAN_DAILY_LIMIT)
    })
  })

  describe('a plan holds at most 50 invitees', () => {
    test('adding a 51st person later is refused', async () => {
      as(host)
      const res = await send('POST', `/plans/${planId}/invite`, { userIds: [id('f50')] })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('too_many_invitees')
    })
  })

  describe('event capacity', () => {
    test('the first person gets the only spot, the second is told it is full', async () => {
      as(ana)
      expect((await send('PUT', `/events/${eventId}/rsvp`, { status: 'going' })).status).toBe(200)
      as(ben)
      const full = await send('PUT', `/events/${eventId}/rsvp`, { status: 'going' })
      expect(full.status).toBe(409)
      expect(((await full.json()) as { error: string }).error).toBe('event_full')
    })

    test('"interested" never takes a spot, and someone already going keeps theirs', async () => {
      as(ben)
      expect((await send('PUT', `/events/${eventId}/rsvp`, { status: 'interested' })).status).toBe(
        200,
      )
      as(ana)
      expect((await send('PUT', `/events/${eventId}/rsvp`, { status: 'going' })).status).toBe(200)
    })

    test('a freed spot can be taken', async () => {
      as(ana)
      expect((await send('DELETE', `/events/${eventId}/rsvp`)).status).toBe(200)
      as(ben)
      expect((await send('PUT', `/events/${eventId}/rsvp`, { status: 'going' })).status).toBe(200)
    })
  })

  describe('a reset link lifts a sign-in lock', () => {
    const email = `${tag}-locked@example.test`
    const adapter = (expiresAt: Date) => ({
      findVerificationValue: async () => ({ value: 'someone', expiresAt }),
      findUserById: async () => ({ email }),
    })

    test('a valid token clears it; an expired one does not', async () => {
      const key = throttle.throttleKey(email)
      for (let i = 0; i < 6; i++) await throttle.noteFailure(key)
      expect(await throttle.lockedForMs(key)).toBeGreaterThan(0)

      await throttle.clearLockForResetToken(adapter(new Date(Date.now() - 1000)), 'tok')
      expect(await throttle.lockedForMs(key)).toBeGreaterThan(0)

      await throttle.clearLockForResetToken(adapter(new Date(Date.now() + 60_000)), 'tok')
      expect(await throttle.lockedForMs(key)).toBe(0)
    })

    test('no token, or an unknown one, changes nothing', async () => {
      const key = throttle.throttleKey(email)
      for (let i = 0; i < 6; i++) await throttle.noteFailure(key)
      await throttle.clearLockForResetToken(adapter(new Date(Date.now() + 60_000)), undefined)
      await throttle.clearLockForResetToken(
        { findVerificationValue: async () => null, findUserById: async () => null },
        'nope',
      )
      expect(await throttle.lockedForMs(key)).toBeGreaterThan(0)
    })
  })

  describe('dish-name suggestions', () => {
    test("a stranger is offered the public dish's name, not the friends-only one", async () => {
      as(stranger)
      const res = await send('GET', `/dishes/restaurant/${restaurantId}/names`)
      const names = ((await res.json()) as { names: { label: string }[] }).names.map((n) => n.label)
      expect(names).toContain('Public Mofongo')
      expect(names).not.toContain('Secret Tostones')
    })

    test('the poster sees both of their own', async () => {
      as(poster)
      const res = await send('GET', `/dishes/restaurant/${restaurantId}/names`)
      const names = ((await res.json()) as { names: { label: string }[] }).names.map((n) => n.label)
      expect(names).toContain('Secret Tostones')
    })
  })

  describe('reserved handles', () => {
    const body = (handle: string) => ({ name: 'Ana', handle, neighborhoodSlug: tag })

    test('a new handle that reads as Mesa or staff is refused like a taken one', async () => {
      as(ana)
      const res = await send('PATCH', '/me/profile', body('admin'))
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe('handle_taken')
    })

    test('someone who already holds one keeps it (an older app resends it on every save)', async () => {
      await db.update(schema.user).set({ handle: 'soporte' }).where(eq(schema.user.id, ben.id))
      as(ben)
      const res = await send('PATCH', '/me/profile', body('soporte'))
      expect(res.status).toBe(200)
    })
  })

  describe('living outside the sectors ("Otro")', () => {
    const readMe = async () =>
      (
        (await (await send('GET', '/me')).json()) as {
          profile: { neighborhood: { slug: string } | null; homeArea: string | null }
        }
      ).profile

    test('a homeArea saves without a sector, and a sector later replaces it', async () => {
      as(ana)
      const other = await send('PATCH', '/me/profile', {
        name: 'Ana',
        homeArea: 'Santo Domingo Este',
      })
      expect(other.status).toBe(200)
      let me = await readMe()
      expect(me.homeArea).toBe('Santo Domingo Este')
      expect(me.neighborhood).toBeNull()

      expect(
        (await send('PATCH', '/me/profile', { name: 'Ana', neighborhoodSlug: tag })).status,
      ).toBe(200)
      me = await readMe()
      expect(me.homeArea).toBeNull()
      expect(me.neighborhood?.slug).toBe(tag)
    })

    test('neither, both, or a one-letter place is refused', async () => {
      as(ana)
      for (const body of [
        { name: 'Ana' },
        { name: 'Ana', neighborhoodSlug: tag, homeArea: 'Santiago' },
        { name: 'Ana', homeArea: 'S' },
      ]) {
        expect((await send('PATCH', '/me/profile', body)).status).toBe(400)
      }
    })
  })

  describe('18 and older', () => {
    test('a birthday under 18 is refused; an adult one is saved', async () => {
      as(stranger)
      const year = new Date().getUTCFullYear()
      const minor = await send('PATCH', '/me/birthday', { birthday: `${year - 15}-06-15` })
      expect(minor.status).toBe(400)
      expect(((await minor.json()) as { error: string }).error).toBe('under_age')
      expect((await send('PATCH', '/me/birthday', { birthday: `${year - 30}-06-15` })).status).toBe(
        200,
      )
    })
  })

  describe('push throttles', () => {
    const row = (actorId: string, userId: string, at: string) =>
      ({ actorId, userId, createdAt: new Date(at) }) as Parameters<
        NonNullable<(typeof rules)['comment']['throttle']>
      >[0]
    const rules = notifyLib.KIND_RULES

    test('comments, mentions and plan invites share one push an hour per sender and recipient', () => {
      for (const kind of ['comment', 'mention', 'plan_invite'] as const) {
        const key = rules[kind].throttle
        expect(key).toBeDefined()
        const a = key?.(row('s1', 'r1', '2026-10-05T14:05:00Z'))
        // same pair, same hour → same key (the second push is dropped)
        expect(key?.(row('s1', 'r1', '2026-10-05T14:55:00Z'))).toBe(a)
        // another hour, another sender, or another recipient → a fresh push
        expect(key?.(row('s1', 'r1', '2026-10-05T15:05:00Z'))).not.toBe(a)
        expect(key?.(row('s2', 'r1', '2026-10-05T14:05:00Z'))).not.toBe(a)
        expect(key?.(row('s1', 'r2', '2026-10-05T14:05:00Z'))).not.toBe(a)
      }
    })
  })

  describe('ageOn', () => {
    test('counts whole years, and the birthday itself', () => {
      const now = new Date('2026-10-05T12:00:00Z')
      expect(meLib.ageOn('2008-10-05', now)).toBe(18)
      expect(meLib.ageOn('2008-10-06', now)).toBe(17)
      expect(meLib.ageOn('1990-01-01', now)).toBe(36)
    })
  })

  describe('share links', () => {
    test('/p/u/ is not case-sensitive, and caches for a minute', async () => {
      const res = await publicApp.request(`/p/u/${id('ana').toUpperCase()}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('max-age=60')
    })
  })
})
