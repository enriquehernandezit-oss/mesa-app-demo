import { describe, expect, test } from 'bun:test'

import { notificationHref } from './notificationHref'
import type { NotificationItem } from './types'

const base: NotificationItem = {
  id: 'n1',
  kind: 'follow',
  createdAt: '2026-09-30T12:00:00.000Z',
  read: false,
  actor: { id: 'u1', name: 'Ana', handle: 'ana', image: null },
  restaurant: { id: 'r1', name: 'Lumbre', coverImageId: null },
  rankingId: 'k1',
  planId: 'p1',
  dishListId: 'l1',
  dish: { id: 'd1', name: 'Pizza' },
  event: { id: 'e1', title: 'Cata', startsAt: '2026-10-01T00:00:00.000Z' },
  data: null,
  followsBack: false,
  others: 0,
}
const href = (kind: NotificationItem['kind'], over: Partial<NotificationItem> = {}) =>
  notificationHref({ ...base, kind, ...over })

describe('notificationHref', () => {
  test('each kind opens the screen it is about', () => {
    expect(href('follow')).toBe('/u/u1')
    expect(href('follow_accepted')).toBe('/u/u1')
    expect(href('follow_request')).toBe('/follow-requests')
    expect(href('cheers')).toBe('/r/r1')
    expect(href('saved_ranked')).toBe('/r/r1')
    expect(href('place_share')).toBe('/r/r1')
    expect(href('comment')).toBe('/comments/k1')
    expect(href('dish_cheer')).toBe('/dish/d1')
    expect(href('plan_invite')).toBe('/plans/p1')
    expect(href('plan_reply')).toBe('/plans/p1')
    expect(href('event_going')).toBe('/events/e1')
    expect(href('event_cancelled')).toBe('/events/e1')
    expect(href('dish_nudge')).toBe('/dish-lists/l1')
    expect(href('friends_love', { actor: null })).toBe('/r/r1')
    expect(href('taste_match')).toBe('/match/u1')
    expect(href('mention')).toBe('/comments/k1')
    expect(href('mention', { rankingId: null })).toBe('/dish/d1')
  })

  test('a comment without its ranking falls back to the place', () => {
    expect(href('comment', { rankingId: null })).toBe('/r/r1')
    expect(href('comment', { rankingId: null, restaurant: null })).toBeNull()
  })

  test('a row whose target is gone is not tappable', () => {
    expect(href('follow', { actor: null })).toBeNull()
    expect(href('cheers', { restaurant: null })).toBeNull()
    expect(href('dish_cheer', { dish: null })).toBeNull()
    expect(href('plan_invite', { planId: null })).toBeNull()
    expect(href('event_going', { event: null })).toBeNull()
    expect(href('dish_nudge', { dishListId: null })).toBeNull()
    expect(href('friends_love', { restaurant: null })).toBeNull()
    expect(href('taste_match', { actor: null })).toBeNull()
    expect(href('mention', { rankingId: null, dish: null })).toBeNull()
  })
})
