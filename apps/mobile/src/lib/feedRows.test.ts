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
