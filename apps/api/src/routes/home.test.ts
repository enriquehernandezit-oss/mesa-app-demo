import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Route-level checks for GET /home: which places make "Your six", what "Tonight"
// shows, and "New near you" — the parts that live in SQL. The ordering/cap rules
// themselves are unit-tested in lib/home.test.ts; this proves the QUERIES feed them the
// right people and places (follows, blocks, bans, closed and removed places, your own
// rankings, recency). Real Postgres, same local-only, tag-and-clean-up harness as
// social.test.ts / events.test.ts (see events.test.ts's header for why it is gated).

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
  const [{ db, schema }, { homeRoutes, loadTonightPick }] = await Promise.all([
    import('@mesa/db'),
    import('./home'),
  ])
  return { db, schema, homeRoutes, loadTonightPick }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Home = {
  six: {
    restaurant: { id: string }
    reason:
      | { kind: 'friend'; name: string; score: number; more: number }
      | { kind: 'saved_friends'; count: number }
      | { kind: 'saved' }
      | { kind: 'trending' }
  }[]
  tonight:
    | { kind: 'events'; events: { id: string; friendsGoing: { id: string }[] }[] }
    | { kind: 'pick'; restaurant: { id: string } }
    | null
  newNearYou: { id: string }[]
}

describe.skipIf(!deps)('GET /home (local DB)', () => {
  if (!deps) return
  const { db, schema, homeRoutes, loadTonightPick } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const uid = (label: string) => `${tag}-${label}`
  const DAY = 86_400_000
  const ago = (days: number) => new Date(Date.now() - days * DAY)
  const hours = (h: number) => new Date(Date.now() + h * 3600_000)

  const me: Me = {
    id: uid('me'),
    name: 'Home Me',
    email: `${tag}-me@example.test`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const userLabels = ['f1', 'f2', 'blocked', 'banned', 'stranger'] as const

  const app = new Hono<AuthedEnv>()
    .use(async (c, next) => {
      c.set('user', me)
      c.set('session', null)
      await next()
    })
    .route('/home', homeRoutes)
  const home = async () => (await (await app.request('/home')).json()) as Home

  const hoods: Record<'h1' | 'h2' | 'h3' | 'h4' | 'far', string> = {
    h1: '',
    h2: '',
    h3: '',
    h4: '',
    far: '',
  }
  const places: Record<string, string> = {}
  const eventIds = { tonight: crypto.randomUUID(), later: crypto.randomUUID() }

  beforeAll(async () => {
    // Neighborhoods.
    for (const key of Object.keys(hoods) as (keyof typeof hoods)[]) {
      const [n] = await db
        .insert(schema.neighborhoods)
        .values({
          slug: `${tag}-${key}`,
          name: `${tag}-${key}`,
          lat: 18.47,
          lng: -69.93,
          radiusM: 500,
        })
        .returning({ id: schema.neighborhoods.id })
      hoods[key] = n!.id
    }

    // People: me (home sector h1), two friends I follow, a friend I have also blocked, a
    // friend Mesa banned, and a stranger I don't follow.
    await db.insert(schema.user).values([
      { id: me.id, name: me.name, email: me.email, neighborhoodId: hoods.h1 },
      { id: uid('f1'), name: 'Fri One', email: `${tag}-f1@example.test`, handle: uid('f1') },
      { id: uid('f2'), name: 'Fri Two', email: `${tag}-f2@example.test`, handle: uid('f2') },
      {
        id: uid('blocked'),
        name: 'Blocked',
        email: `${tag}-b@example.test`,
        handle: uid('blocked'),
      },
      {
        id: uid('banned'),
        name: 'Banned',
        email: `${tag}-x@example.test`,
        handle: uid('banned'),
        bannedAt: new Date(),
      },
      {
        id: uid('stranger'),
        name: 'Stranger',
        email: `${tag}-s@example.test`,
        handle: uid('stranger'),
      },
    ])
    await db.insert(schema.follows).values(
      (['f1', 'f2', 'blocked', 'banned'] as const).map((l) => ({
        followerId: me.id,
        followingId: uid(l),
      })),
    )
    // A block normally severs the follow; the read filters it anyway (defense in depth).
    await db.insert(schema.userBlocks).values({ blockerId: me.id, blockedId: uid('blocked') })

    // Places. `photo` everywhere so the no-photo nudge never enters the ordering.
    const place = async (
      key: string,
      hood: keyof typeof hoods,
      extra: Partial<typeof schema.restaurants.$inferInsert> = {},
    ) => {
      const [r] = await db
        .insert(schema.restaurants)
        .values({
          name: `${tag}-${key}`,
          neighborhoodId: hoods[hood],
          lat: 18.47,
          lng: -69.93,
          isDemo: true,
          coverImageId: `${tag}.jpg`,
          ...extra,
        })
        .returning({ id: schema.restaurants.id })
      places[key] = r!.id
    }
    await Promise.all([
      // The six.
      place('A', 'h1'),
      place('A2', 'h3'),
      place('B', 'h1'),
      place('E', 'h2'),
      place('X1', 'h2'),
      place('X2', 'h3'),
      // Never the six.
      place('C', 'h1', { closedAt: new Date() }),
      place('Z', 'h1', { removedAt: new Date() }),
      place('F', 'h1'),
      place('G', 'h1'),
      place('H', 'h1'),
      // Places I have ranked, and that my friends' taste is measured on.
      place('S1', 'h4'),
      place('S2', 'h4'),
      place('S3', 'h4'),
      // Open late (tonight's pick).
      place('P', 'h4', { closesAt: '1a' }),
      place('Q', 'h4', { closesAt: '12a' }),
      place('R', 'h4', { closesAt: '9p' }),
      // New near you.
      place('N', 'h1'),
      place('NFar', 'far'),
      place('NOld', 'h1', { createdAt: ago(40) }),
      place('NUnranked', 'h1'),
      // Tonight's event venue.
      place('V', 'h4'),
    ])

    const rank = (
      userId: string,
      key: string,
      score: number,
      position: number,
      createdAt: Date = new Date(),
    ) => ({ userId, restaurantId: places[key]!, score, position, createdAt, updatedAt: createdAt })
    await db.insert(schema.rankings).values([
      // Shared taste: identical to f1 (gap 0 → 80%), 16 apart from f2 (→ 20%).
      rank(me.id, 'S1', 96, 1),
      rank(me.id, 'S2', 84, 2),
      rank(me.id, 'S3', 72, 3),
      rank(uid('f1'), 'S1', 96, 1),
      rank(uid('f1'), 'S2', 84, 2),
      rank(uid('f1'), 'S3', 72, 3),
      rank(uid('f2'), 'S1', 80, 1),
      rank(uid('f2'), 'S2', 68, 2),
      rank(uid('f2'), 'S3', 56, 3),
      // Recent friend rankings — the six.
      rank(uid('f1'), 'A', 90, 4),
      rank(uid('f2'), 'A2', 90, 4),
      rank(uid('f1'), 'B', 90, 5, ago(10)),
      rank(uid('f1'), 'X1', 80, 6, ago(1)),
      rank(uid('f1'), 'X2', 90, 7),
      // Friend rankings that must NOT surface.
      rank(uid('f1'), 'C', 95, 8, ago(1)), // closed
      rank(uid('f1'), 'Z', 95, 9, ago(1)), // removed
      rank(uid('blocked'), 'F', 99, 1), // blocked
      rank(uid('f1'), 'G', 95, 10, ago(40)), // too old
      rank(uid('banned'), 'H', 99, 1), // banned
      // Old rankings of open-late places — only tonight's pick reads these.
      rank(uid('f1'), 'P', 95, 11, ago(30)),
      rank(uid('f2'), 'Q', 85, 5, ago(30)),
      rank(uid('f1'), 'R', 99, 12, ago(30)),
      // A stranger's rankings: they make a place "new on Mesa", nothing more.
      rank(uid('stranger'), 'N', 90, 1),
      rank(uid('stranger'), 'NFar', 90, 2),
      rank(uid('stranger'), 'NOld', 90, 3),
    ])

    // I saved E (nobody ranked it) and A (a friend ranked it too).
    await db.insert(schema.savedPlaces).values([
      { userId: me.id, restaurantId: places.E! },
      { userId: me.id, restaurantId: places.A! },
    ])

    // Tonight: an event on now with a friend going, one days away.
    await db.insert(schema.events).values([
      {
        id: eventIds.tonight,
        slug: `${tag}-tonight`,
        title: tag,
        restaurantId: places.V!,
        startsAt: hours(-0.5),
        endsAt: hours(2),
      },
      {
        id: eventIds.later,
        slug: `${tag}-later`,
        title: tag,
        restaurantId: places.V!,
        startsAt: hours(72),
      },
    ])
    await db
      .insert(schema.eventRsvps)
      .values({ eventId: eventIds.tonight, userId: uid('f1'), status: 'going' })
  })

  afterAll(async () => {
    // users cascade follows, blocks, rankings, saved places, rsvps; events cascade rsvps.
    await db.delete(schema.events).where(inArray(schema.events.id, Object.values(eventIds)))
    await db.delete(schema.user).where(inArray(schema.user.id, [me.id, ...userLabels.map(uid)]))
    const ids = Object.values(places)
    if (ids.length) await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, ids))
    const hoodIds = Object.values(hoods).filter(Boolean)
    if (hoodIds.length)
      await db.delete(schema.neighborhoods).where(inArray(schema.neighborhoods.id, hoodIds))
  })

  const sixIds = (h: Home) => h.six.map((s) => s.restaurant.id)

  test('the six are the recent friend rankings and saves, best first', async () => {
    const h = await home()
    const byKey = (id: string) => Object.entries(places).find(([, v]) => v === id)?.[0]
    // A (f1, fresh, and saved) tops it. Then X2 (a fresh 9.0), X1 (yesterday's 8.0), A2, the
    // saved-only E, and B — a week-old 9.0, in my home neighborhood — last.
    expect(h.six.map((s) => byKey(s.restaurant.id))).toEqual(['A', 'X2', 'X1', 'A2', 'E', 'B'])
  })

  test('a friend whose taste matches yours counts for more than one whose does not', async () => {
    const h = await home()
    const order = sixIds(h)
    // Same fresh 9.0, same neighborhood, on each — X2's friend is an 80% match, A2's 20%.
    expect(order.indexOf(places.X2!)).toBeLessThan(order.indexOf(places.A2!))
  })

  test('the reasons say why', async () => {
    const h = await home()
    const reason = (key: string) => h.six.find((s) => s.restaurant.id === places[key])?.reason
    expect(reason('A')).toEqual({ kind: 'saved_friends', count: 1 })
    expect(reason('E')).toEqual({ kind: 'saved' })
    expect(reason('X1')).toEqual({ kind: 'friend', name: 'Fri', score: 80, more: 0 })
  })

  test('never: closed, removed, blocked or banned friends, already ranked, or too old', async () => {
    const ids = sixIds(await home())
    for (const key of ['C', 'Z', 'F', 'H', 'G', 'S1', 'S2', 'S3']) {
      expect(ids).not.toContain(places[key]!)
    }
  })

  test('a full six never borrows from the crowd', async () => {
    const h = await home()
    expect(h.six).toHaveLength(6)
    expect(h.six.some((s) => s.reason.kind === 'trending')).toBe(false)
  })

  test('tonight shows an event on now, with the friend going', async () => {
    const t = (await home()).tonight
    expect(t?.kind).toBe('events')
    if (t?.kind !== 'events') return
    const mine = t.events.find((e) => e.id === eventIds.tonight)
    expect(mine).toBeDefined()
    expect(mine?.friendsGoing.map((f) => f.id)).toEqual([uid('f1')])
    // a friend going puts it first; an event days away isn't tonight at all
    expect(t.events[0]?.id).toBe(eventIds.tonight)
    expect(t.events.some((e) => e.id === eventIds.later)).toBe(false)
  })

  test("tonight's pick: the late-open place friends rank highest, not one that closes early", async () => {
    const pick = await loadTonightPick(me, new Set())
    expect(pick?.restaurant.id).toBe(places.P!) // R scores higher but closes at 9p
    expect(pick?.friend.name).toBe('Fri One')
    // already in the six → the next one down
    expect((await loadTonightPick(me, new Set([places.P!])))?.restaurant.id).toBe(places.Q!)
    expect(await loadTonightPick(me, new Set([places.P!, places.Q!]))).toBeNull()
  })

  test('new near you: newly ranked places in my neighborhood, not repeated from the six', async () => {
    const h = await home()
    const ids = h.newNearYou.map((r) => r.id)
    expect(ids).toContain(places.N!)
    // far away, too old, or nobody has ranked it
    for (const key of ['NFar', 'NOld', 'NUnranked']) expect(ids).not.toContain(places[key]!)
    // nothing repeats above the feed
    for (const id of sixIds(h)) expect(ids).not.toContain(id)
  })

  test('someone with no friends and no saves gets an honest, empty response', async () => {
    const lonely: Me = { ...me, id: uid('stranger') }
    const lonelyApp = new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', lonely)
        c.set('session', null)
        await next()
      })
      .route('/home', homeRoutes)
    const res = await lonelyApp.request('/home')
    expect(res.status).toBe(200)
    const h = (await res.json()) as Home
    // no friends → none of MY six; only the crowd may fill, never one of the blocked places
    expect(sixIds(h)).not.toContain(places.F!)
    expect(sixIds(h)).not.toContain(places.H!)
  })
})
