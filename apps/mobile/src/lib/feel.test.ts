import { describe, expect, test } from 'bun:test'

import {
  bubbleFrame,
  bubblePhase,
  clamp,
  levelToSentiment,
  levelValue,
  nearestStop,
  riseEase,
  sentimentToStop,
  twinkleOpacity,
  wordOpacity,
} from './feel'

describe('the slider', () => {
  test('a level settles on the nearest stop, halfway rounding up toward "loved"', () => {
    expect([0, 0.2, 0.49].map(nearestStop)).toEqual([0, 0, 0])
    expect([0.5, 0.9, 1, 1.4].map(nearestStop)).toEqual([1, 1, 1, 1])
    expect([1.5, 1.9, 2].map(nearestStop)).toEqual([2, 2, 2])
  })

  test('a level past either end is held there', () => {
    expect(nearestStop(-3)).toBe(0)
    expect(nearestStop(9)).toBe(2)
    expect(clamp(5, 0, 2)).toBe(2)
    expect(clamp(-1, 0, 2)).toBe(0)
  })

  test('the stops are worst to best and map to the ranking sentiments both ways', () => {
    expect([0, 1, 2].map(levelToSentiment)).toEqual(['disliked', 'fine', 'loved'])
    expect((['disliked', 'fine', 'loved'] as const).map(sentimentToStop)).toEqual([0, 1, 2])
    expect(levelToSentiment(1.6)).toBe('loved')
  })

  test('an answer word is full on its stop and gone by halfway to the next', () => {
    expect(wordOpacity(1, 1)).toBe(1)
    expect(wordOpacity(0.75, 1)).toBe(0.5)
    expect(wordOpacity(0.5, 1)).toBe(0)
    expect(wordOpacity(0.5, 0)).toBe(0)
    expect(wordOpacity(0, 2)).toBe(0)
  })

  test('a layer value eases between the three stop values', () => {
    // The flat drink fades out: full at 0, gone by 1.
    expect(levelValue(0, 1, 0, 0)).toBe(1)
    expect(levelValue(0.5, 1, 0, 0)).toBe(0.5)
    expect(levelValue(1, 1, 0, 0)).toBe(0)
    expect(levelValue(2, 1, 0, 0)).toBe(0)
    // The thin stream: in by 1, kept to 2. The lively bubbles: only from 1 up.
    expect(levelValue(0.5, 0, 1, 1)).toBe(0.5)
    expect(levelValue(1.5, 0, 0, 1)).toBe(0.5)
    expect(levelValue(3, 0, 0, 1)).toBe(1)
  })
})

describe('the bubbles', () => {
  test('a phase wraps once a trip and can start partway through one', () => {
    expect(bubblePhase(0, 4, 0)).toBe(0)
    expect(bubblePhase(1, 4, 0)).toBe(0.25)
    expect(bubblePhase(4, 4, 0)).toBe(0)
    expect(bubblePhase(6, 4, 0)).toBe(0.5)
    // Already 1 s into its trip at t = 0.
    expect(bubblePhase(0, 4, 1)).toBe(0.25)
    // Never negative, whatever the clock does.
    expect(bubblePhase(0.1, 3, 2.9)).toBeGreaterThanOrEqual(0)
  })

  test('the rise curve runs 0 → 1, slow at first and never going backwards', () => {
    expect(riseEase(0)).toBe(0)
    expect(riseEase(1)).toBe(1)
    // Lingers early (cubic-bezier .45,0,.9,.6): well under linear a third of the way.
    expect(riseEase(0.33)).toBeLessThan(0.15)
    let last = 0
    for (let i = 1; i <= 100; i++) {
      const v = riseEase(i / 100)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
  })

  test('a bubble grows and fades in at the start, and fades out at the surface', () => {
    const born = bubbleFrame(0)
    expect(born.lift).toBe(0)
    expect(born.scale).toBeCloseTo(0.55, 5)
    expect(born.opacity).toBe(0)
    const mid = bubbleFrame(0.5)
    expect(mid.opacity).toBe(1)
    expect(mid.scale).toBeGreaterThan(0.55)
    expect(mid.scale).toBeLessThan(1.25)
    const gone = bubbleFrame(0.99999)
    expect(gone.lift).toBeGreaterThan(0.99)
    expect(gone.scale).toBeGreaterThan(1.2)
    expect(gone.opacity).toBeLessThan(0.01)
  })

  test('the spray breathes between .15 and .8', () => {
    const seen = Array.from({ length: 36 }, (_, i) => twinkleOpacity(i * 0.05, 0))
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0.15 - 1e-9)
    expect(Math.max(...seen)).toBeLessThanOrEqual(0.8 + 1e-9)
    expect(twinkleOpacity(0, 0)).toBeCloseTo(0.15, 5)
    expect(twinkleOpacity(0.9, 0)).toBeCloseTo(0.8, 5)
  })
})
