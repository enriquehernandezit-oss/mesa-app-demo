import { describe, expect, test } from 'bun:test'

import { friendLine } from './popularFriends'

// A stand-in translator: the key, then its variables.
const t = (key: string, vars?: { name?: string; score?: string; n?: number }) =>
  `${key}|${vars?.name ?? ''}|${vars?.score ?? ''}|${vars?.n ?? ''}`

describe('friendLine', () => {
  test('one friend: their name and their score, shown the way every score is', () => {
    expect(friendLine(t, { count: 1, name: 'Diego', score: 96 })).toBe(
      'popular.friend_one|Diego|9.6|',
    )
  })

  test('two friends: the highest, and "1 other"', () => {
    expect(friendLine(t, { count: 2, name: 'Natalia', score: 90 })).toBe(
      'popular.friend_two|Natalia||',
    )
  })

  test('three or more: just how many', () => {
    expect(friendLine(t, { count: 5, name: 'Diego', score: 96 })).toBe('popular.friends_many|||5')
  })

  test('none: no line', () => {
    expect(friendLine(t, { count: 0, name: null, score: null })).toBeNull()
  })
})
