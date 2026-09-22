import { describe, expect, test } from 'bun:test'

import { categoryKey, eventCategoryText, eventPriceText } from './eventCategory'
import { countdown, nextDays, sdDayKey } from './eventTime'

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
