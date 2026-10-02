import { describe, expect, test } from 'bun:test'

import { buildFeedRows } from './feedRows'
import { dayPart } from './greeting'

const item = (n: number) => ({
  rankingId: `r${n}`,
  // r1 is the newest: 2026-09-29T12:00, one hour older per step
  rankedAt: new Date(Date.UTC(2026, 8, 29, 12 - n, 0, 0)).toISOString(),
})
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1))
const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))
const types = (rows: { type: string }[]) => rows.map((r) => r.type)

describe('buildFeedRows', () => {
  test('cards only when there is nothing else to add', () => {
    const rows = buildFeedRows({ items: items(3), people: [], seenAt: null, shelves: true })
    expect(types(rows)).toEqual(['card', 'card', 'card'])
  })

  test('a shelf follows every 6th card, drawing three new people each time', () => {
    const rows = buildFeedRows({ items: items(13), people: people(7), seenAt: null, shelves: true })
    const shelves = rows.filter((r) => r.type === 'shelf')
    expect(shelves).toHaveLength(2)
    expect(rows[6]?.type).toBe('shelf') // after card 6
    expect(rows[13]?.type).toBe('shelf') // after card 12
    const [a, b] = shelves
    expect(a?.type === 'shelf' && a.people.map((p) => p.id)).toEqual(['p0', 'p1', 'p2'])
    expect(b?.type === 'shelf' && b.people.map((p) => p.id)).toEqual(['p3', 'p4', 'p5'])
  })

  test('no shelf once the suggestions run out, or with only one left', () => {
    const rows = buildFeedRows({ items: items(18), people: people(7), seenAt: null, shelves: true })
    // shelf 0 (3), shelf 1 (3), the third would have a single person → skipped
    expect(rows.filter((r) => r.type === 'shelf')).toHaveLength(2)
  })

  test('the Friends view never has a shelf', () => {
    const rows = buildFeedRows({
      items: items(12),
      people: people(9),
      seenAt: null,
      shelves: false,
    })
    expect(rows.some((r) => r.type === 'shelf')).toBe(false)
  })

  test('the caught-up divider goes before the first already-seen ranking', () => {
    // seen through r3's time: r1 and r2 are new, r3 onward is old
    const rows = buildFeedRows({
      items: items(5),
      people: [],
      seenAt: item(3).rankedAt,
      shelves: false,
    })
    expect(types(rows)).toEqual(['card', 'card', 'caught_up', 'card', 'card', 'card'])
  })

  test('nothing new: the divider leads the list', () => {
    const rows = buildFeedRows({
      items: items(3),
      people: [],
      seenAt: item(1).rankedAt,
      shelves: false,
    })
    expect(types(rows)).toEqual(['caught_up', 'card', 'card', 'card'])
  })

  test('everything loaded is new: no divider yet (the boundary is on a later page)', () => {
    const rows = buildFeedRows({
      items: items(3),
      people: [],
      seenAt: '2020-01-01T00:00:00.000Z',
      shelves: false,
    })
    expect(rows.some((r) => r.type === 'caught_up')).toBe(false)
  })

  test('first visit (no watermark): no divider', () => {
    const rows = buildFeedRows({ items: items(4), people: [], seenAt: null, shelves: true })
    expect(rows.some((r) => r.type === 'caught_up')).toBe(false)
  })

  test('"New near you" follows the first six cards, after the People shelf', () => {
    const rows = buildFeedRows({
      items: items(8),
      people: people(3),
      seenAt: null,
      shelves: true,
      nearYou: true,
    })
    expect(types(rows)).toEqual([...Array(6).fill('card'), 'shelf', 'new_near_you', 'card', 'card'])
  })

  test('"New near you" goes at the end of a feed shorter than six, and never on an empty one', () => {
    const short = buildFeedRows({
      items: items(3),
      people: [],
      seenAt: null,
      shelves: true,
      nearYou: true,
    })
    expect(types(short)).toEqual(['card', 'card', 'card', 'new_near_you'])
    const none = buildFeedRows({
      items: [],
      people: [],
      seenAt: null,
      shelves: true,
      nearYou: true,
    })
    expect(none).toEqual([])
  })

  test('"New near you" shows once, and only when asked for', () => {
    const long = buildFeedRows({
      items: items(14),
      people: [],
      seenAt: null,
      shelves: true,
      nearYou: true,
    })
    expect(long.filter((r) => r.type === 'new_near_you')).toHaveLength(1)
    const off = buildFeedRows({ items: items(8), people: [], seenAt: null, shelves: true })
    expect(off.some((r) => r.type === 'new_near_you')).toBe(false)
  })
})

describe('buildFeedRows — Events this week', () => {
  const events = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }))
  const build = (cards: number, evs: number, extra: { people?: number; nearYou?: boolean } = {}) =>
    buildFeedRows({
      items: items(cards),
      people: people(extra.people ?? 0),
      events: events(evs),
      seenAt: null,
      shelves: true,
      nearYou: extra.nearYou,
    })

  test('one shelf after the third card, halfway between People shelves', () => {
    const rows = build(13, 3, { people: 7 })
    expect(types(rows)).toEqual([
      ...Array(3).fill('card'),
      'events_shelf', // after card 3
      ...Array(3).fill('card'),
      'shelf', // after card 6 — People
      ...Array(6).fill('card'),
      'shelf', // after card 12 — People
      'card',
    ])
    const shelf = rows[3]
    expect(shelf?.type === 'events_shelf' && shelf.events.map((e) => e.id)).toEqual([
      'e0',
      'e1',
      'e2',
    ])
  })

  test('a busy week gets another shelf with the NEXT events, never the same card twice', () => {
    const rows = build(10, 8)
    const shelves = rows.filter((r) => r.type === 'events_shelf')
    expect(shelves.map((r) => r.key)).toEqual(['events:0', 'events:1'])
    const [a, b] = shelves
    expect(a?.type === 'events_shelf' && a.events.map((e) => e.id)).toEqual([
      'e0',
      'e1',
      'e2',
      'e3',
      'e4',
      'e5',
    ])
    expect(b?.type === 'events_shelf' && b.events.map((e) => e.id)).toEqual(['e6', 'e7'])
    expect(rows[3]?.type).toBe('events_shelf') // after card 3
    expect(rows[10]?.type).toBe('events_shelf') // after card 9 (row 10: card 3 + shelf + 6 more)
  })

  test('before "New near you": the first six cards run card×3, Events, card×3, People, New near you', () => {
    const rows = build(7, 2, { people: 3, nearYou: true })
    expect(types(rows)).toEqual([
      ...Array(3).fill('card'),
      'events_shelf',
      ...Array(3).fill('card'),
      'shelf',
      'new_near_you',
      'card',
    ])
  })

  test('a feed shorter than three cards gets it at the end, ahead of "New near you"', () => {
    expect(types(build(2, 2, { nearYou: true }))).toEqual([
      'card',
      'card',
      'events_shelf',
      'new_near_you',
    ])
    // three to five cards reach the slot itself
    expect(types(build(4, 1, { nearYou: true }))).toEqual([
      'card',
      'card',
      'card',
      'events_shelf',
      'card',
      'new_near_you',
    ])
  })

  test('no events, no shelf; nothing on an empty feed; nothing on the Friends view', () => {
    expect(build(8, 0).some((r) => r.type === 'events_shelf')).toBe(false)
    expect(build(0, 4)).toEqual([])
    const friends = buildFeedRows({
      items: items(8),
      people: [],
      events: events(4),
      seenAt: null,
      shelves: false,
    })
    expect(friends.some((r) => r.type === 'events_shelf')).toBe(false)
  })
})

describe('dayPart', () => {
  const at = (h: number) => new Date(2026, 8, 29, h, 0, 0)
  test('morning, afternoon, evening', () => {
    expect(dayPart(at(5))).toBe('morning')
    expect(dayPart(at(11))).toBe('morning')
    expect(dayPart(at(12))).toBe('afternoon')
    expect(dayPart(at(17))).toBe('afternoon')
    expect(dayPart(at(18))).toBe('evening')
    expect(dayPart(at(23))).toBe('evening')
    expect(dayPart(at(2))).toBe('evening')
  })
})
