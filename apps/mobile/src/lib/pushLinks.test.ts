import { describe, expect, test } from 'bun:test'
import { pushDeepLink } from './pushLinks'

describe('pushDeepLink', () => {
  test('maps every allow-listed type', () => {
    expect(pushDeepLink({ type: 'user', userId: 'u1' })).toBe('/u/u1')
    expect(pushDeepLink({ type: 'restaurant', restaurantId: 'r1' })).toBe('/r/r1')
    expect(pushDeepLink({ type: 'plan', planId: 'p1' })).toBe('/planes/p1')
    expect(pushDeepLink({ type: 'event', eventId: 'e1' })).toBe('/eventos/e1')
    expect(pushDeepLink({ type: 'dish-list', listId: 'l1' })).toBe('/platos/l1')
  })
  test('rejects an unknown type', () => {
    expect(pushDeepLink({ type: 'nope', userId: 'u1' })).toBeNull()
  })
  test('rejects a right type with a missing or wrong-shaped id', () => {
    expect(pushDeepLink({ type: 'event' })).toBeNull()
    expect(pushDeepLink({ type: 'event', eventId: 42 })).toBeNull()
    expect(pushDeepLink({ type: 'user', restaurantId: 'r1' })).toBeNull()
  })
  test('rejects undefined data', () => {
    expect(pushDeepLink(undefined)).toBeNull()
  })
})
