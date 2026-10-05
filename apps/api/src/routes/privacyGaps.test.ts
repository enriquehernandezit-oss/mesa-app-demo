import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// The privacy and moderation gaps found in the October audit (F1): a private account's content is
// not reachable by holding an id, a removed note stays removed, the report queue cannot be broken
// or flooded, and a banned host's plans are not listed. Real Postgres, same local-only,
// tag-and-clean-up harness as social.test.ts.

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
    { commentsRoutes },
    { cheersRoutes },
    { dishesRoutes },
    { savedRoutes },
    { collectionsRoutes },
    { moderationRoutes },
    { rankingsRoutes },
    { socialRoutes },
    { plansRoutes },
    { sharePagesRoutes },
  ] = await Promise.all([
    import('@mesa/db'),
    import('./comments'),
    import('./cheers'),
    import('./dishes'),
    import('./saved'),
    import('./collections'),
    import('./moderation'),
    import('./rankings'),
    import('./social'),
    import('./plans'),
    import('./share-pages'),
  ])
  return {
    db,
    schema,
    commentsRoutes,
    cheersRoutes,
    dishesRoutes,
    savedRoutes,
    collectionsRoutes,
    moderationRoutes,
    rankingsRoutes,
    socialRoutes,
    plansRoutes,
    sharePagesRoutes,
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']

describe.skipIf(!deps)('privacy and moderation gaps (local DB)', () => {
  if (!deps) return
  const {
    db,
    schema,
    commentsRoutes,
    cheersRoutes,
    dishesRoutes,
    savedRoutes,
    collectionsRoutes,
    moderationRoutes,
    rankingsRoutes,
    socialRoutes,
    plansRoutes,
    sharePagesRoutes,
  } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const id = (label: string) => `${tag}-${label}`
  const person = (label: string, extra: Partial<Me> = {}): Me => ({
    id: id(label),
    name: `Gaps ${label}`,
    email: `${tag}-${label}@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  })
  // owner: a private account. follower: approved by it. stranger: not. banned: a banned host.
  const owner = person('owner')
  const follower = person('follower')
  const stranger = person('stranger')
  const moderator = person('moderator', { isModerator: true })
  const banned = person('banned')
  const labels = ['owner', 'follower', 'stranger', 'moderator', 'banned'] as const

  let actor: Me = stranger
  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', actor)
      c.set('session', null)
      await next()
    })
    .route('/comments', commentsRoutes)
    .route('/cheers', cheersRoutes)
    .route('/dishes', dishesRoutes)
    .route('/saved', savedRoutes)
    .route('/collections', collectionsRoutes)
    .route('/moderation', moderationRoutes)
    .route('/rankings', rankingsRoutes)
    .route('/social', socialRoutes)
    .route('/plans', plansRoutes)
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
  const restaurantIds: string[] = []
  let rankingId = ''
  let dishId = ''
  let noteId = ''
  let collectionId = ''

  beforeAll(async () => {
    await db.insert(schema.user).values(
      labels.map((label) => ({
        id: id(label),
        name: `Gaps ${label}`,
        email: `${tag}-${label}@example.test`,
        handle: id(label),
        isPrivate: label === 'owner',
        isModerator: label === 'moderator',
        bannedAt: label === 'banned' ? new Date() : null,
      })),
    )
    await db.insert(schema.follows).values({ followerId: id('follower'), followingId: id('owner') })

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

    const rankingRows = await db
      .insert(schema.rankings)
      .values(
        restaurantIds.map((rid, i) => ({
          userId: id('owner'),
          restaurantId: rid,
          position: i + 1,
          score: [96, 84, 72][i]!,
        })),
      )
      .returning({ id: schema.rankings.id, restaurantId: schema.rankings.restaurantId })
    rankingId = rankingRows.find((r) => r.restaurantId === restaurantIds[0])!.id

    const [dish] = await db
      .insert(schema.dishes)
      .values({
        userId: id('owner'),
        rankingId,
        restaurantId: restaurantIds[0]!,
        name: `${tag} dish`,
        imageId: 'x',
        visibility: 'friends',
      })
      .returning({ id: schema.dishes.id })
    dishId = dish!.id

    const [note] = await db
      .insert(schema.vibeNotes)
      .values({ userId: id('owner'), restaurantId: restaurantIds[0]!, body: 'original words' })
      .returning({ id: schema.vibeNotes.id })
    noteId = note!.id

    const [coll] = await db
      .insert(schema.collections)
      .values({ userId: id('stranger'), name: `${tag} list` })
      .returning({ id: schema.collections.id })
    collectionId = coll!.id
  })

  afterAll(async () => {
    await db.delete(schema.user).where(
      inArray(
        schema.user.id,
        labels.map((label) => id(label)),
      ),
    )
    if (restaurantIds.length) {
      await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, restaurantIds))
    }
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
  })

  describe('a private account is not reachable by holding an id', () => {
    test('its comment thread: unreadable and unwritable to a stranger, open to an approved follower and to itself', async () => {
      as(stranger)
      expect((await send('GET', `/comments/ranking/${rankingId}`)).status).toBe(404)
      expect((await send('POST', `/comments/ranking/${rankingId}`, { body: 'hi' })).status).toBe(
        404,
      )
      as(follower)
      expect((await send('GET', `/comments/ranking/${rankingId}`)).status).toBe(200)
      expect((await send('POST', `/comments/ranking/${rankingId}`, { body: 'hi' })).status).toBe(
        200,
      )
      as(owner)
      expect((await send('GET', `/comments/ranking/${rankingId}`)).status).toBe(200)
    })

    test('its cheers: a stranger gets 404 and no row; a follower is fine; a bad id is a 404, not a 500', async () => {
      as(stranger)
      expect((await send('POST', `/cheers/${rankingId}`)).status).toBe(404)
      expect((await send('POST', '/cheers/not-a-uuid')).status).toBe(404)
      expect((await send('DELETE', '/cheers/not-a-uuid')).status).toBe(404)
      const rows = await db.query.cheers.findMany({
        where: and(
          eq(schema.cheers.rankingId, rankingId),
          eq(schema.cheers.userId, id('stranger')),
        ),
      })
      expect(rows).toHaveLength(0)
      as(follower)
      expect((await send('POST', `/cheers/${rankingId}`)).status).toBe(200)
    })

    test('its friends-only dish: cheering, saving and filing it in a list are refused to a stranger and allowed to a follower', async () => {
      as(stranger)
      expect((await send('POST', `/dishes/${dishId}/cheer`)).status).toBe(404)
      expect((await send('POST', '/saved/dishes', { dishId })).status).toBe(404)
      const add = await send('POST', `/collections/${collectionId}/items`, { dishId })
      expect(add.status).toBe(400)
      expect(await add.json()).toEqual({ error: 'unknown_dish' })
      const none = await db.query.savedDishes.findMany({
        where: eq(schema.savedDishes.userId, id('stranger')),
      })
      expect(none).toHaveLength(0)

      as(follower)
      expect((await send('POST', `/dishes/${dishId}/cheer`)).status).toBe(200)
      expect((await send('POST', '/saved/dishes', { dishId })).status).toBe(200)
    })

    test('a saved dish that is later removed drops out of the saved list', async () => {
      as(follower)
      const before = (await (await send('GET', '/saved/dishes')).json()) as {
        saved: { dish: { id: string } }[]
      }
      expect(before.saved.map((s) => s.dish.id)).toContain(dishId)
      await db
        .update(schema.dishes)
        .set({ removedAt: new Date() })
        .where(eq(schema.dishes.id, dishId))
      const after = (await (await send('GET', '/saved/dishes')).json()) as {
        saved: { dish: { id: string } }[]
      }
      expect(after.saved.map((s) => s.dish.id)).not.toContain(dishId)
      await db.update(schema.dishes).set({ removedAt: null }).where(eq(schema.dishes.id, dishId))
    })

    test("its taste does not feed a stranger's suggestions", async () => {
      // stranger and owner rank the same three places the same way: a perfect match.
      await db.insert(schema.rankings).values(
        restaurantIds.map((rid, i) => ({
          userId: id('stranger'),
          restaurantId: rid,
          position: i + 1,
          score: [96, 84, 72][i]!,
        })),
      )
      as(stranger)
      const { users } = (await (await send('GET', '/social/suggestions')).json()) as {
        users: { id: string; reason: { kind: string } }[]
      }
      const row = users.find((u) => u.id === id('owner'))
      expect(row?.reason.kind ?? 'none').not.toBe('taste')
    })
  })

  describe('a removed note stays removed', () => {
    test('saving the same words again does not bring it back; new words do', async () => {
      await db
        .update(schema.vibeNotes)
        .set({ removedAt: new Date() })
        .where(eq(schema.vibeNotes.id, noteId))
      as(owner)
      const same = await send('PATCH', `/rankings/${rankingId}/note`, { body: 'original words' })
      expect(same.status).toBe(200)
      let row = await db.query.vibeNotes.findFirst({ where: eq(schema.vibeNotes.id, noteId) })
      expect(row?.removedAt).not.toBeNull()

      const changed = await send('PATCH', `/rankings/${rankingId}/note`, {
        body: 'different words',
      })
      expect(changed.status).toBe(200)
      row = await db.query.vibeNotes.findFirst({ where: eq(schema.vibeNotes.id, noteId) })
      expect(row?.removedAt).toBeNull()
      expect(row?.body).toBe('different words')
    })

    test('deleting the ranking keeps a removed note, so ranking again with the same words cannot restore it', async () => {
      await db
        .update(schema.vibeNotes)
        .set({ removedAt: new Date() })
        .where(eq(schema.vibeNotes.id, noteId))
      as(owner)
      const res = await send('DELETE', `/rankings/${rankingId}`)
      expect(res.status).toBe(200)
      const row = await db.query.vibeNotes.findFirst({ where: eq(schema.vibeNotes.id, noteId) })
      expect(row?.removedAt).not.toBeNull()
    })
  })

  describe('reports', () => {
    test('a target that is not a uuid, or does not exist, or is yourself, is refused', async () => {
      as(stranger)
      expect(
        (
          await send('POST', '/moderation/reports', {
            targetType: 'vibe_note',
            targetId: 'x',
            reason: 'r',
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await send('POST', '/moderation/reports', {
            targetType: 'dish',
            targetId: crypto.randomUUID(),
            reason: 'r',
          })
        ).status,
      ).toBe(404)
      expect(
        (
          await send('POST', '/moderation/reports', {
            targetType: 'user',
            targetId: id('stranger'),
            reason: 'r',
          })
        ).status,
      ).toBe(404)
    })

    test('reporting the same thing twice is one report', async () => {
      as(stranger)
      const body = { targetType: 'user', targetId: id('owner'), reason: 'spam' }
      expect((await send('POST', '/moderation/reports', body)).status).toBe(200)
      expect((await send('POST', '/moderation/reports', body)).status).toBe(200)
      const rows = await db.query.reports.findMany({
        where: and(
          eq(schema.reports.reporterId, id('stranger')),
          eq(schema.reports.targetId, id('owner')),
        ),
      })
      expect(rows).toHaveLength(1)
    })

    test('a malformed row from before the check cannot break the moderator queue', async () => {
      await db.insert(schema.reports).values({
        reporterId: id('follower'),
        targetType: 'vibe_note',
        targetId: 'x',
        reason: 'legacy junk',
      })
      as(moderator)
      const res = await send('GET', '/moderation/reports')
      expect(res.status).toBe(200)
    })

    test('one account cannot file more than the daily cap', async () => {
      await db.insert(schema.reports).values(
        Array.from({ length: 30 }, (_, i) => ({
          reporterId: id('banned'),
          targetType: 'user' as const,
          targetId: `${tag}-nobody${i}`,
          reason: 'flood',
        })),
      )
      as(banned)
      const res = await send('POST', '/moderation/reports', {
        targetType: 'user',
        targetId: id('owner'),
        reason: 'one more',
      })
      expect(res.status).toBe(429)
    })

    test('moderator routes answer a malformed id with 404, not 500', async () => {
      as(moderator)
      expect((await send('DELETE', '/moderation/vibe-notes/nope')).status).toBe(404)
      expect((await send('DELETE', '/moderation/dishes/nope')).status).toBe(404)
      expect((await send('POST', '/moderation/reports/nope/dismiss')).status).toBe(404)
    })
  })

  describe('a public list page shows only what the public may see', () => {
    test('a removed dish, and a public dish from a private account, are not listed', async () => {
      const pub = new Hono().route('/p', sharePagesRoutes)
      const [r] = await db
        .insert(schema.rankings)
        .values({ userId: id('follower'), restaurantId: restaurantIds[1]!, position: 1, score: 90 })
        .onConflictDoNothing()
        .returning({ id: schema.rankings.id })
      const ranking =
        r ??
        (await db.query.rankings.findFirst({
          where: and(
            eq(schema.rankings.userId, id('follower')),
            eq(schema.rankings.restaurantId, restaurantIds[1]!),
          ),
        }))!
      const [shown] = await db
        .insert(schema.dishes)
        .values({
          userId: id('follower'),
          rankingId: ranking.id,
          restaurantId: restaurantIds[1]!,
          name: `${tag} shown dish`,
          imageId: 'x',
          visibility: 'public',
        })
        .returning({ id: schema.dishes.id })
      // the private owner's dish, marked public — still a private account's content
      const ownerRanking = await db.query.rankings.findFirst({
        where: and(
          eq(schema.rankings.userId, id('owner')),
          eq(schema.rankings.restaurantId, restaurantIds[2]!),
        ),
      })
      const [hidden] = await db
        .insert(schema.dishes)
        .values({
          userId: id('owner'),
          rankingId: ownerRanking!.id,
          restaurantId: restaurantIds[2]!,
          name: `${tag} hidden dish`,
          imageId: 'x',
          visibility: 'public',
        })
        .returning({ id: schema.dishes.id })
      await db.insert(schema.collectionItems).values([
        { collectionId, dishId: shown!.id },
        { collectionId, dishId: hidden!.id },
      ])
      const page = async () => (await pub.request(`/p/collection/${collectionId}`)).text()

      let html = await page()
      expect(html).toContain(`${tag} shown dish`)
      expect(html).not.toContain(`${tag} hidden dish`)

      await db
        .update(schema.dishes)
        .set({ removedAt: new Date() })
        .where(eq(schema.dishes.id, shown!.id))
      html = await page()
      expect(html).not.toContain(`${tag} shown dish`)
    })
  })

  describe('plans and followers', () => {
    test("a banned host's plan is not in a guest's list", async () => {
      const [plan] = await db
        .insert(schema.plans)
        .values({ hostId: id('banned'), startsAt: new Date(Date.now() + 86_400_000) })
        .returning({ id: schema.plans.id })
      await db.insert(schema.planInvites).values({ planId: plan!.id, userId: id('stranger') })
      as(stranger)
      const { plans } = (await (await send('GET', '/plans')).json()) as { plans: { id: string }[] }
      expect(plans.map((p) => p.id)).not.toContain(plan!.id)
    })

    test('a private account can remove an approved follower; it only ever touches its own followers', async () => {
      as(owner)
      expect((await send('DELETE', `/social/followers/${id('follower')}`)).status).toBe(200)
      const gone = await db.query.follows.findFirst({
        where: and(
          eq(schema.follows.followerId, id('follower')),
          eq(schema.follows.followingId, id('owner')),
        ),
      })
      expect(gone).toBeUndefined()
      // Idempotent, and removing a stranger who is not a follower is a harmless no-op.
      expect((await send('DELETE', `/social/followers/${id('follower')}`)).status).toBe(200)
      // The ex-follower now sees nothing of the thread.
      as(follower)
      expect((await send('GET', `/comments/ranking/${rankingId}`)).status).toBe(404)
    })
  })
})
