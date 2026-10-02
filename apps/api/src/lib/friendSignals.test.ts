import { describe, expect, test } from 'bun:test'

import { tasteMatch } from '@mesa/db'

import {
  LOVE_MIN_FRIENDS,
  TASTE_PUSH_AT,
  type TastePair,
  loveInputs,
  tasteInputs,
} from './friendSignals'

describe('tasteInputs', () => {
  const pair = (follower: string, following: string, shared: number, gap: number): TastePair => ({
    follower,
    following,
    shared,
    gap,
  })

  test('the line is where the damped match reaches 90: eight identical shared places is the least', () => {
    expect(tasteMatch(0, 7)).toBeLessThan(TASTE_PUSH_AT)
    expect(tasteMatch(0, 8)).toBe(TASTE_PUSH_AT)
  })

  test('a pair at the line is told to the follower, about the one they follow', () => {
    const [n] = tasteInputs([pair('me', 'ana', 12, 0)])
    expect<unknown>(n).toEqual({
      userId: 'me',
      kind: 'taste_match',
      dedupeKey: 'taste_match:ana',
      actorId: 'ana',
      data: { percent: tasteMatch(0, 12) },
    })
  })

  test('below the line, or with too few shared places, tells nobody', () => {
    expect(tasteInputs([pair('me', 'ana', 12, 5)])).toEqual([])
    expect(tasteInputs([pair('me', 'ana', 2, 0)])).toEqual([])
    expect(tasteInputs([])).toEqual([])
  })

  test('people who follow each other are each told about the other, as two rows', () => {
    const rows = tasteInputs([pair('me', 'ana', 10, 0), pair('ana', 'me', 10, 0)])
    expect(rows.map((r) => [r.userId, r.actorId])).toEqual([
      ['me', 'ana'],
      ['ana', 'me'],
    ])
  })
})

describe('loveInputs', () => {
  test('one row per recipient, keyed on the place so it is told once ever', () => {
    const rows = loveInputs('r1', [
      { userId: 'a', friends: LOVE_MIN_FRIENDS, went: false },
      { userId: 'b', friends: 5, went: true },
    ])
    expect<unknown>(rows).toEqual([
      {
        userId: 'a',
        kind: 'friends_love',
        dedupeKey: 'friends_love:r1',
        restaurantId: 'r1',
        data: { count: 3, went: false },
      },
      {
        userId: 'b',
        kind: 'friends_love',
        dedupeKey: 'friends_love:r1',
        restaurantId: 'r1',
        data: { count: 5, went: true },
      },
    ])
  })
})
