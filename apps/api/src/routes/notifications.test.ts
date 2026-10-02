import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// The inbox (N1): notify()'s write rules, every trigger's row, and the routes behind the bell.
// Real Postgres, same local-only, tag-and-clean-up harness as events.test.ts /
// eventsGoing.test.ts (see events.test.ts's header for why it is gated this way). Push itself
// is never called (no EXPO_ACCESS_TOKEN in tests); what decides WHO would be pushed and WHAT it
// says is covered through buildEntries and pushMessagesFor.

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
    { cheersRoutes },
    { commentsRoutes },
    { meRoutes },
    { plansRoutes },
    { rankingsRoutes },
    { socialRoutes },
    { notificationsRoutes },
    { notifyNow, pushMessagesFor, settleNotify },
    { buildEntries },
    { sweepEventCancellations },
  ] = await Promise.all([
    import('@mesa/db'),
    import('./cheers'),
    import('./comments'),
    import('./me'),
    import('./plans'),
    import('./rankings'),
    import('./social'),
    import('./notifications'),
    import('../lib/notify'),
    import('../lib/push'),
    import('../lib/pushSweep'),
  ])
  return {
    db,
    schema,
    cheersRoutes,
    commentsRoutes,
    meRoutes,
    plansRoutes,
    rankingsRoutes,
    socialRoutes,
    notificationsRoutes,
    notifyNow,
    pushMessagesFor,
    settleNotify,
    buildEntries,
    sweepEventCancellations,
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Item = {
  id: string
  kind: string
  read: boolean
  actor: { id: string; name: string } | null
  restaurant: { id: string; name: string } | null
  dish: { id: string; name: string } | null
  event: { id: string; title: string } | null
  data: { excerpt?: string; label?: string; count?: number } | null
  followsBack: boolean
  followStatus: 'none' | 'following' | 'requested'
  others: number
}
type Page = { notifications: Item[]; nextBefore: string | null }

describe.skipIf(!deps)('notification inbox (local DB)', () => {
  if (!deps) return
  const {
    db,
    schema,
    cheersRoutes,
    commentsRoutes,
    meRoutes,
    plansRoutes,
    rankingsRoutes,
    socialRoutes,
    notificationsRoutes,
    notifyNow,
    pushMessagesFor,
    settleNotify,
    buildEntries,
    sweepEventCancellations,
  } = deps
  const { notifications } = schema

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
  const me = person('me')
  const ana = person('ana')
  const labels = ['ana', 'bo', 'cy', 'blocked', 'blocker', 'banned'] as const

  // Everything runs as somebody: one app per identity, every router mounted.
  const appAs = (who: Me) =>
    new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', who)
        c.set('session', null)
        await next()
      })
      .route('/cheers', cheersRoutes)
      .route('/comments', commentsRoutes)
      .route('/me', meRoutes)
      .route('/plans', plansRoutes)
      .route('/rankings', rankingsRoutes)
      .route('/social', socialRoutes)
      .route('/notifications', notificationsRoutes)
  const asMe = appAs(me)
  const post = (app: ReturnType<typeof appAs>, path: string, body?: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const inbox = async (qs = ''): Promise<Page> =>
    (await (await asMe.request(`/notifications/inbox${qs}`)).json()) as Page
  const unread = async (): Promise<number> =>
    ((await (await asMe.request('/notifications/unread')).json()) as { count: number }).count
  const rowsFor = (userId: string, kind?: string) =>
    db
      .select()
      .from(notifications)
      .where(
        kind
          ? and(eq(notifications.userId, userId), eq(notifications.kind, kind as 'follow'))
          : eq(notifications.userId, userId),
      )
  const rowsOf = (kind?: string) => rowsFor(me.id, kind)

  let neighborhoodId = ''
  let restaurantId = ''
  let rankingId = ''
  const events = {
    going: crypto.randomUUID(),
    cancelled: crypto.randomUUID(),
    old: crypto.randomUUID(),
  }
  const hours = (h: number) => new Date(Date.now() + h * 3600_000)

  beforeAll(async () => {
    await db.insert(schema.user).values([
      { id: me.id, name: me.name, email: me.email },
      ...labels.map((l) => ({
        id: uid(l),
        name: `Person ${l}`,
        email: `${tag}-${l}@example.test`,
        handle: uid(l),
        ...(l === 'banned' ? { bannedAt: new Date() } : {}),
      })),
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
    const [k] = await db
      .insert(schema.rankings)
      .values({ userId: me.id, restaurantId, position: 1, score: 90 })
      .returning({ id: schema.rankings.id })
    rankingId = k!.id
    await db.insert(schema.events).values([
      { id: events.going, restaurantId, title: tag, slug: `${tag}-going`, startsAt: hours(24) },
      {
        id: events.cancelled,
        restaurantId,
        title: tag,
        slug: `${tag}-cx`,
        startsAt: hours(24),
        cancelledAt: new Date(),
      },
      {
        id: events.old,
        restaurantId,
        title: tag,
        slug: `${tag}-old`,
        startsAt: hours(24),
        cancelledAt: new Date(Date.now() - 8 * 24 * 3600_000),
      },
    ])
    await db.insert(schema.eventRsvps).values(
      [events.cancelled, events.old].map((eventId) => ({
        eventId,
        userId: me.id,
        status: 'going' as const,
      })),
    )
  })

  beforeEach(async () => {
    await db.delete(notifications).where(eq(notifications.userId, me.id))
  })

  afterAll(async () => {
    await db.delete(schema.events).where(inArray(schema.events.id, Object.values(events)))
    await db.delete(schema.user).where(inArray(schema.user.id, [me.id, ...labels.map(uid)]))
    if (restaurantId)
      await db.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurantId))
    if (neighborhoodId)
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
  })

  describe('notify() write rules', () => {
    test('a repeat of the same event writes nothing, and only new rows are returned', async () => {
      const input = {
        userId: me.id,
        kind: 'follow' as const,
        dedupeKey: `follow:${uid('ana')}`,
        actorId: uid('ana'),
      }
      expect(await notifyNow([input])).toHaveLength(1)
      expect(await notifyNow([input])).toHaveLength(0)
      expect(await rowsOf()).toHaveLength(1)
    })

    test('the actor themselves, banned recipients and blocked pairs (either way) are skipped', async () => {
      await db.insert(schema.userBlocks).values([
        { blockerId: me.id, blockedId: uid('blocked') },
        { blockerId: uid('blocker'), blockedId: me.id },
      ])
      const written = await notifyNow([
        { userId: me.id, kind: 'follow', dedupeKey: 'k-self', actorId: me.id },
        { userId: uid('banned'), kind: 'follow', dedupeKey: 'k-banned', actorId: uid('ana') },
        { userId: me.id, kind: 'follow', dedupeKey: 'k-i-blocked', actorId: uid('blocked') },
        { userId: me.id, kind: 'follow', dedupeKey: 'k-blocked-me', actorId: uid('blocker') },
        { userId: me.id, kind: 'follow', dedupeKey: 'k-ok', actorId: uid('ana') },
      ])
      expect(written.map((w) => w.dedupeKey)).toEqual(['k-ok'])
      await db.delete(schema.userBlocks).where(eq(schema.userBlocks.blockedId, me.id))
      await db.delete(schema.userBlocks).where(eq(schema.userBlocks.blockerId, me.id))
    })
  })

  describe('triggers', () => {
    test('cheering writes one row, a repeat tap finds it, an un-cheer removes it', async () => {
      const cheer = () => appAs(ana).request(`/cheers/${rankingId}`, { method: 'POST' })
      await cheer()
      await settleNotify()
      const [row] = await rowsOf('cheers')
      expect(row?.actorId).toBe(ana.id)
      expect(row?.rankingId).toBe(rankingId)
      expect(row?.restaurantId).toBe(restaurantId)

      await cheer()
      await settleNotify()
      expect(await rowsOf('cheers')).toHaveLength(1)

      await appAs(ana).request(`/cheers/${rankingId}`, { method: 'DELETE' })
      expect(await rowsOf('cheers')).toHaveLength(0)
      await cheer()
      await settleNotify()
      expect(await rowsOf('cheers')).toHaveLength(1)
      await db.delete(schema.cheers).where(eq(schema.cheers.userId, ana.id))
    })

    test('cheering my own ranking notifies nobody', async () => {
      await appAs(me).request(`/cheers/${rankingId}`, { method: 'POST' })
      await settleNotify()
      expect(await rowsOf('cheers')).toHaveLength(0)
      await db.delete(schema.cheers).where(eq(schema.cheers.userId, me.id))
    })

    test('a comment writes a row with its excerpt, and deleting the comment removes it', async () => {
      const res = await post(appAs(ana), `/comments/ranking/${rankingId}`, {
        body: 'Qué buen lugar   \n para ir',
      })
      const { comment } = (await res.json()) as { comment: { id: string } }
      await settleNotify()
      const [row] = await rowsOf('comment')
      expect(row?.commentId).toBe(comment.id)
      expect(row?.data?.excerpt).toBe('Qué buen lugar para ir')

      await appAs(ana).request(`/comments/${comment.id}`, { method: 'DELETE' })
      expect(await rowsOf('comment')).toHaveLength(0)
    })

    test('a follow writes a row, and the inbox knows whether I follow back', async () => {
      await post(appAs(ana), '/social/follow', { userId: me.id })
      await settleNotify()
      const [row] = await rowsOf('follow')
      expect(row?.dedupeKey).toBe(`follow:${ana.id}`)
      expect((await inbox()).notifications[0]?.followsBack).toBe(false)

      expect((await inbox()).notifications[0]?.followStatus).toBe('none')

      // I asked to follow her (a private account): not following yet, but not "none" either
      await db.insert(schema.followRequests).values({ requesterId: me.id, targetId: ana.id })
      const asked = (await inbox()).notifications[0]
      expect(asked?.followsBack).toBe(false)
      expect(asked?.followStatus).toBe('requested')
      await db.delete(schema.followRequests).where(eq(schema.followRequests.requesterId, me.id))

      await db.insert(schema.follows).values({ followerId: me.id, followingId: ana.id })
      const following = (await inbox()).notifications[0]
      expect(following?.followsBack).toBe(true)
      expect(following?.followStatus).toBe('following')
      await db.delete(schema.follows).where(eq(schema.follows.followerId, me.id))
      await db.delete(schema.follows).where(eq(schema.follows.followerId, ana.id))
    })

    test('a plan invite reaches each invitee (later ones too), and a reply reaches the host once per answer', async () => {
      // ana hosts; me and bo follow her, so both can be invited.
      await db.insert(schema.follows).values([
        { followerId: me.id, followingId: ana.id },
        { followerId: uid('bo'), followingId: ana.id },
      ])
      const host = appAs(ana)
      const created = await post(host, '/plans', {
        restaurantIds: [restaurantId],
        startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
        inviteeIds: [me.id],
      })
      const { id: planId } = (await created.json()) as { id: string }
      await settleNotify()
      const [invite] = await rowsOf('plan_invite')
      expect(invite).toEqual(
        expect.objectContaining({
          dedupeKey: `plan_invite:${planId}`,
          actorId: ana.id,
          planId,
          restaurantId,
        }),
      )

      await post(host, `/plans/${planId}/invite`, { userIds: [uid('bo')] })
      await settleNotify()
      expect(await rowsFor(uid('bo'), 'plan_invite')).toHaveLength(1)

      const reply = (body: unknown) => post(asMe, `/plans/${planId}/reply`, body)
      await reply({ reply: 'going' })
      await reply({ reply: 'going' })
      await settleNotify()
      const replies = await rowsFor(ana.id, 'plan_reply')
      expect(replies).toHaveLength(1)
      expect(replies[0]?.data).toEqual({ reply: 'going', vote: false })
      expect(replies[0]?.restaurantId).toBe(restaurantId)

      await reply({ reply: 'declined' })
      await settleNotify()
      expect(await rowsFor(ana.id, 'plan_reply')).toHaveLength(2)

      await db.delete(schema.plans).where(eq(schema.plans.id, planId))
      await db.delete(schema.follows).where(eq(schema.follows.followingId, ana.id))
    })

    test('ranking a place notifies the followers who saved it, once per friend', async () => {
      const [r2] = await db
        .insert(schema.restaurants)
        .values({ name: `${tag}-two`, neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true })
        .returning({ id: schema.restaurants.id })
      const second = r2!.id
      await db.insert(schema.follows).values({ followerId: uid('bo'), followingId: me.id })
      await db.insert(schema.savedPlaces).values([
        { userId: uid('bo'), restaurantId: second },
        { userId: uid('cy'), restaurantId: second },
      ])
      await post(asMe, '/rankings', { restaurantId: second, position: 2 })
      await settleNotify()
      // bo follows me and saved it; cy saved it but doesn't follow me.
      const [saved] = await rowsFor(uid('bo'), 'saved_ranked')
      expect(saved).toEqual(
        expect.objectContaining({
          dedupeKey: `saved_ranked:${second}:${me.id}`,
          actorId: me.id,
          restaurantId: second,
        }),
      )
      expect(await rowsFor(uid('cy'), 'saved_ranked')).toHaveLength(0)

      await db.delete(schema.follows).where(eq(schema.follows.followingId, me.id))
      await db.delete(schema.restaurants).where(eq(schema.restaurants.id, second))
    })

    test('a dish nudge carries its list, label and count into the inbox and the push', async () => {
      const [list] = await db
        .insert(schema.dishLists)
        .values({ userId: me.id, nameKey: `${tag}-pizza`, label: 'pizza' })
        .returning({ id: schema.dishLists.id })
      const [row] = await notifyNow([
        {
          userId: me.id,
          kind: 'dish_nudge',
          dedupeKey: `dish_nudge:${list!.id}:4`,
          dishListId: list!.id,
          data: { label: 'pizza', count: 4 },
        },
      ])
      const [item] = (await inbox()).notifications
      expect(item?.kind).toBe('dish_nudge')
      expect(item?.actor).toBeNull()
      expect(item?.data).toEqual({ label: 'pizza', count: 4 })
      const [message] = await pushMessagesFor(row ? [row] : [])
      expect(message?.category).toBe('dishes')
      expect(message?.data).toEqual({ type: 'dish-list', listId: list!.id })
      expect(message?.copy('es').body).toBe('Has comido pizza en 4 lugares. ¿Cuál fue el mejor?')

      await db.delete(schema.dishLists).where(eq(schema.dishLists.id, list!.id))
      expect(await rowsOf('dish_nudge')).toHaveLength(0)
    })

    test('a cancelled event is announced once to those going, however often the sweep runs; an old cancellation is left alone', async () => {
      await sweepEventCancellations()
      await sweepEventCancellations()
      const rows = await rowsOf('event_cancelled')
      expect(rows.map((r) => r.eventId)).toEqual([events.cancelled])
      expect(rows[0]?.restaurantId).toBe(restaurantId)
    })
  })

  describe('friend signals', () => {
    const place = async (name: string) => {
      const [r] = await db
        .insert(schema.restaurants)
        .values({ name: `${tag}-${name}`, neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true })
        .returning({ id: schema.restaurants.id })
      return r!.id
    }
    const cleanup = async (placeIds: string[]) => {
      await db.delete(schema.follows).where(inArray(schema.follows.followerId, labels.map(uid)))
      await db.delete(schema.follows).where(eq(schema.follows.followerId, me.id))
      await db.delete(schema.rankings).where(inArray(schema.rankings.restaurantId, placeIds))
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, placeIds))
      await db.delete(notifications).where(inArray(notifications.userId, labels.map(uid)))
    }
    const love = (userId: string, id: string, score = 85) => ({
      userId,
      restaurantId: id,
      position: 1,
      score,
    })

    test('a place three of the people I follow love tells the people who follow me, once', async () => {
      const loved = await place('loved')
      // bo follows me, ana and cy; ana and cy rank it 8.5 — and then I do.
      await db.insert(schema.follows).values([
        { followerId: uid('bo'), followingId: me.id },
        { followerId: uid('bo'), followingId: uid('ana') },
        { followerId: uid('bo'), followingId: uid('cy') },
      ])
      await db.insert(schema.rankings).values([love(uid('ana'), loved), love(uid('cy'), loved)])
      await post(asMe, '/rankings', { restaurantId: loved, position: 1 })
      await settleNotify()

      const rows = await rowsFor(uid('bo'), 'friends_love')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toEqual(
        expect.objectContaining({
          dedupeKey: `friends_love:${loved}`,
          restaurantId: loved,
          actorId: null,
          data: { count: 3, went: false },
        }),
      )
      // ranking it again (or any later ranking) never tells bo twice
      await post(asMe, '/rankings', { restaurantId: loved, position: 1 })
      await settleNotify()
      expect(await rowsFor(uid('bo'), 'friends_love')).toHaveLength(1)
      await cleanup([loved])
    })

    test('two friends is not enough, a banned one does not count, and I am not told about my own place', async () => {
      const two = await place('two')
      await db.insert(schema.follows).values([
        { followerId: uid('bo'), followingId: me.id },
        { followerId: uid('bo'), followingId: uid('ana') },
        { followerId: uid('bo'), followingId: uid('banned') },
      ])
      await db.insert(schema.rankings).values([love(uid('ana'), two), love(uid('banned'), two)])
      await post(asMe, '/rankings', { restaurantId: two, position: 1 })
      await settleNotify()
      // me + ana + banned = three rows, but the banned one is not a friend worth counting
      expect(await rowsFor(uid('bo'), 'friends_love')).toHaveLength(0)
      expect(await rowsFor(me.id, 'friends_love')).toHaveLength(0)
      await cleanup([two])
    })

    test('someone who has been there is told in the "been" words', async () => {
      const been = await place('been')
      await db.insert(schema.follows).values([
        { followerId: uid('bo'), followingId: me.id },
        { followerId: uid('bo'), followingId: uid('ana') },
        { followerId: uid('bo'), followingId: uid('cy') },
      ])
      await db
        .insert(schema.rankings)
        .values([love(uid('ana'), been), love(uid('cy'), been), love(uid('bo'), been, 60)])
      await post(asMe, '/rankings', { restaurantId: been, position: 1 })
      await settleNotify()
      const [row] = await rowsFor(uid('bo'), 'friends_love')
      expect(row?.data).toEqual({ count: 3, went: true })
      await cleanup([been])
    })

    test('a taste match crossing 90 tells both people of a mutual follow, once — never a one-way follow', async () => {
      // I rank eight places; ana ranks the same eight with my exact scores.
      const ids: string[] = []
      for (let i = 0; i < 8; i++) {
        const id = await place(`m${i}`)
        ids.push(id)
        await post(asMe, '/rankings', { restaurantId: id, position: 1 })
      }
      await settleNotify()
      await db.delete(notifications).where(eq(notifications.userId, me.id))
      const mine = await db
        .select({
          restaurantId: schema.rankings.restaurantId,
          position: schema.rankings.position,
          score: schema.rankings.score,
        })
        .from(schema.rankings)
        .where(and(eq(schema.rankings.userId, me.id), inArray(schema.rankings.restaurantId, ids)))
      await db.insert(schema.rankings).values(
        mine.map((m, i) => ({
          userId: uid('ana'),
          restaurantId: m.restaurantId,
          position: i + 1,
          score: m.score,
        })),
      )
      // re-rank the top place where it already is: the order, and so every score, is unchanged
      const top = mine.find((m) => m.position === Math.min(...mine.map((x) => x.position)))!
      const rerank = async () => {
        await post(asMe, '/rankings', { restaurantId: top.restaurantId, position: top.position })
        await settleNotify()
      }

      // I follow ana, ana does not follow me: nothing, for either of us
      await db.insert(schema.follows).values({ followerId: me.id, followingId: uid('ana') })
      await rerank()
      expect(await rowsOf('taste_match')).toHaveLength(0)
      expect(await rowsFor(uid('ana'), 'taste_match')).toHaveLength(0)

      // ana follows back: each is told about the other
      await db.insert(schema.follows).values({ followerId: uid('ana'), followingId: me.id })
      await rerank()
      const [mineRow] = await rowsOf('taste_match')
      expect(mineRow).toEqual(
        expect.objectContaining({ dedupeKey: `taste_match:${uid('ana')}`, actorId: uid('ana') }),
      )
      expect(mineRow?.data?.percent).toBeGreaterThanOrEqual(90)
      const [anaRow] = await rowsFor(uid('ana'), 'taste_match')
      expect(anaRow).toEqual(
        expect.objectContaining({ dedupeKey: `taste_match:${me.id}`, actorId: me.id }),
      )

      // a repeat tells nobody again
      await rerank()
      expect(await rowsOf('taste_match')).toHaveLength(1)
      expect(await rowsFor(uid('ana'), 'taste_match')).toHaveLength(1)
      await cleanup(ids)
    })
  })

  describe('the inbox', () => {
    test('reads newest first with the actor, place and event attached', async () => {
      await notifyNow([
        { userId: me.id, kind: 'cheers', dedupeKey: 'a', actorId: ana.id, rankingId, restaurantId },
      ])
      // created_at has millisecond precision; two rows landing in the same one fall back to the
      // id tie-break, which is random — so make "newest" unambiguous.
      await new Promise((r) => setTimeout(r, 5))
      await notifyNow([
        {
          userId: me.id,
          kind: 'event_cancelled',
          dedupeKey: 'b',
          eventId: events.going,
          restaurantId,
        },
      ])
      const { notifications: items, nextBefore } = await inbox()
      expect(nextBefore).toBeNull()
      expect(items.map((i) => i.kind)).toEqual(['event_cancelled', 'cheers'])
      expect(items[0]?.actor).toBeNull()
      expect(items[0]?.event?.title).toBe(tag)
      expect(items[1]?.actor).toEqual(expect.objectContaining({ id: ana.id, name: 'Person ana' }))
      expect(items[1]?.restaurant?.name).toBe(tag)
      expect(items.every((i) => i.read === false)).toBe(true)
    })

    test('pages 30 at a time without skipping rows that share a millisecond', async () => {
      const base = Date.now() - 3600_000
      // 35 rows in 5 groups of 7 sharing a timestamp, so the page boundary falls inside a tie.
      await db.insert(notifications).values(
        Array.from({ length: 35 }, (_, i) => ({
          userId: me.id,
          kind: 'follow' as const,
          dedupeKey: `bulk-${i}`,
          actorId: ana.id,
          createdAt: new Date(base + Math.floor(i / 7) * 1000),
        })),
      )
      const first = await inbox()
      expect(first.notifications).toHaveLength(30)
      expect(first.nextBefore).not.toBeNull()
      const second = await inbox(`?before=${encodeURIComponent(first.nextBefore ?? '')}`)
      expect(second.notifications).toHaveLength(5)
      expect(second.nextBefore).toBeNull()
      const ids = [...first.notifications, ...second.notifications].map((i) => i.id)
      expect(new Set(ids).size).toBe(35)
    })

    test('a malformed cursor is a 400', async () => {
      expect((await asMe.request('/notifications/inbox?before=nope')).status).toBe(400)
    })

    test('a block made after the row was written hides it, from the list and the badge', async () => {
      await notifyNow([
        { userId: me.id, kind: 'follow', dedupeKey: 'f-ana', actorId: ana.id },
        { userId: me.id, kind: 'follow', dedupeKey: 'f-bo', actorId: uid('bo') },
      ])
      expect((await inbox()).notifications).toHaveLength(2)
      expect(await unread()).toBe(2)

      await db.insert(schema.userBlocks).values({ blockerId: me.id, blockedId: ana.id })
      const after = await inbox()
      expect(after.notifications.map((i) => i.actor?.id)).toEqual([uid('bo')])
      expect(await unread()).toBe(1)
      await db.delete(schema.userBlocks).where(eq(schema.userBlocks.blockerId, me.id))
    })

    test('friends going to one event are ONE row with the count of the others, even when the newest is blocked', async () => {
      for (const who of ['ana', 'bo', 'cy']) {
        await notifyNow([
          {
            userId: me.id,
            kind: 'event_going',
            dedupeKey: `event_going:${events.going}:${uid(who)}`,
            actorId: uid(who),
            eventId: events.going,
            restaurantId,
          },
        ])
        // Distinct createdAt so "newest" is unambiguous.
        await Bun.sleep(5)
      }
      const page = await inbox()
      expect(page.notifications).toHaveLength(1)
      expect(page.notifications[0]?.actor?.id).toBe(uid('cy'))
      expect(page.notifications[0]?.others).toBe(2)
      expect(await unread()).toBe(1)

      await db.insert(schema.userBlocks).values({ blockerId: me.id, blockedId: uid('cy') })
      const blocked = await inbox()
      expect(blocked.notifications).toHaveLength(1)
      expect(blocked.notifications[0]?.actor?.id).toBe(uid('bo'))
      expect(blocked.notifications[0]?.others).toBe(1)
      await db.delete(schema.userBlocks).where(eq(schema.userBlocks.blockerId, me.id))
    })

    test('a removed comment or dish takes its row out of the inbox', async () => {
      const [comment] = await db
        .insert(schema.rankingComments)
        .values({ rankingId, userId: ana.id, body: 'hola' })
        .returning({ id: schema.rankingComments.id })
      const [dish] = await db
        .insert(schema.dishes)
        .values({ userId: me.id, rankingId, restaurantId, name: 'Pizza' })
        .returning({ id: schema.dishes.id })
      await notifyNow([
        {
          userId: me.id,
          kind: 'comment',
          dedupeKey: 'c1',
          actorId: ana.id,
          commentId: comment!.id,
          rankingId,
          restaurantId,
        },
        { userId: me.id, kind: 'dish_cheer', dedupeKey: 'd1', actorId: ana.id, dishId: dish!.id },
      ])
      const before = await inbox()
      expect(before.notifications).toHaveLength(2)
      expect(before.notifications.find((i) => i.kind === 'dish_cheer')?.dish?.name).toBe('Pizza')

      await db
        .update(schema.rankingComments)
        .set({ removedAt: new Date() })
        .where(eq(schema.rankingComments.id, comment!.id))
      await db
        .update(schema.dishes)
        .set({ removedAt: new Date() })
        .where(eq(schema.dishes.id, dish!.id))
      expect((await inbox()).notifications).toHaveLength(0)
      expect(await unread()).toBe(0)
      await db.delete(schema.dishes).where(eq(schema.dishes.id, dish!.id))
      await db.delete(schema.rankingComments).where(eq(schema.rankingComments.id, comment!.id))
    })
  })

  describe('language', () => {
    test('PATCH /me/locale stores the language pushes are written in', async () => {
      const patch = (body: unknown) =>
        asMe.request('/me/locale', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      const stored = async () =>
        (
          await db.query.user.findFirst({
            where: eq(schema.user.id, me.id),
            columns: { locale: true },
          })
        )?.locale
      expect(await stored()).toBe('es')
      expect((await patch({ locale: 'en' })).status).toBe(200)
      expect(await stored()).toBe('en')
      expect((await patch({ locale: 'fr' })).status).toBe(400)
      expect(await stored()).toBe('en')
      await patch({ locale: 'es' })
    })
  })

  describe('read state', () => {
    test('marks read up to a moment, leaving newer rows unread', async () => {
      const at = (s: number) => new Date(Date.now() - 3600_000 + s * 1000)
      await db.insert(notifications).values(
        [1, 2, 3].map((s) => ({
          userId: me.id,
          kind: 'follow' as const,
          dedupeKey: `r-${s}`,
          actorId: ana.id,
          createdAt: at(s),
        })),
      )
      expect(await unread()).toBe(3)

      await post(asMe, '/notifications/read', { before: at(2).toISOString() })
      expect(await unread()).toBe(1)
      const items = (await inbox()).notifications
      expect(items.map((i) => i.read)).toEqual([false, true, true])

      await post(asMe, '/notifications/read')
      expect(await unread()).toBe(0)
    })

    test('rejects a malformed timestamp', async () => {
      expect((await post(asMe, '/notifications/read', { before: 'yesterday' })).status).toBe(400)
    })
  })

  describe('push', () => {
    test('a row becomes a message that names the actor and place in either language', async () => {
      const [row] = await notifyNow([
        {
          userId: me.id,
          kind: 'cheers',
          dedupeKey: 'p1',
          actorId: ana.id,
          rankingId,
          restaurantId,
        },
      ])
      const [message] = await pushMessagesFor(row ? [row] : [])
      expect(message?.category).toBe('social')
      expect(message?.data).toEqual({ type: 'restaurant', restaurantId })
      expect(message?.key).toMatch(new RegExp(`^cheers:${rankingId}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`))
      expect(message?.copy('es').body).toBe(`Person ana le dio cheers a tu ranking de ${tag}`)
      expect(message?.copy('en').body).toBe(`Person ana cheered your ranking of ${tag}`)
    })

    describe('who is pushed', () => {
      const message = (userId: string, key?: string, category: 'social' | 'plans' = 'social') => ({
        userId,
        key,
        category,
        copy: (locale: 'es' | 'en') => ({ title: 'Mesa', body: locale }),
      })

      beforeAll(async () => {
        await db.insert(schema.pushTokens).values([
          { token: `${tag}-tok-me`, userId: me.id },
          { token: `${tag}-tok-banned`, userId: uid('banned') },
        ])
      })
      beforeEach(async () => {
        await db.delete(schema.notificationPrefs).where(eq(schema.notificationPrefs.userId, me.id))
        await db.update(schema.user).set({ locale: 'es' }).where(eq(schema.user.id, me.id))
      })

      test('one entry per phone, in the owner’s language', async () => {
        expect(await buildEntries([message(me.id)])).toEqual([
          { token: `${tag}-tok-me`, title: 'Mesa', body: 'es', data: undefined },
        ])
        await db.update(schema.user).set({ locale: 'en' }).where(eq(schema.user.id, me.id))
        expect((await buildEntries([message(me.id)]))[0]?.body).toBe('en')
      })

      test('a switched-off category is skipped without using up its throttle slot', async () => {
        await db.insert(schema.notificationPrefs).values({ userId: me.id, social: false })
        expect(await buildEntries([message(me.id, `${tag}-off`)])).toHaveLength(0)
        // Switch it back on: the same key still goes out, because the off-time attempt never
        // claimed it.
        await db
          .update(schema.notificationPrefs)
          .set({ social: true })
          .where(eq(schema.notificationPrefs.userId, me.id))
        expect(await buildEntries([message(me.id, `${tag}-off`)])).toHaveLength(1)
        // Other categories are unaffected by it.
        await db
          .update(schema.notificationPrefs)
          .set({ social: false })
          .where(eq(schema.notificationPrefs.userId, me.id))
        expect(await buildEntries([message(me.id, undefined, 'plans')])).toHaveLength(1)
      })

      test('a throttle key sends once, including twice inside one batch', async () => {
        const key = `${tag}-throttle`
        expect(await buildEntries([message(me.id, key), message(me.id, key)])).toHaveLength(1)
        expect(await buildEntries([message(me.id, key)])).toHaveLength(0)
      })

      test('a banned member is never pushed', async () => {
        expect(await buildEntries([message(uid('banned'))])).toHaveLength(0)
      })
    })
  })
})
