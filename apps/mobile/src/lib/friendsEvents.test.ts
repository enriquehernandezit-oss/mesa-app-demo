import { describe, expect, test } from 'bun:test'

import { dayOffset, eventDays, friendsGoingEvents } from './friendsEvents'
import type { EventSummary } from './types'

// "Now" is Monday 5 Oct 2026, 14:00 in Santo Domingo (UTC-4) = 18:00Z.
const now = new Date('2026-10-05T18:00:00Z')
const ev = (id: string, startsAt: string, friends = 0, endsAt: string | null = null) =>
  ({ id, startsAt, endsAt, friendsGoingCount: friends }) as EventSummary

describe('friendsGoingEvents', () => {
  test('only events with friends going, most friends first then soonest, none over', () => {
    const list = [
      ev('none', '2026-10-06T23:00:00Z', 0),
      ev('two-late', '2026-10-09T23:00:00Z', 2),
      ev('two-soon', '2026-10-06T23:00:00Z', 2),
      ev('five', '2026-10-10T23:00:00Z', 5),
      ev('over', '2026-10-05T12:00:00Z', 9, '2026-10-05T15:00:00Z'),
    ]
    expect(friendsGoingEvents(list, now).map((e) => e.id)).toEqual(['five', 'two-soon', 'two-late'])
  })
})

describe('eventDays', () => {
  test('groups the next seven Santo Domingo days, in order, soonest first inside a day', () => {
    const list = [
      ev('sat-late', '2026-10-11T02:00:00Z'), // Sat 10 Oct 22:00 SD
      ev('tonight', '2026-10-06T01:00:00Z'), // Mon 5 Oct 21:00 SD
      ev('sat-early', '2026-10-10T22:00:00Z'), // Sat 10 Oct 18:00 SD
      ev('too-far', '2026-10-13T23:00:00Z'), // Tue 13 Oct — the eighth day
    ]
    const days = eventDays(list, now)
    expect(days.map((d) => d.dayKey)).toEqual(['2026-10-05', '2026-10-10'])
    expect(days[1]?.events.map((e) => e.id)).toEqual(['sat-early', 'sat-late'])
  })

  test('an event already on belongs to today; one that is over is gone', () => {
    const list = [
      ev('on-now', '2026-10-05T17:00:00Z', 0, '2026-10-05T21:00:00Z'),
      ev('yesterday-on', '2026-10-04T23:00:00Z', 0, '2026-10-05T20:00:00Z'),
      ev('over', '2026-10-05T12:00:00Z', 0, '2026-10-05T15:00:00Z'),
    ]
    const days = eventDays(list, now)
    expect(days).toHaveLength(1)
    expect(days[0]?.dayKey).toBe('2026-10-05')
    expect(days[0]?.events.map((e) => e.id)).toEqual(['yesterday-on', 'on-now'])
  })

  test('day offsets count Santo Domingo days from now', () => {
    expect(dayOffset('2026-10-05', now)).toBe(0)
    expect(dayOffset('2026-10-06', now)).toBe(1)
    expect(dayOffset('2026-10-10', now)).toBe(5)
  })
})
