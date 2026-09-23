import { describe, expect, test } from 'bun:test'

import {
  CHEER_WEIGHT,
  dishScore,
  FREQUENCY_WEIGHT,
  RECENT_30D_BONUS,
  RECENT_7D_BONUS,
} from './dishes'

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

describe('dishScore', () => {
  test('a like outweighs a repeat post, per their stated weights', () => {
    expect(dishScore(1, 0, daysAgo(60))).toBe(CHEER_WEIGHT)
    expect(dishScore(0, 1, daysAgo(60))).toBe(FREQUENCY_WEIGHT)
    expect(CHEER_WEIGHT).toBeGreaterThan(FREQUENCY_WEIGHT)
  })

  test('recency bonus: within 7 days, then within 30, then none', () => {
    expect(dishScore(0, 0, daysAgo(1))).toBe(RECENT_7D_BONUS)
    expect(dishScore(0, 0, daysAgo(6.9))).toBe(RECENT_7D_BONUS)
    expect(dishScore(0, 0, daysAgo(10))).toBe(RECENT_30D_BONUS)
    expect(dishScore(0, 0, daysAgo(29.9))).toBe(RECENT_30D_BONUS)
    expect(dishScore(0, 0, daysAgo(31))).toBe(0)
  })

  test('a heavily-cheered old dish still outranks an uncheered new one', () => {
    const cheered = dishScore(10, 1, daysAgo(90))
    const freshUncheered = dishScore(0, 1, daysAgo(1))
    expect(cheered).toBeGreaterThan(freshUncheered)
  })

  test('the three signals simply add', () => {
    expect(dishScore(2, 3, daysAgo(1))).toBe(
      2 * CHEER_WEIGHT + 3 * FREQUENCY_WEIGHT + RECENT_7D_BONUS,
    )
  })
})
