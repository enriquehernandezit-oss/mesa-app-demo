import { describe, expect, test } from 'bun:test'

import { sdHour, sdLocalNow, sdMidnight, tonightLateWindow } from './sdTime'

// Santo Domingo is UTC-4 all year. 2026-09-30T20:00Z is 4:00 PM there.
const iso = (d: Date) => d.toISOString()

describe('sdHour / sdMidnight', () => {
  test('reads Santo Domingo wall-clock', () => {
    expect(sdHour(new Date('2026-09-30T20:00:00Z'))).toBe(16)
    expect(sdHour(new Date('2026-09-30T03:59:00Z'))).toBe(23) // still Sep 29 evening there
    expect(sdHour(new Date('2026-09-30T04:00:00Z'))).toBe(0)
  })
  test('SD midnight is 04:00 UTC', () => {
    expect(iso(sdMidnight(sdLocalNow(new Date('2026-09-30T20:00:00Z')), 0))).toBe(
      '2026-09-30T04:00:00.000Z',
    )
    expect(iso(sdMidnight(sdLocalNow(new Date('2026-09-30T20:00:00Z')), 1))).toBe(
      '2026-10-01T04:00:00.000Z',
    )
  })
})

describe('tonightLateWindow', () => {
  test('in the evening: today at midnight until 4 AM tomorrow', () => {
    const w = tonightLateWindow(new Date('2026-09-30T20:00:00Z')) // 4 PM Sep 30
    expect(iso(w.start)).toBe('2026-09-30T04:00:00.000Z') // Sep 30 00:00 SD
    expect(iso(w.end)).toBe('2026-10-01T08:00:00.000Z') // Oct 1 04:00 SD
  })

  test('after midnight it is still last night', () => {
    const w = tonightLateWindow(new Date('2026-09-30T06:30:00Z')) // 2:30 AM Sep 30
    expect(iso(w.start)).toBe('2026-09-29T04:00:00.000Z') // Sep 29 00:00 SD
    expect(iso(w.end)).toBe('2026-09-30T08:00:00.000Z') // Sep 30 04:00 SD — a 1 AM set counts
  })

  test('at 4 AM sharp a new night begins', () => {
    const w = tonightLateWindow(new Date('2026-09-30T08:00:00Z')) // 4:00 AM Sep 30
    expect(iso(w.start)).toBe('2026-09-30T04:00:00.000Z')
    expect(iso(w.end)).toBe('2026-10-01T08:00:00.000Z')
  })

  test('always contains now', () => {
    for (let h = 0; h < 24; h++) {
      const now = new Date(Date.UTC(2026, 8, 30, h, 17))
      const w = tonightLateWindow(now)
      expect(w.start.getTime()).toBeLessThanOrEqual(now.getTime())
      expect(w.end.getTime()).toBeGreaterThan(now.getTime())
    }
  })
})
