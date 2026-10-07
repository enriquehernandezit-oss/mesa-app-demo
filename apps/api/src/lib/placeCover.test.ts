import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq, inArray } from 'drizzle-orm'

// A place's picture is its best public dish photo (packages/db/src/placeCover.ts). Real Postgres,
// same local-only, tag-and-clean-up harness as mutuals.test.ts.

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
  const [{ db, schema, refreshPlaceCovers }, { placesWithPhotosBy }] = await Promise.all([
    import('@mesa/db'),
    import('./placeCover'),
  ])
  return { db, schema, refreshPlaceCovers, placesWithPhotosBy }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

describe.skipIf(!deps)('place cover from dish photos (local DB)', () => {
  if (!deps) return
  const { db, schema, refreshPlaceCovers, placesWithPhotosBy } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const uid = (label: string) => `${tag}-${label}`
  const people = ['early', 'late', 'closed', 'quiet', 'banned'] as const
  const photo = (name: string) => `https://photos.example.test/${tag}/${name}.jpg`

  let placeA = ''
  let placeB = ''
  let earlyDish = ''
  let lateDish = ''
  const coverOf = async (id: string) =>
    (
      await db
        .select({ cover: schema.restaurants.coverImageId })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.id, id))
    )[0]?.cover

  beforeAll(async () => {
    const [hood] = await db.select({ id: schema.neighborhoods.id }).from(schema.neighborhoods)
    if (!hood) throw new Error('no neighborhoods: seed the local database first')
    await db.insert(schema.user).values(
      people.map((p) => ({
        id: uid(p),
        name: `Cover ${p}`,
        email: `${uid(p)}@example.test`,
        handle: uid(p),
        isPrivate: p === 'closed',
        bannedAt: p === 'banned' ? new Date() : null,
      })),
    )
    const places = await db
      .insert(schema.restaurants)
      .values(
        ['A', 'B'].map((n) => ({
          name: `Cover place ${tag} ${n}`,
          neighborhoodId: hood.id,
          lat: 18.47,
          lng: -69.93,
          // The old kind of cover: stock art that is no member's dish photo.
          coverImageId: '/restaurants/bar.jpg',
        })),
      )
      .returning({ id: schema.restaurants.id })
    placeA = places[0]?.id ?? ''
    placeB = places[1]?.id ?? ''

    const rankingRows = await db
      .insert(schema.rankings)
      .values(
        people.flatMap((p, i) =>
          [placeA, placeB].map((restaurantId) => ({
            userId: uid(p),
            restaurantId,
            position: i + 1,
            score: 8,
          })),
        ),
      )
      .returning({
        id: schema.rankings.id,
        userId: schema.rankings.userId,
        restaurantId: schema.rankings.restaurantId,
      })
    const ranking = (p: string, restaurantId: string) =>
      rankingRows.find((r) => r.userId === uid(p) && r.restaurantId === restaurantId)?.id ?? ''

    const dish = (
      p: (typeof people)[number],
      restaurantId: string,
      image: string,
      extra: Partial<typeof schema.dishes.$inferInsert> = {},
    ) => ({
      userId: uid(p),
      rankingId: ranking(p, restaurantId),
      restaurantId,
      name: `Plato ${p}`,
      imageId: photo(image),
      visibility: 'public',
      ...extra,
    })
    const made = await db
      .insert(schema.dishes)
      .values([
        dish('early', placeA, 'early', { createdAt: new Date('2026-01-01') }),
        dish('late', placeA, 'late', { createdAt: new Date('2026-02-01') }),
        // never a cover: a private account's public dish, a banned member's, a photo-less one
        dish('closed', placeA, 'closed', { createdAt: new Date('2026-03-01') }),
        dish('banned', placeA, 'banned', { createdAt: new Date('2026-03-02') }),
        // place B: only friends-only photos
        dish('early', placeB, 'friends', { visibility: 'friends' }),
        dish('quiet', placeB, 'friends2', { visibility: 'friends' }),
      ])
      .returning({ id: schema.dishes.id, userId: schema.dishes.userId, name: schema.dishes.name })
    earlyDish = made.find((d) => d.userId === uid('early') && d.name === 'Plato early')?.id ?? ''
    lateDish = made.find((d) => d.userId === uid('late'))?.id ?? ''
  })

  afterAll(async () => {
    await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, [placeA, placeB]))
    await db.delete(schema.user).where(inArray(schema.user.id, people.map(uid)))
  })

  test('the newest public photo wins, and the old stock art is replaced', async () => {
    await refreshPlaceCovers([placeA, placeB])
    expect(await coverOf(placeA)).toBe(photo('late'))
  })

  test('a place with only friends-only photos has no cover, so stock art is cleared', async () => {
    expect(await coverOf(placeB)).toBeNull()
  })

  test('the most cheered photo beats a newer one', async () => {
    await db.insert(schema.dishCheers).values({ userId: uid('quiet'), dishId: earlyDish })
    await refreshPlaceCovers([placeA])
    expect(await coverOf(placeA)).toBe(photo('early'))
  })

  test('taking a dish away, or its owner going private, hands the cover to the next photo', async () => {
    await db
      .update(schema.dishes)
      .set({ removedAt: new Date() })
      .where(eq(schema.dishes.id, earlyDish))
    await refreshPlaceCovers([placeA])
    expect(await coverOf(placeA)).toBe(photo('late'))

    await db
      .update(schema.user)
      .set({ isPrivate: true })
      .where(eq(schema.user.id, uid('late')))
    await refreshPlaceCovers(await placesWithPhotosBy(uid('late')))
    expect(await coverOf(placeA)).toBeNull()
    expect(lateDish).not.toBe('')
  })

  test('placesWithPhotosBy lists the places a member has a photo on', async () => {
    expect((await placesWithPhotosBy(uid('early'))).sort()).toEqual([placeA, placeB].sort())
    expect(await placesWithPhotosBy(uid('nobody'))).toEqual([])
  })
})
