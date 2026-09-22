import { describe, expect, test } from 'bun:test'

import { MIN_SHARED_FOR_MATCH, isAgreement, tasteMatch } from './tasteMatch'

describe('tasteMatch', () => {
  test('hidden below the shared-places threshold', () => {
    expect(tasteMatch(0, 0)).toBeNull()
    expect(tasteMatch(0, 1)).toBeNull()
    expect(tasteMatch(5, 2)).toBeNull()
    expect(MIN_SHARED_FOR_MATCH).toBe(3)
  })

  test('identical scores at the threshold reads as 80%, not 100%', () => {
    expect(tasteMatch(0, 3)).toBe(80)
  })

  test('an "unrelated" average gap always shows 50%, regardless of n', () => {
    for (const n of [3, 5, 10, 30]) {
      expect(tasteMatch(8, n)).toBe(50)
    }
  })

  test('an "opposite" average gap at the threshold reads as 20%, not 0%', () => {
    expect(tasteMatch(16, 3)).toBe(20)
  })

  test('a gap past the opposite threshold clamps rather than going negative', () => {
    expect(tasteMatch(24, 3)).toBe(tasteMatch(16, 3))
    expect(tasteMatch(100, 3)).toBe(tasteMatch(16, 3))
  })

  test('more shared places pulls a real match closer to its raw extreme', () => {
    const at3 = tasteMatch(0, 3)
    const at20 = tasteMatch(0, 20)
    expect(at3).not.toBeNull()
    expect(at20).not.toBeNull()
    expect(at20!).toBeGreaterThan(at3!)
    expect(at20!).toBeLessThanOrEqual(100)
  })

  test('more shared places at an opposite gap pulls closer to 0, not away from it', () => {
    const at3 = tasteMatch(16, 3)
    const at20 = tasteMatch(16, 20)
    expect(at3).not.toBeNull()
    expect(at20).not.toBeNull()
    expect(at20!).toBeLessThan(at3!)
    expect(at20!).toBeGreaterThanOrEqual(0)
  })

  test('monotonic non-increasing as the average gap grows, at a fixed n', () => {
    let prev = 101
    for (let gap = 0; gap <= 24; gap += 2) {
      const shown = tasteMatch(gap, 5)
      expect(shown).not.toBeNull()
      expect(shown!).toBeLessThanOrEqual(prev)
      prev = shown!
    }
  })

  test('always within [0, 100]', () => {
    for (const n of [3, 4, 10, 50]) {
      for (const gap of [0, 4, 8, 12, 16, 24, 40]) {
        const shown = tasteMatch(gap, n)
        expect(shown).not.toBeNull()
        expect(shown!).toBeGreaterThanOrEqual(0)
        expect(shown!).toBeLessThanOrEqual(100)
      }
    }
  })

  test("isAgreement matches the formula's own 50% fixed point at gap=8", () => {
    expect(isAgreement(0)).toBe(true)
    expect(isAgreement(7.9)).toBe(true)
    expect(isAgreement(8)).toBe(false)
    expect(isAgreement(16)).toBe(false)
  })

  test('a middling real-world gap lands strictly between opposite and identical', () => {
    // Three shared places: agreed closely on two, diverged sharply on one —
    // avgGap = (1+3+14)/3 = 6.
    const shown = tasteMatch(6, 3)
    expect(shown).not.toBeNull()
    expect(shown!).toBeGreaterThan(20)
    expect(shown!).toBeLessThan(80)
  })
})
