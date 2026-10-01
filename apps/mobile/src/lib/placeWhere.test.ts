import { describe, expect, test } from 'bun:test'

import { placeWhere } from './placeWhere'

describe('placeWhere', () => {
  test('a sector reads neighborhood, then city', () => {
    expect(placeWhere('Piantini', 'Santo Domingo')).toBe('Piantini, Santo Domingo')
  })

  test('a place filed under its own city says it once', () => {
    expect(placeWhere('Punta Cana', 'Punta Cana')).toBe('Punta Cana')
  })

  test('a missing half is simply left out', () => {
    expect(placeWhere('Piantini', null)).toBe('Piantini')
    expect(placeWhere(undefined, 'Miami Beach')).toBe('Miami Beach')
    expect(placeWhere(null, null)).toBe('')
  })
})
