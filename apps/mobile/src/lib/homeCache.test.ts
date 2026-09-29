import { describe, expect, test } from 'bun:test'

import { msUntilHomeRefresh } from './homeCache'

const HOUR = 60 * 60 * 1000

describe('msUntilHomeRefresh', () => {
  test('before 5 AM Santo Domingo it waits for the same morning', () => {
    // 03:00 SD = 07:00 UTC → two hours to go.
    expect(msUntilHomeRefresh(new Date('2026-09-29T07:00:00Z'))).toBe(2 * HOUR)
  })

  test('after 5 AM it waits for tomorrow morning', () => {
    // 21:00 SD = 01:00 UTC the next day → eight hours to 09:00 UTC.
    expect(msUntilHomeRefresh(new Date('2026-09-30T01:00:00Z'))).toBe(8 * HOUR)
    // 05:00 SD sharp is already the new day: a full 24 hours.
    expect(msUntilHomeRefresh(new Date('2026-09-29T09:00:00Z'))).toBe(24 * HOUR)
  })

  test('crosses a month end', () => {
    expect(msUntilHomeRefresh(new Date('2026-09-30T20:00:00Z'))).toBe(13 * HOUR)
  })
})
