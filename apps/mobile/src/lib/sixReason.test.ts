import { describe, expect, test } from 'bun:test'

import { sixReasonLine } from './sixReason'

// A stand-in translator: the key, and the count if there is one.
const t = (key: string, vars?: { n?: number }) => (vars?.n != null ? `${key}:${vars.n}` : key)

describe('sixReasonLine', () => {
  test('a friend: their name and their score, with the extras counted', () => {
    expect(sixReasonLine(t, { kind: 'friend', name: 'Diego', score: 96, more: 0 })).toBe(
      'Diego · 9.6',
    )
    expect(sixReasonLine(t, { kind: 'friend', name: 'Diego', score: 84.4, more: 2 })).toBe(
      'Diego +2 · 8.4',
    )
  })

  test('saved, saved by friends, and the city filling a short list', () => {
    expect(sixReasonLine(t, { kind: 'saved_friends', count: 2 })).toBe('home.six_saved_friends:2')
    expect(sixReasonLine(t, { kind: 'saved' })).toBe('home.six_saved')
    expect(sixReasonLine(t, { kind: 'trending' })).toBe('home.six_trending')
  })
})
