import { describe, expect, test } from 'bun:test'

import { scoreFor } from './score'

describe('scoreFor', () => {
  test('single-item list scores 95', () => {
    expect(scoreFor(0, 1)).toBe(95)
  })

  test('top of a list scores 96', () => {
    expect(scoreFor(0, 10)).toBe(96)
  })

  test('bottom of a list scores 72', () => {
    expect(scoreFor(9, 10)).toBe(72)
  })

  test('monotonic non-increasing with index, for a range of list sizes', () => {
    for (const total of [2, 3, 5, 10, 30, 100]) {
      let prev = Number.POSITIVE_INFINITY
      for (let i = 0; i < total; i++) {
        const s = scoreFor(i, total)
        expect(s).toBeLessThanOrEqual(prev)
        prev = s
      }
    }
  })

  test('always within [72, 96] for total > 1', () => {
    for (const total of [2, 3, 7, 40]) {
      for (let i = 0; i < total; i++) {
        const s = scoreFor(i, total)
        expect(s).toBeGreaterThanOrEqual(72)
        expect(s).toBeLessThanOrEqual(96)
      }
    }
  })
})
