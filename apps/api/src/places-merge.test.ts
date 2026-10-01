import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { inArray } from 'drizzle-orm'

import { mergeGroup, parseArgs } from './places-merge'

describe('places:merge arguments', () => {
  test('every plain argument is a name, in order', () => {
    expect(parseArgs(['Ichiban', 'Shibuya', 'Shibuya Ichiban'])).toEqual({
      names: ['Ichiban', 'Shibuya', 'Shibuya Ichiban'],
      rename: undefined,
      dryRun: false,
    })
  })

  test('the value after --rename is the new name, not a row to merge', () => {
    expect(parseArgs(['Ichiban', 'Shibuya', '--rename', 'Shibuya Ichiban'])).toEqual({
      names: ['Ichiban', 'Shibuya'],
      rename: 'Shibuya Ichiban',
      dryRun: false,
    })
  })

  test('flags may come anywhere', () => {
    expect(parseArgs(['--dry-run', 'Laurel'])).toEqual({
      names: ['Laurel'],
      rename: undefined,
      dryRun: true,
    })
    expect(parseArgs(['Laurel', '--rename', 'Laurel Bistro', '--dry-run']).dryRun).toBe(true)
  })

  test('apostrophes and accents pass through untouched, blanks are dropped', () => {
    expect(parseArgs(["Buche' Perico", ' Buche Perico ', '', 'Restaurante Gijón']).names).toEqual([
      "Buche' Perico",
      'Buche Perico',
      'Restaurante Gijón',
    ])
  })

  test('no names is an empty list, for the script to refuse', () => {
    expect(parseArgs(['--dry-run']).names).toEqual([])
  })
})

// ── mergeGroup, against a real database ──────────────────────────────────

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
const deps = (await localDbReachable()) ? await import('@mesa/db') : null

describe.skipIf(!deps)('mergeGroup (local DB)', () => {
  if (!deps) return
  const { db, schema, scoreFor } = deps
  const { user, neighborhoods, restaurants, rankings, menuItems } = schema

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const ana = `${tag}-ana`
  const bo = `${tag}-bo`
  let hoodId = ''
  const made: string[] = []

  // A seed-like twin (photo, reviews, no Google id) and a catalog-like twin (Google id, menu).
  const place = async (name: string, over: Partial<typeof restaurants.$inferInsert> = {}) => {
    const [r] = await db
      .insert(restaurants)
      .values({ name, neighborhoodId: hoodId, lat: 18.47, lng: -69.93, isDemo: true, ...over })
      .returning({ id: restaurants.id })
    made.push(r?.id ?? '')
    return r?.id ?? ''
  }
  const pair = async (name: string, gid: string) => {
    const seed = await place(name, { source: 'seed', coverImageId: 'photo', address: 'Old 1' })
    const catalog = await place(name, {
      source: 'catalog',
      isDemo: false,
      googlePlaceId: gid,
      address: 'Calle Real 1',
    })
    await db.insert(rankings).values([
      { userId: ana, restaurantId: seed, position: 1, score: scoreFor(0, 1) },
      { userId: bo, restaurantId: seed, position: 1, score: scoreFor(0, 1) },
    ])
    await db
      .insert(menuItems)
      .values({ restaurantId: catalog, section: 'Mains', name: 'Dish', position: 0 })
    return { seed, catalog }
  }
  const alive = async (ids: string[]) =>
    (
      await db.select({ id: restaurants.id }).from(restaurants).where(inArray(restaurants.id, ids))
    ).map((r) => r.id)
  const quiet = () => undefined

  beforeAll(async () => {
    await db
      .insert(user)
      .values([ana, bo].map((id) => ({ id, name: id, email: `${id}@example.test`, handle: id })))
    const [n] = await db
      .insert(neighborhoods)
      .values({ slug: tag, name: tag, lat: 18.47, lng: -69.93, radiusM: 500 })
      .returning({ id: neighborhoods.id })
    hoodId = n?.id ?? ''
  })

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana, bo]))
    const ids = made.filter(Boolean)
    if (ids.length > 0) await db.delete(restaurants).where(inArray(restaurants.id, ids))
    await db.delete(neighborhoods).where(inArray(neighborhoods.id, [hoodId]))
  })

  test('merges a group whose rows share one name: the reviewed, photographed row is kept', async () => {
    const { seed, catalog } = await pair(`${tag} Alpha`, `${tag}-g1`)
    const lines: string[] = []
    const result = await mergeGroup([`${tag} Alpha`], { dryRun: false, log: (l) => lines.push(l) })
    expect(result).toMatchObject({ kind: 'done', merged: 1, dryRun: false })
    expect(await alive([seed, catalog])).toEqual([seed])
    const [kept] = await db
      .select()
      .from(restaurants)
      .where(inArray(restaurants.id, [seed]))
    expect(kept).toMatchObject({
      googlePlaceId: `${tag}-g1`,
      address: 'Old 1',
      coverImageId: 'photo',
    })
    expect(
      (
        await db
          .select()
          .from(menuItems)
          .where(inArray(menuItems.restaurantId, [seed]))
      ).length,
    ).toBe(1)
    // the plan says which is kept and where each row says it is
    const plan = lines.join('\n')
    expect(plan).toMatch(new RegExp(`KEEP .*${tag} Alpha.*${tag}, Old 1.*2 reviews.*photo`))
    expect(plan).toContain('Calle Real 1')
  })

  test('a dry run reports the merge and changes nothing', async () => {
    const { seed, catalog } = await pair(`${tag} Beta`, `${tag}-g2`)
    const lines: string[] = []
    const result = await mergeGroup([`${tag} Beta`], { dryRun: true, log: (l) => lines.push(l) })
    expect(result).toMatchObject({ kind: 'done', dryRun: true })
    expect((await alive([seed, catalog])).sort()).toEqual([seed, catalog].sort())
    expect(lines.join('\n')).toContain('dry run — rolled back')
  })

  test('the kept row can be renamed', async () => {
    const seed = await place(`${tag} Delta1`, { source: 'seed', coverImageId: 'photo' })
    const other = await place(`${tag} Delta2`, { source: 'catalog', isDemo: false })
    await db
      .insert(rankings)
      .values({ userId: ana, restaurantId: seed, position: 2, score: scoreFor(1, 2) })
    const result = await mergeGroup([`${tag} Delta1`, `${tag} Delta2`], {
      rename: `${tag} Delta`,
      dryRun: false,
      log: quiet,
    })
    expect(result).toMatchObject({ kind: 'done', kept: `${tag} Delta` })
    const [kept] = await db
      .select()
      .from(restaurants)
      .where(inArray(restaurants.id, [seed]))
    expect(kept?.name).toBe(`${tag} Delta`)
    expect(await alive([other])).toEqual([])
  })

  test('a group that is not here is skipped, not an error', async () => {
    const missing = await mergeGroup([`${tag} Nowhere`], { dryRun: false, log: quiet })
    expect(missing).toMatchObject({ kind: 'skipped' })
    if (missing.kind === 'skipped') expect(missing.reason).toContain('No live restaurant named')
  })

  test('one row on its own is skipped — there is nothing to merge', async () => {
    await place(`${tag} Solo`)
    const result = await mergeGroup([`${tag} Solo`], { dryRun: false, log: quiet })
    expect(result).toMatchObject({ kind: 'skipped' })
    if (result.kind === 'skipped') expect(result.reason).toContain('at least two')
  })

  test('two DIFFERENT Google ids are two places — refused, and nothing merges', async () => {
    const a = await place(`${tag} Gamma`, { source: 'catalog', googlePlaceId: `${tag}-ga` })
    const b = await place(`${tag} Gamma`, { source: 'catalog', googlePlaceId: `${tag}-gb` })
    await expect(mergeGroup([`${tag} Gamma`], { dryRun: false, log: quiet })).rejects.toThrow(
      'different Google ids',
    )
    expect((await alive([a, b])).sort()).toEqual([a, b].sort())
  })
})
