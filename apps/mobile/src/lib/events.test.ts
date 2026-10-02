import { describe, expect, test } from 'bun:test'

import {
  CAT_ICON,
  CAT_ORDER,
  categoryKey,
  eventCategoryText,
  eventPriceText,
} from './eventCategory'
import {
  countdown,
  daysBetween,
  eventsThisWeek,
  inDayRange,
  monthCells,
  nextDays,
  sdDayKey,
  shiftMonth,
} from './eventTime'

describe('categoryKey', () => {
  test('maps the curated categories', () => {
    expect(categoryKey('Cata')).toBe('cata')
    expect(categoryKey('Cata de cócteles')).toBe('cata')
    expect(categoryKey('Música en vivo')).toBe('musica')
    expect(categoryKey('Brunch')).toBe('brunch')
    expect(categoryKey('Food tasting')).toBe('food')
    expect(categoryKey('Happy hour')).toBe('happy')
  })
  test('falls back to the title, then to default', () => {
    expect(categoryKey(null, 'Omakase de Chef — 12 Tiempos')).toBe('food')
    expect(categoryKey(null, 'Noche de Karaoke')).toBe('musica')
    expect(categoryKey('Aniversario', 'Aniversario')).toBe('default')
  })
  test('the category outranks the title', () => {
    expect(categoryKey('Brunch', 'Brunch + DJ Set')).toBe('brunch')
  })
})

describe('CAT_ICON', () => {
  test('every kind has an icon, and the filterable kinds each have their own', () => {
    for (const k of ['cata', 'musica', 'brunch', 'food', 'happy', 'default'] as const) {
      expect(CAT_ICON[k]).toBeTruthy()
    }
    const icons = CAT_ORDER.map((k) => CAT_ICON[k])
    expect(new Set(icons).size).toBe(icons.length)
    expect(icons).not.toContain(CAT_ICON.default)
  })
})

describe('eventTime', () => {
  test('sdDayKey uses Santo Domingo (UTC-4)', () => {
    // 02:00 UTC on the 20th is still 22:00 on the 19th in SD.
    expect(sdDayKey('2026-09-20T02:00:00Z')).toBe('2026-09-19')
    expect(sdDayKey('2026-09-20T19:30:00-04:00')).toBe('2026-09-20')
  })
  test('nextDays starts today in SD', () => {
    expect(nextDays(3, new Date('2026-09-20T02:00:00Z'))).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
    ])
  })
  test('countdown phrasing', () => {
    const now = new Date('2026-09-19T10:00:00-04:00')
    expect(countdown('2026-09-19T10:30:00-04:00', null, now)).toEqual({ kind: 'minutes', n: 30 })
    expect(countdown('2026-09-19T19:30:00-04:00', null, now)).toEqual({
      kind: 'hours',
      h: 9,
      m: 30,
    })
    expect(countdown('2026-09-20T19:30:00-04:00', null, now)).toEqual({ kind: 'tomorrow' })
    expect(countdown('2026-09-25T19:00:00-04:00', null, now)).toEqual({ kind: 'days', n: 6 })
    expect(countdown('2026-09-19T09:00:00-04:00', '2026-09-19T11:00:00-04:00', now)).toEqual({
      kind: 'live',
    })
    expect(countdown('2026-09-18T19:00:00-04:00', '2026-09-18T22:00:00-04:00', now)).toEqual({
      kind: 'ended',
    })
  })
})

describe('eventsThisWeek', () => {
  // Thursday 1 Oct 2026, 8:37 PM in Santo Domingo — so "this week" is Thu 1 … Wed 7 Oct.
  const now = new Date('2026-10-01T20:37:00-04:00')
  const ev = (id: string, startsAt: string, endsAt: string | null = null) => ({
    id,
    startsAt,
    endsAt,
  })
  const ids = (list: { id: string }[]) => list.map((e) => e.id)

  test('keeps what is on tonight, later this week, and the seventh day — in the order given', () => {
    const list = [
      ev('tonight', '2026-10-01T22:00:00-04:00'),
      ev('tomorrow', '2026-10-02T19:00:00-04:00'),
      // 23:00 on the 7th is 03:00 UTC on the 8th, and still the seventh day here
      ev('last-night', '2026-10-07T23:00:00-04:00'),
    ]
    expect(ids(eventsThisWeek(list, now))).toEqual(['tonight', 'tomorrow', 'last-night'])
  })

  test('drops the eighth day onward, and anything that is over', () => {
    const list = [
      ev('over', '2026-10-01T18:00:00-04:00', '2026-10-01T20:00:00-04:00'),
      ev('next-week', '2026-10-08T00:30:00-04:00'),
      ev('later', '2026-10-15T19:30:00-04:00'),
      ev('ok', '2026-10-03T21:00:00-04:00'),
    ]
    expect(ids(eventsThisWeek(list, now))).toEqual(['ok'])
  })

  test('an event that began earlier and is still on counts', () => {
    const late = new Date('2026-10-02T01:00:00-04:00')
    const list = [ev('past-midnight', '2026-10-01T23:00:00-04:00', '2026-10-02T02:00:00-04:00')]
    expect(ids(eventsThisWeek(list, late))).toEqual(['past-midnight'])
  })

  test('leaves out what the caller already shows', () => {
    const list = [ev('a', '2026-10-01T22:00:00-04:00'), ev('b', '2026-10-02T19:00:00-04:00')]
    expect(ids(eventsThisWeek(list, now, new Set(['a'])))).toEqual(['b'])
  })

  test('nothing in, nothing out', () => {
    expect(eventsThisWeek([], now)).toEqual([])
  })
})

describe('the Eventos date selection', () => {
  test('null matches every day; a single day is start === end', () => {
    expect(inDayRange('2026-09-22', null)).toBe(true)
    const one = { start: '2026-09-22', end: '2026-09-22' }
    expect(inDayRange('2026-09-22', one)).toBe(true)
    expect(inDayRange('2026-09-23', one)).toBe(false)
  })
  test('a range is inclusive at both ends', () => {
    const r = { start: '2026-09-22', end: '2026-09-28' }
    expect(inDayRange('2026-09-21', r)).toBe(false)
    expect(inDayRange('2026-09-22', r)).toBe(true)
    expect(inDayRange('2026-09-25', r)).toBe(true)
    expect(inDayRange('2026-09-28', r)).toBe(true)
    expect(inDayRange('2026-09-29', r)).toBe(false)
  })
  test('an event lands in the range by its SD day, not its UTC one', () => {
    // 01:00 UTC on the 29th is still 21:00 on the 28th in Santo Domingo — the
    // last day of the range, so it must match.
    const r = { start: '2026-09-22', end: '2026-09-28' }
    expect(inDayRange(sdDayKey('2026-09-29T01:00:00Z'), r)).toBe(true)
    expect(inDayRange(sdDayKey('2026-09-29T05:00:00Z'), r)).toBe(false)
  })
  test('daysBetween counts whole SD days, signed', () => {
    expect(daysBetween('2026-09-22', '2026-09-22')).toBe(0)
    expect(daysBetween('2026-09-22', '2026-10-02')).toBe(10)
    expect(daysBetween('2026-10-02', '2026-09-22')).toBe(-10)
  })
  test('shiftMonth rolls the year over', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  test('monthCells is Monday-first and padded to whole weeks', () => {
    // September 2026 starts on a Tuesday and has 30 days.
    const cells = monthCells('2026-09')
    expect(cells.length % 7).toBe(0)
    expect(cells[0]).toBeNull()
    expect(cells[1]).toBe('2026-09-01')
    expect(cells.filter((c) => c !== null)).toHaveLength(30)
    expect(cells[cells.length - 1]).toBeNull()
  })
  test('monthCells handles a leap February', () => {
    expect(monthCells('2028-02').filter((c) => c !== null)).toHaveLength(29)
    expect(monthCells('2027-02').filter((c) => c !== null)).toHaveLength(28)
  })
})

describe('event copy in English', () => {
  test('category', () => {
    expect(eventCategoryText('Música en vivo', 'en')).toBe('Live music')
    expect(eventCategoryText('Cata de cócteles', 'en')).toBe('Cocktail tasting')
    expect(eventCategoryText('Happy hour', 'en')).toBe('Happy hour')
    expect(eventCategoryText('Música en vivo', 'es')).toBe('Música en vivo')
  })
  test('price line', () => {
    expect(eventPriceText('Entrada libre', 'en')).toBe('Free entry')
    expect(eventPriceText('Gratis con reservación', 'en')).toBe('Free with reservation')
    expect(eventPriceText('2x1 en cócteles', 'en')).toBe('2-for-1 cocktails')
    expect(eventPriceText('RD$4,800 por persona · sake incluido', 'en')).toBe(
      'RD$4,800 per person · sake included',
    )
    expect(eventPriceText('Menú fijo RD$3,500', 'en')).toBe('Set menu RD$3,500')
    expect(eventPriceText('Cover RD$800', 'en')).toBe('Cover RD$800')
    expect(eventPriceText('Entrada libre', 'es')).toBe('Entrada libre')
  })
})
