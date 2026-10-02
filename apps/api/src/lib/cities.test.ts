import { describe, expect, test } from 'bun:test'

import { cityRect, parseCityIds, toCitySuggestion } from './cities'
import type { Prediction } from './googlePlaces'

// The boxes below are what Google returned for these cities on 2026-10-02 (Place Details,
// `viewport`), trimmed to the corners — a hand-invented box would only test the shape we imagined.

describe('cityRect — the area a city covers', () => {
  test('is Google’s own box when that is already bigger than the minimum', () => {
    // Punta Cana: about 44 km tall and 31 km wide
    const rect = cityRect({
      low: { latitude: 18.36, longitude: -68.522 },
      high: { latitude: 18.76, longitude: -68.224 },
    })
    expect(rect!.minLat).toBeCloseTo(18.36, 9)
    expect(rect!.maxLat).toBeCloseTo(18.76, 9)
    expect(rect!.minLng).toBeCloseTo(-68.522, 9)
    expect(rect!.maxLng).toBeCloseTo(-68.224, 9)
  })

  test('a box a little under the minimum is widened to it, not left tight', () => {
    // Miami: 20 km wide — a hair under 22 — so its longitudes grow, its latitudes (24 km) do not.
    const rect = cityRect({
      low: { latitude: 25.6537, longitude: -80.3195 },
      high: { latitude: 25.8718, longitude: -80.1393 },
    })
    expect(rect!.minLat).toBeCloseTo(25.6537, 4)
    expect(rect!.maxLat).toBeCloseTo(25.8718, 4)
    expect(rect!.maxLng - rect!.minLng).toBeCloseTo(0.2, 6)
  })

  test('never smaller than about 22 km a side, so "in La Romana" includes Casa de Campo', () => {
    // La Romana: Google's box is only ~8 km tall and just short of Casa de Campo (18.40, -68.90).
    const rect = cityRect({
      low: { latitude: 18.398, longitude: -69.049 },
      high: { latitude: 18.471, longitude: -68.883 },
    })
    expect(rect).not.toBeNull()
    expect(rect!.maxLat - rect!.minLat).toBeGreaterThanOrEqual(0.2 - 1e-9)
    expect(rect!.maxLng - rect!.minLng).toBeGreaterThanOrEqual(0.2 - 1e-9)
    // Casa de Campo's pin is inside it, and so is the town centre
    const inside = (lat: number, lng: number) =>
      lat >= rect!.minLat && lat <= rect!.maxLat && lng >= rect!.minLng && lng <= rect!.maxLng
    expect(inside(18.4, -68.9)).toBe(true)
    expect(inside(18.434, -68.966)).toBe(true)
  })

  test('grows around the middle of the box, not from a corner', () => {
    const rect = cityRect({
      low: { latitude: 10, longitude: 20 },
      high: { latitude: 10.02, longitude: 20.02 },
    })
    expect((rect!.minLat + rect!.maxLat) / 2).toBeCloseTo(10.01, 6)
    expect((rect!.minLng + rect!.maxLng) / 2).toBeCloseTo(20.01, 6)
  })

  test('a box with a missing corner, or one crossing the antimeridian, is not usable', () => {
    expect(cityRect(null)).toBeNull()
    expect(cityRect({})).toBeNull()
    expect(cityRect({ low: { latitude: 1 }, high: { latitude: 2, longitude: 3 } })).toBeNull()
    expect(
      cityRect({
        low: { latitude: -18, longitude: 178 },
        high: { latitude: -17, longitude: -178 },
      }),
    ).toBeNull()
  })
})

describe('parseCityIds', () => {
  const id = (n: number) => `ChIJ${String(n).padStart(8, '0')}abcdef`

  test('keeps only what looks like a Google place id — it goes into a URL', () => {
    expect(parseCityIds(`${id(1)},../../etc,${id(2)},a b c,`)).toEqual([id(1), id(2)])
    expect(parseCityIds('short,x')).toEqual([])
  })

  test('no repeats, and no more than five cities', () => {
    expect(parseCityIds(`${id(1)},${id(1)}`)).toEqual([id(1)])
    const eight = Array.from({ length: 8 }, (_, i) => id(i + 1)).join(',')
    expect(parseCityIds(eight)).toHaveLength(5)
  })

  test('nothing sent is nothing picked', () => {
    expect(parseCityIds(undefined)).toEqual([])
    expect(parseCityIds('')).toEqual([])
  })
})

describe('toCitySuggestion', () => {
  const city = (name: string, secondaryText: string | null): Prediction => ({
    provider: 'google',
    providerPlaceId: `id-${name}`,
    name,
    secondaryText,
    distanceM: null,
  })

  test('a foreign city carries its country', () => {
    expect(toCitySuggestion(city('Santa Marta', 'Magdalena, Colombia'))).toEqual({
      placeId: 'id-Santa Marta',
      name: 'Santa Marta',
      subtitle: 'Magdalena, Colombia',
    })
  })

  test('a Dominican city has no secondary text from Google, and is labelled as one', () => {
    expect(toCitySuggestion(city('Santo Domingo Este', null)).subtitle).toBe('República Dominicana')
  })
})
