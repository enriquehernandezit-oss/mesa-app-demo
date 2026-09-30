import { describe, expect, test } from 'bun:test'

import { bucketOf, groupByBucket, isKnownKind, matchesFilter } from './activityGroups'
import type { NotificationItem } from './types'

// Local-time dates, since the buckets are the member's own calendar days.
const now = new Date(2026, 8, 30, 15, 0) // Sep 30, 3 pm
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString()

const item = (id: string, createdAt: string): NotificationItem => ({
  id,
  kind: 'follow',
  createdAt,
  read: false,
  actor: null,
  restaurant: null,
  rankingId: null,
  planId: null,
  dishListId: null,
  dish: null,
  event: null,
  data: null,
  followsBack: false,
  others: 0,
})

describe('matchesFilter', () => {
  test('All shows everything; each pill shows its own kinds', () => {
    expect(matchesFilter('follow', 'all')).toBe(true)
    expect(matchesFilter('follow', 'followers')).toBe(true)
    expect(matchesFilter('follow', 'rankings')).toBe(false)
    expect(matchesFilter('cheers', 'rankings')).toBe(true)
    expect(matchesFilter('comment', 'rankings')).toBe(true)
    expect(matchesFilter('plan_reply', 'plans')).toBe(true)
    expect(matchesFilter('event_cancelled', 'events')).toBe(true)
    expect(matchesFilter('event_going', 'plans')).toBe(false)
    expect(matchesFilter('follow_accepted', 'followers')).toBe(true)
  })

  test('a kind from a newer server is unknown, not a crash', () => {
    expect(isKnownKind('cheers')).toBe(true)
    expect(isKnownKind('follow_accepted')).toBe(true)
    expect(isKnownKind('mention')).toBe(false)
  })
})

describe('bucketOf', () => {
  test('since midnight is today, the six days before are this week, the rest earlier', () => {
    expect(bucketOf(at(30, 0), now)).toBe('today')
    expect(bucketOf(at(29, 23), now)).toBe('week')
    expect(bucketOf(at(24, 0), now)).toBe('week')
    expect(bucketOf(at(23, 23), now)).toBe('earlier')
  })
})

describe('groupByBucket', () => {
  test('keeps order, drops empty sections and repeated ids', () => {
    const groups = groupByBucket(
      [item('a', at(30, 9)), item('b', at(27)), item('b', at(27)), item('c', at(1))],
      now,
    )
    expect(groups.map((g) => [g.key, g.data.map((i) => i.id)])).toEqual([
      ['today', ['a']],
      ['week', ['b']],
      ['earlier', ['c']],
    ])
    expect(groupByBucket([item('a', at(30, 9))], now).map((g) => g.key)).toEqual(['today'])
    expect(groupByBucket([], now)).toEqual([])
  })
})
