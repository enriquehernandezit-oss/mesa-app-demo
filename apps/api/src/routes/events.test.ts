import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AuthedEnv } from '../context'

// Route-level checks for the parts of events.ts whose behavior lives in SQL
// (Save/unsave, savedByMe, /events/saved, the not-ended rule) — so they need
// a real Postgres. They run ONLY against a local database (DATABASE_URL on
// localhost/127.0.0.1) that answers, and skip otherwise: CI has no DB, and a
// test that writes fixture rows must never be pointed at production. Every
// row is created here with a unique run tag and removed in afterAll.

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

// Loaded only when enabled: importing @mesa/db (or the routes, which import
// it) throws without a DATABASE_URL, and bun still runs a skipped describe's
// body to collect its tests.
async function loadDeps() {
  const [{ db, schema }, { eventsRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('./events'),
  ])
  return { db, schema, eventsRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type EventRow = { id: string; savedByMe: boolean; myRsvp: string | null; venueConfirmed: boolean }

describe.skipIf(!deps)('events routes (local DB)', () => {
  if (!deps) return
  const { db, schema, eventsRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const now = Date.now()
  const hours = (h: number) => new Date(now + h * 3600_000)

  const me: Me = {
    id: `${tag}-user`,
    name: 'Events Test',
    email: `${tag}@example.test`,
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
    .route('/events', eventsRoutes)

  const ids: Record<
    'future' | 'inProgress' | 'inProgressNoEnd' | 'ended' | 'cancelled' | 'confirmed',
    string
  > = {
    future: crypto.randomUUID(),
    inProgress: crypto.randomUUID(),
    inProgressNoEnd: crypto.randomUUID(),
    ended: crypto.randomUUID(),
    cancelled: crypto.randomUUID(),
    confirmed: crypto.randomUUID(),
  }
  let neighborhoodId = ''
  let restaurantId = ''

  beforeAll(async () => {
    await db.insert(schema.user).values({ id: me.id, name: me.name, email: me.email })
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    if (!n) throw new Error('fixture neighborhood insert failed')
    neighborhoodId = n.id
    const [r] = await db
      .insert(schema.restaurants)
      .values({ name: tag, neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true })
      .returning({ id: schema.restaurants.id })
    if (!r) throw new Error('fixture restaurant insert failed')
    restaurantId = r.id
    const base = { restaurantId, title: tag }
    await db.insert(schema.events).values([
      { ...base, id: ids.future, slug: `${tag}-future`, startsAt: hours(24) },
      // Started an hour ago, ends in two — happening now.
      {
        ...base,
        id: ids.inProgress,
        slug: `${tag}-in-progress`,
        startsAt: hours(-1),
        endsAt: hours(2),
      },
      // No endsAt, started an hour ago — inside the assumed 3h.
      { ...base, id: ids.inProgressNoEnd, slug: `${tag}-in-progress-no-end`, startsAt: hours(-1) },
      // No endsAt, started 4h ago — past the assumed 3h, so over.
      { ...base, id: ids.ended, slug: `${tag}-ended`, startsAt: hours(-4) },
      {
        ...base,
        id: ids.cancelled,
        slug: `${tag}-cancelled`,
        startsAt: hours(24),
        cancelledAt: new Date(),
      },
      // Everything above relies on the default; this one exercises the true
      // branch explicitly, so a schema/importer regression that stops
      // writing the column can't hide behind "false" being the only value
      // ever observed.
      {
        ...base,
        id: ids.confirmed,
        slug: `${tag}-confirmed`,
        startsAt: hours(24),
        venueConfirmed: true,
      },
    ])
  })

  afterAll(async () => {
    // events cascade their saved_events/event_rsvps rows.
    await db.delete(schema.events).where(inArray(schema.events.id, Object.values(ids)))
    if (restaurantId)
      await db.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurantId))
    if (neighborhoodId)
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    await db.delete(schema.user).where(eq(schema.user.id, me.id))
  })

  const req = (method: string, path: string) => app.request(path, { method })
  const listIds = async (path: string) => {
    const body = (await (await req('GET', path)).json()) as { events: EventRow[] }
    return body.events
  }

  test('PUT/DELETE /:id/save are idempotent', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await req('PUT', `/events/${ids.future}/save`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ saved: true })
    }
    const rows = await db
      .select()
      .from(schema.savedEvents)
      .where(eq(schema.savedEvents.eventId, ids.future))
    expect(rows).toHaveLength(1)

    for (let i = 0; i < 2; i++) {
      const res = await req('DELETE', `/events/${ids.future}/save`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ saved: false })
    }
  })

  test('save 404s on a cancelled, missing, or non-uuid event', async () => {
    for (const id of [ids.cancelled, crypto.randomUUID(), 'not-a-uuid']) {
      const res = await req('PUT', `/events/${id}/save`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
  })

  test('savedByMe rides on list, restaurant rail, and detail — independent of RSVP', async () => {
    await req('PUT', `/events/${ids.future}/save`)
    await app.request(`/events/${ids.future}/rsvp`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'going' }),
    })

    for (const path of ['/events?when=upcoming', `/events/restaurant/${restaurantId}`]) {
      const events = await listIds(path)
      expect(events.find((e) => e.id === ids.future)).toMatchObject({
        savedByMe: true,
        myRsvp: 'going',
      })
      expect(events.find((e) => e.id === ids.inProgress)?.savedByMe).toBe(false)
    }
    const detail = (await (await req('GET', `/events/${ids.future}`)).json()) as {
      event: EventRow
    }
    expect(detail.event.savedByMe).toBe(true)

    await req('DELETE', `/events/${ids.future}/save`)
    await req('DELETE', `/events/${ids.future}/rsvp`)
  })

  test('in-progress events still appear in ?when=upcoming and the restaurant rail; ended ones do not', async () => {
    for (const path of ['/events?when=upcoming', `/events/restaurant/${restaurantId}`]) {
      const got = (await listIds(path)).map((e) => e.id)
      expect(got).toContain(ids.inProgress)
      expect(got).toContain(ids.inProgressNoEnd)
      expect(got).not.toContain(ids.ended)
      expect(got).not.toContain(ids.cancelled)
    }
  })

  test('GET /events/saved lists live saved events by startsAt, excluding ended and cancelled', async () => {
    // Save the cancelled one directly (the route would 404 it) to prove the
    // list filters it rather than relying on the PUT guard.
    for (const id of [ids.future, ids.inProgress, ids.ended]) {
      await req('PUT', `/events/${id}/save`)
    }
    await db.insert(schema.savedEvents).values({ eventId: ids.cancelled, userId: me.id })

    const res = await req('GET', '/events/saved')
    expect(res.status).toBe(200)
    const events = ((await res.json()) as { events: EventRow[] }).events
    expect(events.map((e) => e.id)).toEqual([ids.inProgress, ids.future])
    expect(events.every((e) => e.savedByMe)).toBe(true)
  })

  test('venueConfirmed defaults false and carries through on list and detail', async () => {
    const events = await listIds('/events?when=upcoming')
    expect(events.find((e) => e.id === ids.future)?.venueConfirmed).toBe(false)
    expect(events.find((e) => e.id === ids.confirmed)?.venueConfirmed).toBe(true)

    const detail = (await (await req('GET', `/events/${ids.confirmed}`)).json()) as {
      event: EventRow
    }
    expect(detail.event.venueConfirmed).toBe(true)
  })
})
