import { describe, expect, test } from 'bun:test'

import {
  hoursColumns,
  normalizePeriods,
  openStatus,
  sdMinuteOfWeek,
  toMultirange,
  weekRanges,
} from './openingHours'

// Monday 2026-10-05 is a Monday. Santo Domingo is UTC-4, so 20:00 there is 00:00 UTC the next day.
const sd = (iso: string) => new Date(`${iso}-04:00`)
const p = (od: number, oh: number, cd: number, ch: number, om = 0, cm = 0) => ({
  open: { day: od, hour: oh, minute: om },
  close: { day: cd, hour: ch, minute: cm },
})

describe('weekRanges', () => {
  test('a same-day period is one range', () => {
    expect(weekRanges([p(1, 12, 1, 15)])).toEqual([[1440 + 720, 1440 + 900]])
  })

  test('a period past midnight runs into the next day', () => {
    // Friday 18:00 → Saturday 02:00
    expect(weekRanges([p(5, 18, 6, 2)])).toEqual([[5 * 1440 + 1080, 6 * 1440 + 120]])
  })

  test('Saturday night past midnight wraps to Sunday morning', () => {
    expect(weekRanges([p(6, 20, 0, 2)])).toEqual([
      [0, 120],
      [6 * 1440 + 1200, 10080],
    ])
  })

  test('open around the clock', () => {
    expect(weekRanges([{ open: { day: 0, hour: 0, minute: 0 } }])).toEqual([[0, 10080]])
  })
})

describe('toMultirange / hoursColumns', () => {
  test('a Postgres multirange literal', () => {
    expect(
      toMultirange([
        [0, 120],
        [8400, 10080],
      ]),
    ).toBe('{[0,120),[8400,10080)}')
  })
  test('no hours clear both columns', () => {
    expect(hoursColumns(null)).toEqual({ openingHours: null, openMinutes: null })
  })
})

describe('normalizePeriods', () => {
  test("keeps Google's numbers and drops what it cannot read", () => {
    expect(
      normalizePeriods([
        { open: { day: 1, hour: 12 }, close: { day: 1, hour: 23, minute: 30 } },
        { close: { day: 2, hour: 1 } },
      ]),
    ).toEqual([{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 23, minute: 30 } }])
    expect(normalizePeriods(undefined)).toBeNull()
    expect(normalizePeriods([])).toBeNull()
  })
})

describe('openStatus', () => {
  // Mon–Sat 12:00–00:00 (closes at midnight, which Google writes as the next day 00:00), closed Sunday.
  const week = [1, 2, 3, 4, 5, 6].map((d) => p(d, 12, (d + 1) % 7, 0))

  test('Santo Domingo minute of the week', () => {
    expect(sdMinuteOfWeek(sd('2026-10-05T20:30:00'))).toBe(1440 + 20 * 60 + 30)
  })

  test('open now, closing at midnight', () => {
    expect(openStatus(week, sd('2026-10-05T20:30:00'))).toEqual({
      open: true,
      closesAt: { day: 2, time: '00:00' },
    })
  })

  test('closed in the morning, opening at noon the same day', () => {
    expect(openStatus(week, sd('2026-10-06T09:00:00'))).toEqual({
      open: false,
      opensAt: { day: 2, time: '12:00' },
    })
  })

  test('closed on Sunday, opening Monday — across the week boundary', () => {
    expect(openStatus(week, sd('2026-10-04T15:00:00'))).toEqual({
      open: false,
      opensAt: { day: 1, time: '12:00' },
    })
  })

  test('Saturday night past midnight is still open on Sunday at 1 AM', () => {
    const late = [p(6, 20, 0, 3)]
    expect(openStatus(late, sd('2026-10-04T01:00:00'))).toEqual({
      open: true,
      closesAt: { day: 0, time: '03:00' },
    })
    // and on Saturday at 23:00 it closes Sunday 03:00, not "Saturday midnight"
    expect(openStatus(late, sd('2026-10-03T23:00:00'))).toEqual({
      open: true,
      closesAt: { day: 0, time: '03:00' },
    })
  })

  test('around the clock, and no hours at all', () => {
    expect(openStatus([{ open: { day: 0, hour: 0, minute: 0 } }])).toEqual({
      open: true,
      closesAt: null,
    })
    expect(openStatus(null)).toBeNull()
  })
})
