import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { and, eq, inArray } from 'drizzle-orm'

import { seedSite } from './placeContacts'
import {
  type MergeRow,
  adoptFacts,
  attachedTo,
  mergeInto,
  pickSurvivor,
  removeRestaurant,
} from './restaurantMerge'

// Merging duplicate restaurants moves data across thirteen tables and rewrites members' ranked
// lists, so it is tested against a real Postgres, with every collision the unique indexes allow:
// a member who ranked both twins, cheered both, saved both, listed both. Same local-only,
// tag-and-clean-up harness as the route tests (see events.test.ts's header for why it is gated).

describe('pickSurvivor', () => {
  const place = (id: string, reviews: number, hasPhoto: boolean, day: number) => ({
    id,
    reviews,
    hasPhoto,
    createdAt: new Date(Date.UTC(2026, 0, day)),
  })

  test('the row with the most reviews wins', () => {
    expect(pickSurvivor([place('a', 1, true, 1), place('b', 17, false, 2)]).id).toBe('b')
  })

  test('then the one with a photo', () => {
    expect(pickSurvivor([place('a', 5, false, 1), place('b', 5, true, 2)]).id).toBe('b')
  })

  test('then the oldest, then a stable order', () => {
    expect(pickSurvivor([place('a', 5, true, 9), place('b', 5, true, 2)]).id).toBe('b')
    expect(pickSurvivor([place('b', 5, true, 2), place('a', 5, true, 2)]).id).toBe('a')
  })

  test('picks the most-reviewed of three', () => {
    // Ichiban 8, Shibuya 7, the catalog row 0
    expect(
      pickSurvivor([
        place('shibuya', 7, true, 2),
        place('catalog', 0, false, 3),
        place('ichiban', 8, true, 1),
      ]).id,
    ).toBe('ichiban')
  })

  test('refuses an empty group', () => {
    expect(() => pickSurvivor([])).toThrow()
  })
})

describe('adoptFacts', () => {
  const row = (over: Partial<MergeRow> = {}): MergeRow => ({
    id: 'r',
    name: 'Laurel',
    lat: 18.4688,
    lng: -69.9374,
    neighborhoodId: 'hood-a',
    googlePlaceId: null,
    phone: null,
    website: null,
    address: null,
    locality: null,
    priceTier: null,
    closesAt: null,
    cuisine: null,
    coverImageId: null,
    sourceRefreshedAt: null,
    ...over,
  })
  const refreshed = new Date('2026-09-01T00:00:00Z')
  const catalog = row({
    googlePlaceId: 'ChIJ-laurel',
    lat: 18.48,
    lng: -69.93,
    neighborhoodId: 'hood-b',
    phone: '+1 809-000-1111',
    website: 'https://laurel.example/',
    address: 'Calle Real 1',
    locality: 'Santo Domingo',
    priceTier: 3,
    closesAt: '11p',
    sourceRefreshedAt: refreshed,
  })

  test('a Google-backed loser hands over its id, real pin, neighborhood and real contacts', () => {
    const seed = row({ phone: '+18095551021', website: seedSite('Laurel'), coverImageId: 'photo' })
    const patch = adoptFacts(seed, catalog)
    expect(patch).toMatchObject({
      googlePlaceId: 'ChIJ-laurel',
      lat: 18.48,
      lng: -69.93,
      neighborhoodId: 'hood-b',
      phone: '+1 809-000-1111',
      website: 'https://laurel.example/',
      address: 'Calle Real 1',
      sourceRefreshedAt: refreshed,
    })
    // the survivor already has a photo, so it keeps its own
    expect(patch).not.toHaveProperty('coverImageId')
  })

  test("the survivor's own values are never overwritten", () => {
    const patch = adoptFacts(
      row({ address: 'Mine 9', priceTier: 1, phone: '+1 809-999-9999' }),
      catalog,
    )
    expect(patch).not.toHaveProperty('address')
    expect(patch).not.toHaveProperty('priceTier')
    expect(patch).not.toHaveProperty('phone')
  })

  test('a loser that is not Google-backed only fills gaps — no pin, hood or id', () => {
    const loser = row({
      lat: 18.6,
      lng: -69.8,
      neighborhoodId: 'hood-z',
      cuisine: 'Italian',
      address: 'Somewhere 2',
    })
    const patch = adoptFacts(row({ address: 'Kept 1' }), loser)
    expect(patch).toEqual({ cuisine: 'Italian' })
  })

  test("a loser's invented contacts are not passed on", () => {
    const loser = row({ phone: '+18095551000', website: seedSite('Laurel'), cuisine: 'Italian' })
    expect(adoptFacts(row(), loser)).toEqual({ cuisine: 'Italian' })
  })

  test('the photo is kept whichever row survives', () => {
    const patch = adoptFacts(row(), row({ coverImageId: 'loser-photo' }))
    expect(patch.coverImageId).toBe('loser-photo')
  })
})

// ── against a real database ──────────────────────────────────────────────

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

describe.skipIf(!deps)('mergeInto and removeRestaurant (local DB)', () => {
  if (!deps) return
  const { db, schema, scoreFor } = deps
  const {
    user,
    neighborhoods,
    restaurants,
    rankings,
    dishes,
    cheers,
    rankingComments,
    notifications,
    vibeNotes,
    savedPlaces,
    lists,
    listItems,
    collections,
    collectionItems,
    dishLists,
    dishListItems,
    plans,
    planOptions,
    planInvites,
    events,
    menuItems,
  } = schema

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const uid = (label: string) => `${tag}-${label}`
  const ana = uid('ana')
  const bo = uid('bo')
  const cy = uid('cy')
  const di = uid('di')
  const users = [ana, bo, cy, di]

  const hoods: string[] = []
  type Place = 'S' | 'L' | 'F1' | 'F2' | 'S2' | 'L2' | 'S3' | 'L3' | 'R' | 'R1' | 'R2'
  const rid = {} as Record<Place, string>
  const listIds: string[] = []
  const planIds: string[] = []
  const collectionIds: string[] = []
  const dishListIds: string[] = []

  const restaurant = async (label: Place, over: Partial<typeof restaurants.$inferInsert> = {}) => {
    const [r] = await db
      .insert(restaurants)
      .values({
        name: `${tag} ${label}`,
        neighborhoodId: hoods[0] as string,
        lat: 18.47,
        lng: -69.93,
        isDemo: true,
        ...over,
      })
      .returning({ id: restaurants.id })
    rid[label] = r?.id ?? ''
    return rid[label]
  }
  const rank = async (
    userId: string,
    label: Place,
    position: number,
    total: number,
    tags?: string[],
  ) => {
    const [r] = await db
      .insert(rankings)
      .values({
        userId,
        restaurantId: rid[label] as string,
        position,
        score: scoreFor(position - 1, total),
        tags,
      })
      .returning({ id: rankings.id })
    return r?.id ?? ''
  }
  const list = async (userId: string, label: Place) =>
    (
      await db
        .select()
        .from(rankings)
        .where(and(eq(rankings.userId, userId), eq(rankings.restaurantId, rid[label] as string)))
    )[0]
  const orderOf = async (userId: string) =>
    (
      await db.select().from(rankings).where(eq(rankings.userId, userId)).orderBy(rankings.position)
    ).map((r) => ({ restaurantId: r.restaurantId, position: r.position, score: r.score }))
  const merge = (survivor: Place, loser: Place) =>
    db.transaction((tx) => mergeInto(tx, rid[survivor] as string, rid[loser] as string))

  // Scenario A's ids, kept for the assertions.
  const ids = {} as Record<'cyS' | 'cyL' | 'diL' | 'diS' | 'aL' | 'cyDish', string>
  let reportA: Awaited<ReturnType<typeof merge>>

  beforeAll(async () => {
    await db
      .insert(user)
      .values(users.map((id) => ({ id, name: id, email: `${id}@example.test`, handle: id })))
    for (const label of ['h1', 'h2']) {
      const [n] = await db
        .insert(neighborhoods)
        .values({
          slug: `${tag}-${label}`,
          name: `${tag}-${label}`,
          lat: 18.47,
          lng: -69.93,
          radiusM: 500,
        })
        .returning({ id: neighborhoods.id })
      hoods.push(n?.id ?? '')
    }

    // S = the seed twin (photo, reviews, wrong pin, invented contacts, no Google id);
    // L = the catalog twin (Google id, real facts and pin, the menu, no photo).
    const refreshed = new Date('2026-09-01T00:00:00Z')
    await restaurant('S', {
      source: 'seed',
      coverImageId: 'photo-s',
      lat: 18.5,
      lng: -69.9,
      phone: '+18095551004',
      website: seedSite(`${tag} S`),
    })
    await restaurant('L', {
      source: 'catalog',
      isDemo: false,
      googlePlaceId: `${tag}-gid`,
      neighborhoodId: hoods[1] as string,
      lat: 18.4688,
      lng: -69.9374,
      phone: '+1 809-541-4101',
      website: 'https://real.example/',
      address: 'Calle Real 1',
      locality: 'Santo Domingo',
      priceTier: 3,
      sourceRefreshedAt: refreshed,
    })
    await restaurant('F1')
    await restaurant('F2')

    // Members' lists. cy ranked both twins (S is the better entry); di ranked both (L is).
    await rank(ana, 'L', 1, 1)
    await rank(bo, 'S', 1, 1)
    await rank(cy, 'F1', 1, 4)
    ids.cyS = await rank(cy, 'S', 2, 4)
    await rank(cy, 'F2', 3, 4)
    ids.cyL = await rank(cy, 'L', 4, 4, ['Solo'])
    ids.diL = await rank(di, 'L', 1, 3)
    await rank(di, 'F1', 2, 3)
    ids.diS = await rank(di, 'S', 3, 3)
    ids.aL = (await list(ana, 'L'))?.id ?? ''

    // What hangs off the rankings that will be dropped or moved.
    const [dish] = await db
      .insert(dishes)
      .values({
        userId: cy,
        rankingId: ids.cyL as string,
        restaurantId: rid.L as string,
        name: 'Pizza',
      })
      .returning({ id: dishes.id })
    ids.cyDish = dish?.id ?? ''
    await db.insert(dishes).values({
      userId: di,
      rankingId: ids.diS as string,
      restaurantId: rid.S as string,
      name: 'Pasta',
    })
    await db.insert(dishes).values({
      userId: ana,
      rankingId: ids.aL as string,
      restaurantId: rid.L as string,
      name: 'Soup',
    })
    await db.insert(cheers).values([
      { userId: ana, rankingId: ids.cyS as string },
      { userId: ana, rankingId: ids.cyL as string },
      { userId: bo, rankingId: ids.cyL as string },
    ])
    await db
      .insert(rankingComments)
      .values({ rankingId: ids.cyL as string, userId: bo, body: 'great' })
    await db.insert(notifications).values([
      {
        userId: cy,
        kind: 'cheers',
        dedupeKey: `${tag}-n1`,
        rankingId: ids.cyL,
        restaurantId: rid.L,
      },
      { userId: ana, kind: 'cheers', dedupeKey: `${tag}-n2`, restaurantId: rid.L },
    ])
    await db.insert(vibeNotes).values([
      {
        userId: cy,
        restaurantId: rid.S as string,
        body: 'older',
        updatedAt: new Date('2026-01-01'),
      },
      {
        userId: cy,
        restaurantId: rid.L as string,
        body: 'newer',
        updatedAt: new Date('2026-06-01'),
      },
      { userId: ana, restaurantId: rid.L as string, body: 'ana note' },
      { userId: bo, restaurantId: rid.S as string, body: 'bo note' },
    ])
    await db.insert(savedPlaces).values([
      { userId: bo, restaurantId: rid.S as string },
      { userId: bo, restaurantId: rid.L as string },
      { userId: ana, restaurantId: rid.L as string },
    ])

    // A curated list holding both twins (S 1, F1 2, L 3, F2 4), and one holding only L.
    for (const slug of ['both', 'only']) {
      const [l] = await db
        .insert(lists)
        .values({ slug: `${tag}-${slug}`, title: slug })
        .returning({ id: lists.id })
      listIds.push(l?.id ?? '')
    }
    await db.insert(listItems).values([
      { listId: listIds[0] as string, restaurantId: rid.S as string, position: 1 },
      { listId: listIds[0] as string, restaurantId: rid.F1 as string, position: 2 },
      { listId: listIds[0] as string, restaurantId: rid.L as string, position: 3 },
      { listId: listIds[0] as string, restaurantId: rid.F2 as string, position: 4 },
      { listId: listIds[1] as string, restaurantId: rid.L as string, position: 1 },
    ])
    // A member's collections: one with both twins, one with only L.
    for (const name of ['c-both', 'c-only']) {
      const [c] = await db
        .insert(collections)
        .values({ userId: ana, name })
        .returning({ id: collections.id })
      collectionIds.push(c?.id ?? '')
    }
    await db.insert(collectionItems).values([
      { collectionId: collectionIds[0] as string, restaurantId: rid.S as string },
      { collectionId: collectionIds[0] as string, restaurantId: rid.L as string },
      { collectionId: collectionIds[1] as string, restaurantId: rid.L as string },
    ])
    // A member's dish lists: one with both twins (S 1, L 2, F1 3) — the collision in the MIDDLE — one with only L.
    for (const label of ['pizza', 'pasta']) {
      const [d] = await db
        .insert(dishLists)
        .values({ userId: ana, nameKey: `${tag}-${label}`, label })
        .returning({ id: dishLists.id })
      dishListIds.push(d?.id ?? '')
    }
    await db.insert(dishListItems).values([
      { listId: dishListIds[0] as string, restaurantId: rid.S, position: 1 },
      { listId: dishListIds[0] as string, restaurantId: rid.L, position: 2 },
      { listId: dishListIds[0] as string, restaurantId: rid.F1, position: 3 },
      { listId: dishListIds[1] as string, restaurantId: rid.L, position: 1 },
    ])
    // Plans: one that chose L and has L as an option (0-based positions), one with both twins
    // as options (S 0, L 1, F1 2), and a vote for L.
    for (const chosen of [rid.L, null]) {
      const [p] = await db
        .insert(plans)
        .values({ hostId: ana, startsAt: new Date(), chosenRestaurantId: chosen })
        .returning({ id: plans.id })
      planIds.push(p?.id ?? '')
    }
    await db.insert(planOptions).values([
      { planId: planIds[0] as string, restaurantId: rid.L, position: 0 },
      { planId: planIds[0] as string, restaurantId: rid.F1, position: 1 },
      { planId: planIds[1] as string, restaurantId: rid.S, position: 0 },
      { planId: planIds[1] as string, restaurantId: rid.L, position: 1 },
      { planId: planIds[1] as string, restaurantId: rid.F1, position: 2 },
    ])
    await db
      .insert(planInvites)
      .values({ planId: planIds[1] as string, userId: bo, voteRestaurantId: rid.L })
    await db.insert(events).values({
      slug: `${tag}-ev`,
      restaurantId: rid.L as string,
      title: 'Cata',
      startsAt: new Date(Date.now() + 86_400_000),
    })
    await db.insert(menuItems).values([
      { restaurantId: rid.L as string, section: 'Mains', name: 'A', position: 0 },
      { restaurantId: rid.L as string, section: 'Mains', name: 'B', position: 1 },
      { restaurantId: rid.L as string, section: 'Mains', name: 'C', position: 2 },
    ])

    reportA = await merge('S', 'L')
  })

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, users))
    for (const table of [lists]) await db.delete(table).where(inArray(table.id, listIds))
    await db.delete(plans).where(inArray(plans.id, planIds))
    const restaurantIds = Object.values(rid).filter(Boolean)
    if (restaurantIds.length > 0)
      await db.delete(restaurants).where(inArray(restaurants.id, restaurantIds))
    await db.delete(neighborhoods).where(inArray(neighborhoods.id, hoods))
  })

  describe('one merge, every collision', () => {
    test('the loser is gone and the survivor is still there', async () => {
      const left = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(inArray(restaurants.id, [rid.S as string, rid.L as string]))
      expect(left.map((r) => r.id)).toEqual([rid.S as string])
    })

    test("the survivor takes the loser's Google id, real pin, neighborhood and contacts — and keeps its photo", async () => {
      const [s] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, rid.S as string))
      expect(s).toMatchObject({
        googlePlaceId: `${tag}-gid`,
        lat: 18.4688,
        lng: -69.9374,
        geoPrecision: 'exact',
        neighborhoodId: hoods[1],
        phone: '+1 809-541-4101',
        website: 'https://real.example/',
        address: 'Calle Real 1',
        locality: 'Santo Domingo',
        priceTier: 3,
        coverImageId: 'photo-s',
        source: 'seed',
      })
      expect(s?.sourceRefreshedAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
      expect(reportA.adopted).toEqual(
        expect.arrayContaining(['googlePlaceId', 'lat', 'lng', 'phone']),
      )
    })

    test('a member who ranked only the loser now ranks the survivor, in the same slot', async () => {
      expect(await orderOf(ana)).toEqual([
        { restaurantId: rid.S, position: 1, score: scoreFor(0, 1) },
      ])
    })

    test('a member who ranked both keeps their BETTER entry, and their list is dense again', async () => {
      // cy: F1 1, S 2, F2 3, L 4 → the L entry is dropped; the list is rewritten 1..3
      expect(await orderOf(cy)).toEqual([
        { restaurantId: rid.F1, position: 1, score: scoreFor(0, 3) },
        { restaurantId: rid.S, position: 2, score: scoreFor(1, 3) },
        { restaurantId: rid.F2, position: 3, score: scoreFor(2, 3) },
      ])
      // di: L 1, F1 2, S 3 → L's entry is the better one, so it is the survivor's now
      expect(await orderOf(di)).toEqual([
        { restaurantId: rid.S, position: 1, score: scoreFor(0, 2) },
        { restaurantId: rid.F1, position: 2, score: scoreFor(1, 2) },
      ])
      expect(reportA.rankingsMerged).toBe(2)
    })

    test("the dropped ranking's dishes, comments, notifications and tags go to the kept one", async () => {
      const [dish] = await db
        .select()
        .from(dishes)
        .where(eq(dishes.id, ids.cyDish as string))
      expect(dish).toMatchObject({ rankingId: ids.cyS, restaurantId: rid.S })
      const [pasta] = await db
        .select()
        .from(dishes)
        .where(and(eq(dishes.userId, di), eq(dishes.name, 'Pasta')))
      expect(pasta?.rankingId).toBe(ids.diL)
      const comments = await db
        .select()
        .from(rankingComments)
        .where(eq(rankingComments.rankingId, ids.cyS as string))
      expect(comments.map((c) => c.body)).toEqual(['great'])
      const [n1] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.dedupeKey, `${tag}-n1`))
      expect(n1).toMatchObject({ rankingId: ids.cyS, restaurantId: rid.S })
      const [kept] = await db
        .select()
        .from(rankings)
        .where(eq(rankings.id, ids.cyS as string))
      expect(kept?.tags).toEqual(['Solo'])
    })

    test('a member who cheered both keeps one cheer; a cheer only on the dropped one moves', async () => {
      const onKept = await db
        .select()
        .from(cheers)
        .where(eq(cheers.rankingId, ids.cyS as string))
      expect(onKept.map((c) => c.userId).sort()).toEqual([ana, bo].sort())
    })

    test('the newer of two vibe notes survives; a lone note moves', async () => {
      const notes = await db.select().from(vibeNotes).where(inArray(vibeNotes.userId, users))
      const byUser = Object.fromEntries(notes.map((n) => [n.userId, [n.restaurantId, n.body]]))
      expect(byUser[cy]).toEqual([rid.S, 'newer'])
      expect(byUser[ana]).toEqual([rid.S, 'ana note'])
      expect(byUser[bo]).toEqual([rid.S, 'bo note'])
      expect(notes).toHaveLength(3)
    })

    test('saves collapse to one per member', async () => {
      const saves = await db.select().from(savedPlaces).where(inArray(savedPlaces.userId, users))
      expect(saves.map((s) => [s.userId, s.restaurantId]).sort()).toEqual(
        [
          [ana, rid.S],
          [bo, rid.S],
        ].sort(),
      )
    })

    test('a curated list holding both twins keeps one, at the better position, numbered dense', async () => {
      const items = await db
        .select()
        .from(listItems)
        .where(eq(listItems.listId, listIds[0] as string))
        .orderBy(listItems.position)
      expect(items.map((i) => [i.restaurantId, i.position])).toEqual([
        [rid.S, 1],
        [rid.F1, 2],
        [rid.F2, 3],
      ])
      const only = await db
        .select()
        .from(listItems)
        .where(eq(listItems.listId, listIds[1] as string))
      expect(only.map((i) => [i.restaurantId, i.position])).toEqual([[rid.S, 1]])
    })

    test('collections keep one entry per collection', async () => {
      const both = await db
        .select()
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionIds[0] as string))
      expect(both.map((i) => i.restaurantId)).toEqual([rid.S])
      const only = await db
        .select()
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionIds[1] as string))
      expect(only.map((i) => i.restaurantId)).toEqual([rid.S])
    })

    test('a dish list is renumbered 1-based, plan options 0-based', async () => {
      const dl = await db
        .select()
        .from(dishListItems)
        .where(eq(dishListItems.listId, dishListIds[0] as string))
        .orderBy(dishListItems.position)
      expect(dl.map((i) => [i.restaurantId, i.position])).toEqual([
        [rid.S, 1],
        [rid.F1, 2],
      ])
      const po = await db
        .select()
        .from(planOptions)
        .where(eq(planOptions.planId, planIds[1] as string))
        .orderBy(planOptions.position)
      expect(po.map((i) => [i.restaurantId, i.position])).toEqual([
        [rid.S, 0],
        [rid.F1, 1],
      ])
    })

    test('a plan that chose the loser, a vote for it, and its events point at the survivor', async () => {
      const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, planIds[0] as string))
      expect(plan?.chosenRestaurantId).toBe(rid.S)
      const [invite] = await db
        .select()
        .from(planInvites)
        .where(eq(planInvites.planId, planIds[1] as string))
      expect(invite?.voteRestaurantId).toBe(rid.S)
      const evs = await db
        .select()
        .from(events)
        .where(eq(events.slug, `${tag}-ev`))
      expect(evs.map((e) => e.restaurantId)).toEqual([rid.S])
    })

    test("the loser's menu comes across when the survivor had none", async () => {
      const items = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.restaurantId, rid.S as string))
      expect(items.map((i) => i.name).sort()).toEqual(['A', 'B', 'C'])
      expect(reportA.moved.menu_items).toBe(3)
    })

    test('nothing is left pointing at the loser', async () => {
      expect(Object.values(await attachedTo(db, rid.L as string)).every((n) => n === 0)).toBe(true)
    })
  })

  describe('the other branches', () => {
    test('a survivor that already has a menu keeps it; the photo comes across if it had none; no Google means no pin move', async () => {
      await restaurant('S2', { source: 'seed', lat: 18.5, lng: -69.9, cuisine: null })
      await restaurant('L2', {
        source: 'catalog',
        coverImageId: 'photo-l2',
        lat: 18.4,
        lng: -69.8,
        cuisine: 'Italian',
      })
      await db.insert(menuItems).values([
        { restaurantId: rid.S2 as string, section: 'Mains', name: 'Keep', position: 0 },
        { restaurantId: rid.L2 as string, section: 'Mains', name: 'Drop1', position: 0 },
        { restaurantId: rid.L2 as string, section: 'Mains', name: 'Drop2', position: 1 },
      ])
      await merge('S2', 'L2')
      const menu = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.restaurantId, rid.S2 as string))
      expect(menu.map((m) => m.name)).toEqual(['Keep'])
      const [s] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, rid.S2 as string))
      expect(s).toMatchObject({
        coverImageId: 'photo-l2',
        cuisine: 'Italian',
        lat: 18.5,
        lng: -69.9,
        googlePlaceId: null,
      })
    })

    test('a merge that fails partway changes nothing', async () => {
      await restaurant('S3', { source: 'seed' })
      await restaurant('L3', { source: 'catalog' })
      await rank(ana, 'L3', 2, 2)
      await rank(ana, 'S3', 1, 2)
      await expect(
        db.transaction(async (tx) => {
          await mergeInto(tx, rid.S3 as string, rid.L3 as string)
          throw new Error('roll back')
        }),
      ).rejects.toThrow('roll back')
      const left = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(inArray(restaurants.id, [rid.S3 as string, rid.L3 as string]))
      expect(left).toHaveLength(2)
      expect(
        (await orderOf(ana)).filter((r) => [rid.S3, rid.L3].includes(r.restaurantId)),
      ).toHaveLength(2)
    })

    test('refuses to merge a restaurant into itself', async () => {
      await expect(merge('S', 'S')).rejects.toThrow('itself')
    })
  })

  describe('removeRestaurant', () => {
    test("deletes the row and what is attached, and rewrites the affected member's list dense", async () => {
      await restaurant('R')
      await restaurant('R1')
      await restaurant('R2')
      await rank(bo, 'R1', 1, 3)
      await rank(bo, 'R', 2, 3)
      await rank(bo, 'R2', 3, 3)
      await db.insert(savedPlaces).values({ userId: cy, restaurantId: rid.R as string })
      await db
        .insert(menuItems)
        .values({ restaurantId: rid.R as string, section: 'Mains', name: 'X', position: 0 })

      const before = await attachedTo(db, rid.R as string)
      expect(before).toMatchObject({ rankings: 1, saved_places: 1, menu_items: 1 })
      const report = await db.transaction((tx) => removeRestaurant(tx, rid.R as string))
      expect(report.removed).toMatchObject({ rankings: 1, saved_places: 1, menu_items: 1 })

      expect(
        await db
          .select()
          .from(restaurants)
          .where(eq(restaurants.id, rid.R as string)),
      ).toHaveLength(0)
      // bo also ranks S from the merge scenario; only the R1/R2 slots are asserted, dense and rescored
      const mine = await db
        .select()
        .from(rankings)
        .where(eq(rankings.userId, bo))
        .orderBy(rankings.position)
      expect(mine.map((r) => r.position)).toEqual(mine.map((_, i) => i + 1))
      expect(mine.map((r) => r.restaurantId)).not.toContain(rid.R)
      expect(mine.map((r) => r.score)).toEqual(mine.map((_, i) => scoreFor(i, mine.length)))
    })
  })
})
