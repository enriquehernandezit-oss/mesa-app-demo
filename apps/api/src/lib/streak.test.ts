import { describe, expect, test } from 'bun:test'

import { sdWeek, weeklyStreak } from './streak'

// Mon 5 Oct 2026, 09:00 in Santo Domingo (UTC-4) = 13:00Z.
const monday = new Date('2026-10-05T13:00:00Z')
const at = (iso: string) => new Date(iso)

describe('sdWeek', () => {
  test('weeks run Monday to Sunday in Santo Domingo, not Thursday evening to Thursday evening', () => {
    // Sunday 4 Oct 23:30 SD = Monday 5 Oct 03:30Z: still the old week.
    expect(sdWeek(at('2026-10-05T03:30:00Z'))).toBe(sdWeek(at('2026-09-29T12:00:00Z')))
    // Monday 5 Oct 00:30 SD = 04:30Z: the new week.
    expect(sdWeek(at('2026-10-05T04:30:00Z'))).toBe(sdWeek(at('2026-10-11T12:00:00Z')))
    expect(sdWeek(at('2026-10-05T04:30:00Z'))).toBe(sdWeek(at('2026-09-29T12:00:00Z')) + 1)
    // Thursday 8 PM SD (the old UTC boundary) does not move a week.
    expect(sdWeek(at('2026-10-09T23:30:00Z'))).toBe(sdWeek(at('2026-10-08T23:30:00Z')))
  })
})

describe('weeklyStreak', () => {
  test('counts back from this week through each week with a ranking', () => {
    const r = [at('2026-10-05T12:00:00Z'), at('2026-09-29T12:00:00Z'), at('2026-09-22T12:00:00Z')]
    expect(weeklyStreak(r, monday)).toBe(3)
  })

  test('a quiet start to the week keeps last week streak; a whole empty week ends it', () => {
    const r = [at('2026-09-29T12:00:00Z'), at('2026-09-22T12:00:00Z')]
    expect(weeklyStreak(r, monday)).toBe(2) // nothing yet this week, but not broken
    expect(weeklyStreak(r, at('2026-10-12T13:00:00Z'))).toBe(0) // two weeks on: gone
  })

  test('a gap breaks it, and no rankings is zero', () => {
    const r = [at('2026-10-05T12:00:00Z'), at('2026-09-15T12:00:00Z')]
    expect(weeklyStreak(r, monday)).toBe(1)
    expect(weeklyStreak([], monday)).toBe(0)
  })
})
