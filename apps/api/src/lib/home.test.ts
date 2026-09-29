import { describe, expect, test } from 'bun:test'

import {
  HOOD_BOOST,
  MAX_PER_CUISINE,
  MAX_PER_HOOD,
  SAVED_HEAD_START,
  SIX,
  type SixCandidate,
  closesLate,
  friendSignal,
  pickTonight,
  rankSix,
  recencyDecay,
  selectTonight,
  sixReason,
  sixScore,
} from './home'

const friend = (over: Partial<SixCandidate['friends'][number]> = {}) => ({
  name: 'Diego',
  score: 90,
  ageDays: 0,
  match: 100,
  ...over,
})
let n = 0
const cand = (over: Partial<SixCandidate> = {}): SixCandidate => ({
  id: `c${String(++n).padStart(3, '0')}`,
  cuisine: null,
  neighborhoodId: `h${n}`,
  hasPhoto: true,
  closesAt: null,
  saved: false,
  ownHood: false,
  friends: [friend()],
  trending: 0,
  ...over,
})

describe('friendSignal', () => {
  test('a fresh 9.0 from a perfect match is 9', () => {
    expect(friendSignal(90, 0, 100)).toBeCloseTo(9, 6)
  })
  test('halves every week', () => {
    expect(recencyDecay(7)).toBeCloseTo(0.5, 6)
    expect(recencyDecay(14)).toBeCloseTo(0.25, 6)
    expect(friendSignal(90, 7, 100)).toBeCloseTo(4.5, 6)
  })
  test('taste scales it: 100% full, unknown and 50% three-quarters, 0% half', () => {
    expect(friendSignal(80, 0, 100)).toBeCloseTo(8, 6)
    expect(friendSignal(80, 0, null)).toBeCloseTo(6, 6)
    expect(friendSignal(80, 0, 50)).toBeCloseTo(6, 6)
    expect(friendSignal(80, 0, 0)).toBeCloseTo(4, 6)
  })
})

describe('closesLate', () => {
  test('11p and after midnight are late; 10p and unknown are not', () => {
    for (const v of ['11p', '12a', '1a', '2a', '11P']) expect(closesLate(v)).toBe(true)
    for (const v of ['10p', '9p', '', null, undefined, 'late', '13a', '0a']) {
      expect(closesLate(v)).toBe(false)
    }
  })
})

describe('sixScore', () => {
  test('friends add up; a saved place with no friends starts at the head start', () => {
    const two = cand({ friends: [friend(), friend({ name: 'Lucía' })] })
    expect(sixScore(two, 12)).toBeCloseTo(18, 6)
    expect(sixScore(cand({ saved: true, friends: [] }), 12)).toBe(SAVED_HEAD_START)
  })
  test('a friend ranking a place you saved is worth more than either alone', () => {
    const both = sixScore(cand({ saved: true }), 12)
    expect(both).toBeGreaterThan(sixScore(cand({ saved: true, friends: [] }), 12))
    expect(both).toBeGreaterThan(sixScore(cand(), 12))
  })
  test('own neighborhood, late-open after 5 PM, and no photo nudge it', () => {
    const base = sixScore(cand({ closesAt: '1a' }), 12)
    expect(sixScore(cand({ ownHood: true, closesAt: '1a' }), 12)).toBeCloseTo(base * HOOD_BOOST, 6)
    expect(sixScore(cand({ closesAt: '1a' }), 18)).toBeGreaterThan(base)
    expect(sixScore(cand({ hasPhoto: false }), 12)).toBeLessThan(sixScore(cand(), 12))
  })
})

describe('rankSix', () => {
  test('best first, at most six', () => {
    const list = Array.from({ length: 9 }, (_, i) => cand({ friends: [friend({ score: 70 + i })] }))
    const six = rankSix(list, 12)
    expect(six).toHaveLength(SIX)
    expect(six[0]!.candidate.id).toBe(list[8]!.id)
  })

  test('at most two from one cuisine and three from one neighborhood', () => {
    const list = [
      ...Array.from({ length: 5 }, (_, i) =>
        cand({ cuisine: 'Italian', friends: [friend({ score: 96 - i })] }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        cand({ neighborhoodId: 'piantini', friends: [friend({ score: 80 - i })] }),
      ),
    ]
    const six = rankSix(list, 12).map((x) => x.candidate)
    expect(six.filter((c) => c.cuisine === 'Italian').length).toBeLessThanOrEqual(MAX_PER_CUISINE)
    expect(six.filter((c) => c.neighborhoodId === 'piantini').length).toBeLessThanOrEqual(
      MAX_PER_HOOD,
    )
  })

  test('cuisine caps ignore case, and a place with no cuisine is never capped', () => {
    const list = [
      cand({ cuisine: 'italian', friends: [friend({ score: 96 })] }),
      cand({ cuisine: 'Italian', friends: [friend({ score: 95 })] }),
      cand({ cuisine: 'ITALIAN', friends: [friend({ score: 94 })] }),
      ...Array.from({ length: 4 }, () => cand({ friends: [friend({ score: 60 })] })),
    ]
    const six = rankSix(list, 12).map((x) => x.candidate)
    expect(six.filter((c) => c.cuisine?.toLowerCase() === 'italian')).toHaveLength(2)
    expect(six.filter((c) => c.cuisine === null)).toHaveLength(4)
  })

  test('a saved place makes the six even when friends outscore it', () => {
    const strong = Array.from({ length: 8 }, () => cand({ friends: [friend({ score: 96 })] }))
    const quiet = cand({ saved: true, friends: [] })
    const six = rankSix([...strong, quiet], 12).map((x) => x.candidate.id)
    expect(six).toContain(quiet.id)
    expect(six).toHaveLength(SIX)
  })

  test('the saved place holds its slot against the caps, too', () => {
    const list = [
      ...Array.from({ length: 4 }, () => cand({ neighborhoodId: 'naco', friends: [friend()] })),
      cand({ neighborhoodId: 'naco', saved: true, friends: [] }),
    ]
    const six = rankSix(list, 12).map((x) => x.candidate)
    expect(six.some((c) => c.saved)).toBe(true)
    expect(six.filter((c) => c.neighborhoodId === 'naco').length).toBeLessThanOrEqual(MAX_PER_HOOD)
  })

  test('citywide trending only fills what is left', () => {
    const mine = [cand(), cand()]
    const crowd = Array.from({ length: 8 }, () => cand({ friends: [], trending: 5 }))
    const six = rankSix([...mine, ...crowd], 12)
    expect(six).toHaveLength(SIX)
    expect(six.slice(0, 2).map((x) => x.candidate.id)).toEqual(
      expect.arrayContaining(mine.map((c) => c.id)),
    )
    expect(six.slice(2).every((x) => x.reason.kind === 'trending')).toBe(true)
  })

  test('with six of their own, the crowd never appears', () => {
    const mine = Array.from({ length: 6 }, () => cand({ friends: [friend({ score: 60 })] }))
    const crowd = Array.from({ length: 4 }, () => cand({ friends: [], trending: 9 }))
    const six = rankSix([...mine, ...crowd], 12)
    expect(six.every((x) => x.reason.kind !== 'trending')).toBe(true)
  })

  test('nothing to show is an empty six, not an error', () => {
    expect(rankSix([], 12)).toEqual([])
  })

  test('deterministic: equal scores fall to the id', () => {
    const a = cand()
    const b = cand()
    expect(rankSix([b, a], 12).map((x) => x.candidate.id)).toEqual([a.id, b.id])
  })
})

describe('sixReason', () => {
  test('names the friend whose signal is strongest, and counts the rest', () => {
    const c = cand({
      friends: [friend({ name: 'Old', ageDays: 12 }), friend({ name: 'Fresh', score: 88 })],
    })
    expect(sixReason(c)).toEqual({ kind: 'friend', name: 'Fresh', score: 88, more: 1 })
  })
  test('saved and friends, saved alone, and the crowd', () => {
    expect(sixReason(cand({ saved: true, friends: [friend(), friend()] }))).toEqual({
      kind: 'saved_friends',
      count: 2,
    })
    expect(sixReason(cand({ saved: true, friends: [] }))).toEqual({ kind: 'saved' })
    expect(sixReason(cand({ friends: [], trending: 3 }))).toEqual({ kind: 'trending' })
  })
})

describe('selectTonight', () => {
  const now = new Date('2026-09-30T00:30:00.000Z')
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000)
  let k = 0
  const ev = (startsInMin: number, over: { going?: number; saved?: boolean } = {}) => ({
    id: `e${String(++k).padStart(2, '0')}`,
    startsAt: at(startsInMin),
    friendsGoing: Array.from({ length: over.going ?? 0 }, () => ({})),
    savedByMe: over.saved ?? false,
  })

  test('friends going, then on now, then soonest, then saved', () => {
    const soon = ev(60)
    const later = ev(240)
    const live = ev(-30)
    const withFriends = ev(300, { going: 2 })
    const savedTie = ev(60, { saved: true })
    const order = selectTonight([later, soon, live, withFriends, savedTie], now).map((e) => e.id)
    expect(order).toEqual([withFriends.id, live.id, savedTie.id, soon.id, later.id])
  })

  test('at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ev(30 + i * 10))
    expect(selectTonight(many, now)).toHaveLength(5)
  })

  test('no events, no card', () => {
    expect(selectTonight([], now)).toEqual([])
  })
})

describe('pickTonight', () => {
  const row = (restaurantId: string, userId: string, score: number, closesAt: string | null) => ({
    restaurantId,
    userId,
    userName: userId,
    score,
    closesAt,
  })

  test('the highest friend score among places open late', () => {
    const pick = pickTonight(
      [row('a', 'u1', 88, '1a'), row('b', 'u2', 95, '10p'), row('c', 'u3', 91, '12a')],
      new Set(),
    )
    expect(pick?.row.restaurantId).toBe('c') // b scores higher but closes at 10p
  })

  test('skips places already in the six', () => {
    const pick = pickTonight([row('a', 'u1', 95, '1a'), row('b', 'u2', 80, '1a')], new Set(['a']))
    expect(pick?.row.restaurantId).toBe('b')
  })

  test('a tie goes to the place more friends ranked, and counts each friend once', () => {
    const pick = pickTonight(
      [
        row('a', 'u1', 90, '1a'),
        row('b', 'u2', 90, '1a'),
        row('b', 'u3', 70, '1a'),
        row('a', 'u1', 60, '1a'),
      ],
      new Set(),
    )
    expect(pick?.row.restaurantId).toBe('b')
    expect(pick?.friendCount).toBe(2)
  })

  test('nothing qualifies → null', () => {
    expect(pickTonight([row('a', 'u1', 95, '9p')], new Set())).toBeNull()
    expect(pickTonight([], new Set())).toBeNull()
  })
})
