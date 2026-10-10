import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray } from 'drizzle-orm'

// Only the seeded fictional members go: no email, no sign-in account, no session, no phone. Real
// members, a password account, a phone account and someone with a session must all survive, and the
// operator's count must match or nothing is deleted. Local-only, tag-and-clean-up harness (like
// events.test.ts), restricted to its own rows by `onlyIds` so the seed's real fictional members are
// never touched.

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
  const [{ db, schema }, purge] = await Promise.all([
    import('@mesa/db'),
    import('./purgeSeedMembers'),
  ])
  return { db, schema, ...purge }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

describe.skipIf(!deps)('purging the seeded members (local DB)', () => {
  if (!deps) return
  const { db, schema, findSeedMembers, purgeSeedMembers } = deps
  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const ids = {
    fakeA: `${tag}-fake-a`,
    fakeB: `${tag}-fake-b`,
    real: `${tag}-real`,
    withAccount: `${tag}-account`,
    withSession: `${tag}-session`,
    withPhone: `${tag}-phone`,
  }
  const all = Object.values(ids)
  let placeId = ''

  beforeAll(async () => {
    const [hood] = await db.select({ id: schema.neighborhoods.id }).from(schema.neighborhoods)
    if (!hood) throw new Error('no neighborhoods: seed the local database first')
    await db.insert(schema.user).values([
      { id: ids.fakeA, name: 'Fake A', handle: `${tag}a` },
      { id: ids.fakeB, name: 'Fake B', handle: `${tag}b` },
      { id: ids.real, name: 'Real', email: `${ids.real}@example.test`, handle: `${tag}r` },
      { id: ids.withAccount, name: 'Has account', handle: `${tag}c` },
      { id: ids.withSession, name: 'Has session', handle: `${tag}s` },
      { id: ids.withPhone, name: 'Has phone', handle: `${tag}p`, phoneHash: `${tag}-hash` },
    ])
    await db.insert(schema.account).values({
      id: `${tag}-acc`,
      accountId: ids.withAccount,
      providerId: 'credential',
      userId: ids.withAccount,
    })
    await db.insert(schema.session).values({
      id: `${tag}-sess`,
      token: `${tag}-token`,
      userId: ids.withSession,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    const [place] = await db
      .insert(schema.restaurants)
      .values({ name: `Purge place ${tag}`, neighborhoodId: hood.id, lat: 18.47, lng: -69.93 })
      .returning({ id: schema.restaurants.id })
    placeId = place?.id ?? ''
    await db.insert(schema.rankings).values([
      { userId: ids.fakeA, restaurantId: placeId, position: 1, score: 8 },
      { userId: ids.real, restaurantId: placeId, position: 1, score: 9 },
    ])
    await db.insert(schema.follows).values({ followerId: ids.real, followingId: ids.fakeA })
  })

  afterAll(async () => {
    await db.delete(schema.restaurants).where(eq(schema.restaurants.id, placeId))
    await db.delete(schema.user).where(inArray(schema.user.id, all))
  })

  const survivors = async () =>
    (await db.select({ id: schema.user.id }).from(schema.user).where(inArray(schema.user.id, all)))
      .map((r) => r.id)
      .sort()

  test('only members with no email, account, session or phone are found', async () => {
    const found = (await db.transaction((tx) => findSeedMembers(tx, all))).map((m) => m.id).sort()
    expect(found).toEqual([ids.fakeA, ids.fakeB].sort())
  })

  test('a wrong count deletes nothing', async () => {
    await expect(
      db.transaction((tx) => purgeSeedMembers(tx, { expect: 5, onlyIds: all })),
    ).rejects.toThrow('--expect')
    expect(await survivors()).toHaveLength(all.length)
  })

  test('the right count removes the fakes and what hangs on them, and nobody else', async () => {
    const report = await db.transaction((tx) => purgeSeedMembers(tx, { expect: 2, onlyIds: all }))
    expect(report.members).toHaveLength(2)
    expect(report.removed.rankings).toBe(1)
    expect(report.removed.follows).toBe(1)

    expect(await survivors()).toEqual(
      [ids.real, ids.withAccount, ids.withSession, ids.withPhone].sort(),
    )
    // The real member's own ranking and their list are untouched.
    const kept = await db
      .select({ id: schema.rankings.id })
      .from(schema.rankings)
      .where(eq(schema.rankings.userId, ids.real))
    expect(kept).toHaveLength(1)
  })

  test('running it again finds nothing', async () => {
    expect(await db.transaction((tx) => findSeedMembers(tx, all))).toHaveLength(0)
    await expect(
      db.transaction((tx) => purgeSeedMembers(tx, { expect: 1, onlyIds: all })),
    ).rejects.toThrow('--expect')
  })
})
