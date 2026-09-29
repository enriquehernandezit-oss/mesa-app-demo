import { describe, expect, test } from 'bun:test'

import {
  CHEER_WEIGHT,
  type PopularAgg,
  PRIOR_WEIGHT,
  SAVE_WEIGHT,
  cityMean,
  encodeCursor,
  momentum,
  pageAfter,
  parseCursor,
  quality,
  rankPopular,
} from './popular'

// A place, with sensible defaults: ranked by 5 people at 90, one new ranking this week.
const agg = (id: string, over: Partial<PopularAgg> = {}): PopularAgg => ({
  id,
  rankers: 5,
  sumScore: 450,
  weekRankings: 1,
  weekWeight: 0.9,
  saves: 0,
  cheers: 0,
  ...over,
})
const ids = (entries: { agg: { id: string } }[]) => entries.map((e) => e.agg.id)

describe('cityMean and quality', () => {
  test("the city mean is every ranking's average, not the average of averages", () => {
    // 2 people at 100 and 8 at 50 → (200 + 400) / 10 = 60.
    expect(
      cityMean([
        { rankers: 2, sumScore: 200 },
        { rankers: 8, sumScore: 400 },
      ]),
    ).toBe(60)
    expect(cityMean([])).toBe(75)
  })

  test('a few rankers are pulled toward the city mean, many are left alone', () => {
    // 3 people at 100, city at 80 → (300 + 5·80) / 8 = 87.5.
    expect(quality({ rankers: 3, sumScore: 300 }, 80)).toBe(87.5)
    // 200 people at 90 barely move: (18000 + 400) / 205.
    expect(quality({ rankers: 200, sumScore: 18000 }, 80)).toBeCloseTo(89.76, 2)
    expect(PRIOR_WEIGHT).toBe(5)
  })
})

describe('momentum', () => {
  test('rankings count in full, a save and a cheer add a little', () => {
    expect(momentum({ weekWeight: 2, saves: 0, cheers: 0 })).toBe(2)
    expect(momentum({ weekWeight: 2, saves: 2, cheers: 4 })).toBe(
      2 + 2 * SAVE_WEIGHT + 4 * CHEER_WEIGHT,
    )
  })
})

describe('rankPopular', () => {
  test('needs three rankers, and a new ranking this week for the week list', () => {
    const list = rankPopular(
      [
        agg('ok'),
        agg('tiny', { rankers: 2, sumScore: 180 }),
        agg('quiet', { weekRankings: 0, weekWeight: 0 }),
      ],
      80,
    )
    // "tiny" never appears; "quiet" is eligible but has no week, so it is in the tail.
    expect(ids(list)).toEqual(['ok', 'quiet'])
    expect(list.map((e) => e.phase)).toEqual(['week', 'all'])
  })

  test('more momentum wins, and quality breaks a near tie', () => {
    const list = rankPopular(
      [
        agg('busy', { weekWeight: 3, rankers: 9, sumScore: 810 }),
        agg('calm', { weekWeight: 1 }),
        // Same momentum as "calm" but better loved.
        agg('calm-loved', { weekWeight: 1, sumScore: 480 }),
      ],
      85,
    )
    expect(ids(list)).toEqual(['busy', 'calm-loved', 'calm'])
  })

  test('saves and cheers lift a place above one with only a ranking', () => {
    const list = rankPopular([agg('plain'), agg('loved', { saves: 4, cheers: 4 })], 85)
    expect(ids(list)).toEqual(['loved', 'plain'])
  })

  test('a small sample of perfect scores does not beat a well-known great place', () => {
    const list = rankPopular(
      [
        agg('three-tens', { rankers: 3, sumScore: 300, weekWeight: 1 }),
        agg('known', { rankers: 300, sumScore: 27000, weekWeight: 1 }),
      ],
      75,
    )
    // three-tens quality = (300 + 375)/8 = 84.4; known = (27000 + 375)/305 = 89.8.
    expect(ids(list)).toEqual(['known', 'three-tens'])
  })

  test('only the top N make the week list; the rest follow by quality', () => {
    const many = [
      agg('a', { weekWeight: 3 }),
      agg('b', { weekWeight: 2 }),
      agg('c', { weekWeight: 1, sumScore: 500 }), // best loved, least momentum
      agg('quiet-great', { weekRankings: 0, weekWeight: 0, sumScore: 490 }),
    ]
    const list = rankPopular(many, 85, 2)
    expect(ids(list)).toEqual(['a', 'b', 'c', 'quiet-great'])
    expect(list.map((e) => e.phase)).toEqual(['week', 'week', 'all', 'all'])
    // The tail is by quality: c (500) before quiet-great (490), though c had less momentum.
  })

  test('ties fall to the id, so the order never flickers', () => {
    const list = rankPopular([agg('b'), agg('a'), agg('c')], 85)
    expect(ids(list)).toEqual(['a', 'b', 'c'])
  })
})

describe('paging', () => {
  const ASOF = Date.UTC(2026, 8, 30, 12)
  const entries = rankPopular(
    Array.from({ length: 7 }, (_, i) => agg(`p${i}`, { weekWeight: 7 - i })),
    85,
  )

  test('pages of a size, each ending with a cursor until the last', () => {
    const one = pageAfter(entries, null, ASOF, 3)
    expect(ids(one.page)).toEqual(['p0', 'p1', 'p2'])
    const two = pageAfter(entries, parseCursor(one.next!), ASOF, 3)
    expect(ids(two.page)).toEqual(['p3', 'p4', 'p5'])
    const three = pageAfter(entries, parseCursor(two.next!), ASOF, 3)
    expect(ids(three.page)).toEqual(['p6'])
    expect(three.next).toBeNull()
  })

  test('exactly a full last page has no cursor', () => {
    expect(pageAfter(entries, null, ASOF, 7).next).toBeNull()
  })

  test('a cursor holds its place even if that place has left the list', () => {
    const one = pageAfter(entries, null, ASOF, 3)
    const without = entries.filter((e) => e.agg.id !== 'p2')
    expect(ids(pageAfter(without, parseCursor(one.next!), ASOF, 3).page)).toEqual([
      'p3',
      'p4',
      'p5',
    ])
  })

  test('a cursor crosses from the week list into the all-time tail', () => {
    const list = rankPopular(
      [agg('w1'), agg('w2'), agg('t1', { weekRankings: 0, weekWeight: 0 })],
      85,
    )
    const one = pageAfter(list, null, ASOF, 2)
    expect(ids(one.page)).toEqual(['w1', 'w2'])
    expect(ids(pageAfter(list, parseCursor(one.next!), ASOF, 2).page)).toEqual(['t1'])
  })

  test('a cursor round-trips with the moment it was scored, and junk is refused', () => {
    const c = { phase: 'all' as const, key: 87.53125, id: 'abc-123', asOf: ASOF }
    expect(parseCursor(encodeCursor(c))).toEqual(c)
    // ...and the next cursor carries the same moment forward.
    expect(parseCursor(pageAfter(entries, null, ASOF, 3).next!)?.asOf).toBe(ASOF)
    for (const bad of [
      '',
      'x:1:9:id',
      'w::9:id',
      'w:nan:9:id',
      'w:1:9:',
      'w:1:id',
      'w:1:0:id',
      'w',
      'garbage',
    ])
      expect(parseCursor(bad)).toBeNull()
  })
})
