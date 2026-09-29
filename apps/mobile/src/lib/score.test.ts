import { describe, expect, test } from 'bun:test'

import { displayScore, scoreWordKey } from './score'

describe('scoreWordKey', () => {
  test('bands: 9+ Must go, 8+ Great, 7+ Good, 5+ Fine, else Skip', () => {
    expect(scoreWordKey(96)).toBe('score.must_go')
    expect(scoreWordKey(90)).toBe('score.must_go')
    expect(scoreWordKey(89)).toBe('score.great')
    expect(scoreWordKey(80)).toBe('score.great')
    expect(scoreWordKey(79)).toBe('score.good')
    expect(scoreWordKey(72)).toBe('score.good')
    expect(scoreWordKey(70)).toBe('score.good')
    expect(scoreWordKey(69)).toBe('score.fine')
    expect(scoreWordKey(50)).toBe('score.fine')
    expect(scoreWordKey(49)).toBe('score.skip')
    expect(scoreWordKey(0)).toBe('score.skip')
  })

  test('reads the DISPLAYED number, so word and figure never disagree', () => {
    // 89.96 displays as 9.0, so it is "Must go" — not "Great" beside a "9.0".
    expect(displayScore(89.96)).toBe('9.0')
    expect(scoreWordKey(89.96)).toBe('score.must_go')
    // 69.96 displays as 7.0 → Good.
    expect(displayScore(69.96)).toBe('7.0')
    expect(scoreWordKey(69.96)).toBe('score.good')
    // 89.4 displays as 8.9 → Great.
    expect(displayScore(89.4)).toBe('8.9')
    expect(scoreWordKey(89.4)).toBe('score.great')
  })

  test('the stored range 72–96 spans Good to Must go', () => {
    expect(scoreWordKey(72)).toBe('score.good')
    expect(scoreWordKey(96)).toBe('score.must_go')
  })
})
