import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// F7: the moderator queue pages, two more things can be reported (a plan's note, a place) and
// removed, and a new report emails the moderators once per burst. Real Postgres, same local-only,
// tag-and-clean-up harness as privacyGaps.test.ts.

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
  const [{ db, schema }, { moderationRoutes }, alert] = await Promise.all([
    import('@mesa/db'),
    import('./moderation'),
    import('../lib/moderatorAlert'),
  ])
  return { db, schema, moderationRoutes, alert }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('moderator queue, plan and place reports, alerts (local DB)', () => {
  if (!deps) return
  const { db, schema, moderationRoutes, alert } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const id = (label: string) => `${tag}-${label}`
  const person = (label: string, extra: Partial<Me> = {}): Me => ({
    id: id(label),
    name: `Queue ${label}`,
    email: `${tag}-${label}@example.test`,
    emailVerified: false,
    eulaAcceptedAt: new Date(),
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  })
  const host = person('host')
  const guest = person('guest')
  const reporter = person('reporter')
  const moderator = person('moderator', { isModerator: true })
  const labels = ['host', 'guest', 'reporter', 'moderator'] as const

  let actor: Me = reporter
  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', actor)
      c.set('session', null)
      await next()
    })
    .route('/moderation', moderationRoutes)
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
  let placeId = ''
  let planId = ''
  const reportIds: string[] = []

  beforeAll(async () => {
    await db.insert(schema.user).values(
      labels.map((l) => ({
        id: id(l),
        name: `Queue ${l}`,
        email: `${tag}-${l}@example.test`,
        handle: `${tag}-${l}`,
        isModerator: l === 'moderator',
      })),
    )
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n?.id ?? ''
    const [r] = await db
      .insert(schema.restaurants)
      .values({
        name: `${tag}-place`,
        neighborhoodId,
        lat: 18.47,
        lng: -69.93,
        source: 'member',
      })
      .returning({ id: schema.restaurants.id })
    placeId = r?.id ?? ''
    const [plan] = await db
      .insert(schema.plans)
      .values({
        hostId: host.id,
        note: 'something nasty',
        startsAt: new Date(Date.now() + 86_400_000),
        status: 'confirmed',
        chosenRestaurantId: placeId,
      })
      .returning({ id: schema.plans.id })
    planId = plan?.id ?? ''
  })

  afterAll(async () => {
    await db.delete(schema.reports).where(like(schema.reports.reason, `${tag}%`))
    await db.delete(schema.plans).where(eq(schema.plans.id, planId))
    await db.delete(schema.restaurants).where(eq(schema.restaurants.id, placeId))
    await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    await db.delete(schema.user).where(inArray(schema.user.id, labels.map(id)))
  })

  describe('reporting a plan note and a place', () => {
    test('a guest can report the plan; its host cannot report their own', async () => {
      as(guest)
      const ok = await send('POST', '/moderation/reports', {
        targetType: 'plan',
        targetId: planId,
        reason: `${tag} plan`,
      })
      expect(ok.status).toBe(200)
      as(host)
      const own = await send('POST', '/moderation/reports', {
        targetType: 'plan',
        targetId: planId,
        reason: `${tag} own`,
      })
      expect(own.status).toBe(404)
    })

    test('a place can be reported; an unknown one cannot', async () => {
      as(reporter)
      expect(
        (
          await send('POST', '/moderation/reports', {
            targetType: 'place',
            targetId: placeId,
            reason: `${tag} place`,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await send('POST', '/moderation/reports', {
            targetType: 'place',
            targetId: crypto.randomUUID(),
            reason: `${tag} nope`,
          })
        ).status,
      ).toBe(404)
    })
  })

  describe('the queue', () => {
    type Page = {
      reports: {
        id: string
        targetType: string
        reason: string
        target: unknown
        alreadyHandled: boolean
      }[]
      nextCursor: string | null
      total: number
    }

    test('only a moderator can read it', async () => {
      as(reporter)
      expect((await send('GET', '/moderation/reports')).status).toBe(403)
    })

    test('plan and place reports arrive with their content attached', async () => {
      as(moderator)
      const page = (await (await send('GET', '/moderation/reports?limit=50')).json()) as Page
      const mine = page.reports.filter((r) => r.reason.startsWith(tag))
      const plan = mine.find((r) => r.targetType === 'plan')
      const place = mine.find((r) => r.targetType === 'place')
      expect(plan?.target).toEqual({ kind: 'plan', note: 'something nasty', hostId: host.id })
      expect(place?.target).toEqual({ kind: 'place', name: `${tag}-place`, source: 'member' })
      expect(page.total).toBeGreaterThanOrEqual(2)
    })

    test('pages walk every open report once, newest first, with no gaps or repeats', async () => {
      as(reporter)
      // Five more reports, filed together so some share an instant.
      const dishes = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const [row] = await db
            .insert(schema.reports)
            .values({
              reporterId: reporter.id,
              targetType: 'user',
              targetId: guest.id,
              reason: `${tag} bulk ${i}`,
            })
            .returning({ id: schema.reports.id })
          return row?.id ?? ''
        }),
      )
      reportIds.push(...dishes)

      as(moderator)
      const seen: string[] = []
      let cursor: string | null = null
      for (let guard = 0; guard < 400; guard++) {
        const res = await send(
          'GET',
          `/moderation/reports?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        )
        const page = (await res.json()) as Page
        seen.push(...page.reports.map((r) => r.id))
        cursor = page.nextCursor
        if (!cursor) break
      }
      expect(new Set(seen).size).toBe(seen.length)
      for (const rid of dishes) expect(seen).toContain(rid)
    })

    test('a malformed cursor is a 400, not a crash', async () => {
      as(moderator)
      expect((await send('GET', '/moderation/reports?cursor=nonsense')).status).toBe(400)
    })
  })

  describe('moderator actions', () => {
    test('clearing a plan note blanks it, keeps the plan, and closes the report', async () => {
      as(reporter)
      expect((await send('POST', `/moderation/plans/${planId}/clear-note`)).status).toBe(403)
      as(moderator)
      expect((await send('POST', `/moderation/plans/${planId}/clear-note`)).status).toBe(200)
      const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId))
      expect(plan?.note).toBeNull()
      expect(plan?.status).toBe('confirmed')
      const [rep] = await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.reason, `${tag} plan`))
      expect(rep?.status).toBe('actioned')
    })

    test('removing a place hides it and closes the report; the row stays', async () => {
      as(reporter)
      expect((await send('DELETE', `/moderation/places/${placeId}`)).status).toBe(403)
      as(moderator)
      expect((await send('DELETE', `/moderation/places/${placeId}`)).status).toBe(200)
      const [place] = await db
        .select()
        .from(schema.restaurants)
        .where(eq(schema.restaurants.id, placeId))
      expect(place?.removedAt).not.toBeNull()
      const [rep] = await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.reason, `${tag} place`))
      expect(rep?.status).toBe('actioned')
      // and it can no longer be reported
      as(guest)
      const again = await send('POST', '/moderation/reports', {
        targetType: 'place',
        targetId: placeId,
        reason: `${tag} again`,
      })
      expect(again.status).toBe(404)
    })
  })

  describe('moderator alert', () => {
    test('a report on a quiet queue emails the moderators', async () => {
      const sent: { to: string; subject: string }[] = []
      // quietMs 0: nothing counts as "recent", whatever else the dev database holds.
      const n = await alert.alertModerators(
        { id: crypto.randomUUID(), targetType: 'comment', reason: 'spam' },
        async (to, subject) => {
          sent.push({ to, subject })
        },
        0,
      )
      expect(n).toBeGreaterThanOrEqual(1)
      expect(sent.map((s) => s.to)).toContain(moderator.email)
      expect(sent[0]?.subject).toContain('reporte')
    })

    test('a second report inside the quiet window sends nothing more', async () => {
      const [first] = await db
        .insert(schema.reports)
        .values({
          reporterId: reporter.id,
          targetType: 'user',
          targetId: guest.id,
          reason: `${tag} burst`,
        })
        .returning({ id: schema.reports.id })
      if (first) reportIds.push(first.id)
      const sent: string[] = []
      const n = await alert.alertModerators(
        { id: crypto.randomUUID(), targetType: 'user', reason: 'again' },
        async (to) => {
          sent.push(to)
        },
      )
      expect(n).toBe(0)
      expect(sent).toHaveLength(0)
    })
  })
})
