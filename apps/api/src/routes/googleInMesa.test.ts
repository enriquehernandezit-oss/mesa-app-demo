import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, like } from 'drizzle-orm'

// Which of Google's places Mesa already has — matched on the Google id. Real Postgres, the same
// local-only, tag-and-clean-up harness as geography.test.ts (see events.test.ts's header for why).

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
  const [{ db, schema }, search] = await Promise.all([
    import('@mesa/db'),
    import('../lib/placeSearch'),
  ])
  return { db, schema, search }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

describe.skipIf(!deps)('ownedByGoogleId (local DB)', () => {
  if (!deps) return
  const { db, schema, search } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const gid = (k: string) => `${tag}-g-${k}`
  let neighborhoodId = ''
  const ids: Record<'live' | 'closed' | 'removed', string> = { live: '', closed: '', removed: '' }

  beforeAll(async () => {
    const [n] = await db
      .insert(schema.neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: schema.neighborhoods.id })
    neighborhoodId = n?.id ?? ''
    const base = { neighborhoodId, lat: 18.47, lng: -69.93, isDemo: true }
    const rows = await db
      .insert(schema.restaurants)
      .values([
        { ...base, name: `${tag} live`, googlePlaceId: gid('live') },
        { ...base, name: `${tag} closed`, googlePlaceId: gid('closed'), closedAt: new Date() },
        { ...base, name: `${tag} removed`, googlePlaceId: gid('removed'), removedAt: new Date() },
        { ...base, name: `${tag} no google id` },
      ])
      .returning({ id: schema.restaurants.id, name: schema.restaurants.name })
    for (const r of rows) {
      const key = r.name.slice(tag.length + 1)
      if (key === 'live' || key === 'closed' || key === 'removed') ids[key] = r.id
    }
  })

  afterAll(async () => {
    await db.delete(schema.restaurants).where(like(schema.restaurants.name, `${tag}%`))
    if (neighborhoodId) {
      await db.delete(schema.neighborhoods).where(eq(schema.neighborhoods.id, neighborhoodId))
    }
  })

  test('finds a live place by its Google id', async () => {
    const owned = await search.ownedByGoogleId([gid('live'), 'someone-elses'])
    expect(owned.get(gid('live'))).toEqual({ id: ids.live, closed: false })
    expect(owned.has('someone-elses')).toBe(false)
  })

  test('a closed place is found but marked closed — it is Mesa’s, just not offerable', async () => {
    const owned = await search.ownedByGoogleId([gid('closed')])
    expect(owned.get(gid('closed'))).toEqual({ id: ids.closed, closed: true })
  })

  test('a removed place is not one Mesa has', async () => {
    expect((await search.ownedByGoogleId([gid('removed')])).size).toBe(0)
  })

  test('nothing asked is nothing queried', async () => {
    expect((await search.ownedByGoogleId([])).size).toBe(0)
  })

  test('the whole flow: what Google found, split into what is new and what Mesa has', async () => {
    const found = ['live', 'removed', 'unknown'].map((k) => ({
      provider: 'google' as const,
      providerPlaceId: k === 'unknown' ? 'nobody-has-this' : gid(k),
      name: k,
      secondaryText: null,
    }))
    const { fresh, mesaIds } = search.partitionByMesa(
      found,
      await search.ownedByGoogleId(found.map((s) => s.providerPlaceId)),
    )
    expect(mesaIds).toEqual([ids.live])
    expect(fresh.map((s) => s.name)).toEqual(['removed', 'unknown'])
  })
})
