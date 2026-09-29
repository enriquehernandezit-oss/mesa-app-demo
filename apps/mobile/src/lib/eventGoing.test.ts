import { describe, expect, test } from 'bun:test'

import { goingLabel } from './eventGoing'

// A stand-in translator: the key, then the count.
const t = (key: string, vars?: { n?: number }) => `${key}|${vars?.n ?? ''}`

describe('goingLabel', () => {
  test('friends first, with their true count however large', () => {
    expect(goingLabel(t, { friendsGoingCount: 1, goingCount: 40 })).toBe(
      'events.friends_going_count|1',
    )
    expect(goingLabel(t, { friendsGoingCount: 32, goingCount: 120 })).toBe(
      'events.friends_going_count|32',
    )
    expect(goingLabel(t, { friendsGoingCount: 60, goingCount: 60 })).toBe(
      'events.friends_going_count|60',
    )
  })

  test('no friends: everyone going', () => {
    expect(goingLabel(t, { friendsGoingCount: 0, goingCount: 7 })).toBe('events.going_count|7')
  })

  test('nobody yet: be the first', () => {
    expect(goingLabel(t, { friendsGoingCount: 0, goingCount: 0 })).toBe('events.be_first|')
  })
})
