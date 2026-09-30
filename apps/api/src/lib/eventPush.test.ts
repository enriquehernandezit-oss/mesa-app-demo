import { describe, expect, test } from 'bun:test'

import { GOING_PUSH_WINDOW_MS, collapseEventGoing, goingPushKey, isUpcoming } from './eventPush'

const at = (iso: string) => new Date(iso)

describe('goingPushKey', () => {
  test('the same event within a window is one key, so a follower is pushed once', () => {
    const a = goingPushKey('e1', at('2026-10-01T12:00:00Z'))
    const b = goingPushKey('e1', new Date(at('2026-10-01T12:00:00Z').getTime() + 60_000))
    expect(a).toBe(b)
  })

  test('the next window is a new key, so a later sign-up can push again', () => {
    const t0 = at('2026-10-01T12:00:00Z')
    const later = new Date(t0.getTime() + GOING_PUSH_WINDOW_MS)
    expect(goingPushKey('e1', later)).not.toBe(goingPushKey('e1', t0))
  })

  test('different events never share a key', () => {
    const t = at('2026-10-01T12:00:00Z')
    expect(goingPushKey('e1', t)).not.toBe(goingPushKey('e2', t))
  })
})

describe('isUpcoming', () => {
  const now = at('2026-10-01T20:00:00Z')

  test('an event that has not started is upcoming', () => {
    expect(isUpcoming({ startsAt: at('2026-10-02T00:00:00Z'), endsAt: null }, now)).toBe(true)
  })

  test('with no end time it counts as three hours long', () => {
    expect(isUpcoming({ startsAt: at('2026-10-01T18:00:00Z'), endsAt: null }, now)).toBe(true)
    expect(isUpcoming({ startsAt: at('2026-10-01T16:59:00Z'), endsAt: null }, now)).toBe(false)
  })

  test('with an end time, it is over once that has passed', () => {
    expect(
      isUpcoming({ startsAt: at('2026-10-01T15:00:00Z'), endsAt: at('2026-10-01T21:00:00Z') }, now),
    ).toBe(true)
    expect(
      isUpcoming({ startsAt: at('2026-10-01T15:00:00Z'), endsAt: at('2026-10-01T19:59:00Z') }, now),
    ).toBe(false)
  })
})

describe('collapseEventGoing', () => {
  const row = (eventId: string, who: string) => ({ eventId, who })

  test('one row per event: the newest friend, and how many others', () => {
    const out = collapseEventGoing([
      row('e1', 'ana'), // newest
      row('e2', 'luis'),
      row('e1', 'marta'),
      row('e1', 'pedro'),
    ])
    expect(out).toEqual([
      { eventId: 'e1', who: 'ana', others: 2 },
      { eventId: 'e2', who: 'luis', others: 0 },
    ])
  })

  test('nothing in, nothing out', () => {
    expect(collapseEventGoing([])).toEqual([])
  })
})
