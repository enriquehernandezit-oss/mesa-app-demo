import { describe, expect, test } from 'bun:test'

import { pushDeepLink } from './pushLinks'

describe('pushDeepLink', () => {
  test('maps every allow-listed type', () => {
    expect(pushDeepLink({ type: 'user', userId: 'u1' })).toBe('/u/u1')
    expect(pushDeepLink({ type: 'restaurant', restaurantId: 'r1' })).toBe('/r/r1')
    expect(pushDeepLink({ type: 'plan', planId: 'p1' })).toBe('/plans/p1')
    expect(pushDeepLink({ type: 'event', eventId: 'e1' })).toBe('/events/e1')
    expect(pushDeepLink({ type: 'dish-list', listId: 'l1' })).toBe('/dish-lists/l1')
    expect(pushDeepLink({ type: 'dish', dishId: 'd1' })).toBe('/dish/d1')
    expect(pushDeepLink({ type: 'comment', rankingId: 'k1' })).toBe('/comments/k1')
    expect(pushDeepLink({ type: 'match', userId: 'u1' })).toBe('/match/u1')
    expect(pushDeepLink({ type: 'list', slug: 'la-dolce-vita' })).toBe('/lists/la-dolce-vita')
    expect(pushDeepLink({ type: 'menu', restaurantId: 'r1' })).toBe('/menu/r1')
    expect(pushDeepLink({ type: 'activity' })).toBe('/activity')
    expect(pushDeepLink({ type: 'follow-requests' })).toBe('/follow-requests')
  })
  test('rejects an unknown type', () => {
    expect(pushDeepLink({ type: 'nope', userId: 'u1' })).toBeNull()
  })
  test('rejects a right type with a missing or wrong-shaped id', () => {
    expect(pushDeepLink({ type: 'event' })).toBeNull()
    expect(pushDeepLink({ type: 'event', eventId: 42 })).toBeNull()
    expect(pushDeepLink({ type: 'user', restaurantId: 'r1' })).toBeNull()
    expect(pushDeepLink({ type: 'comment', userId: 'u1' })).toBeNull()
    expect(pushDeepLink({ type: 'list', slug: 7 })).toBeNull()
  })
  test('rejects undefined data', () => {
    expect(pushDeepLink(undefined)).toBeNull()
  })
})
