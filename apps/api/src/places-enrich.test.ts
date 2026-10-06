import { describe, expect, test } from 'bun:test'

import type { MesaFieldsFromGoogle } from './lib/googlePlaces'
import { CONFIRM_ABOVE, acceptSearchHit, callKey } from './places-enrich'

// acceptSearchHit decides whether a Google hit is the restaurant we searched for at all — a wrong
// answer attaches a stranger's id and phone number to a real place.

// Google's view of a place on the same spot as the test row, unless a test moves it.
const google = (over: Partial<MesaFieldsFromGoogle> = {}): MesaFieldsFromGoogle => ({
  name: 'Casa Luca',
  lat: 18.4688,
  lng: -69.9374,
  address: 'Calle Google 9',
  locality: 'Santo Domingo',
  phone: '+1 809-000-0000',
  website: 'https://google.example/',
  priceTier: 4,
  cuisine: 'Pizza',
  closesAt: '1a',
  closedAt: null,
  openingHours: null,
  sublocality: null,
  ...over,
})

describe('acceptSearchHit', () => {
  const r = { name: 'Boga Boga', lat: 18.4688, lng: -69.9374 }
  const hit = (over: Partial<MesaFieldsFromGoogle> = {}) => google({ name: 'Boga Boga', ...over })

  test('accepts the same name, in the city, at an eating place — and says how far off the pin is', () => {
    const v = acceptSearchHit(r, hit({ lat: 18.4692, lng: -69.9374 }), true)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.distanceM).toBeLessThan(100)
  })

  test("distance from Mesa's pin is NOT a gate: the pin is what is being corrected", () => {
    // ~2.2 km north of where Mesa has it — the seed's hand-placed pins were often that far off
    const v = acceptSearchHit(r, hit({ lat: 18.4888 }), true)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.distanceM).toBeGreaterThan(2000)
  })

  test('a Google name that only adds words still agrees', () => {
    expect(acceptSearchHit(r, hit({ name: 'Boga Boga Restaurante' }), true).ok).toBe(true)
  })

  test('rejects a name match that is not somewhere you eat', () => {
    // "Marocha" came back as a hair salon; "Cantábrico" as a condominium
    expect(acceptSearchHit(r, hit(), false)).toEqual({ ok: false, reason: 'not_food' })
  })

  test('rejects a different restaurant', () => {
    expect(acceptSearchHit(r, hit({ name: 'Zola' }), true)).toEqual({
      ok: false,
      reason: 'name_mismatch',
    })
  })

  test('rejects a namesake in another city or country', () => {
    // Segundo Muelle came back as its Panama City branch; Santo Domingo, Ecuador
    expect(acceptSearchHit(r, hit({ lat: 8.98, lng: -79.52 }), true)).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    })
    expect(acceptSearchHit(r, hit({ lat: -0.25, lng: -79.17 }), true)).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    })
  })

  test('rejects a hit with no location at all', () => {
    expect(acceptSearchHit(r, hit({ lat: 0, lng: 0 }), true)).toEqual({
      ok: false,
      reason: 'no_location',
    })
  })
})

describe('the Google call a row costs', () => {
  test('a row with an id is fetched by id, one without is searched by name', () => {
    expect(callKey({ name: 'Laurel', googlePlaceId: 'ChIJ-1' })).toBe('id:ChIJ-1')
    expect(callKey({ name: 'Laurel', googlePlaceId: null })).toBe('q:Laurel')
  })

  test('a run bigger than a few hundred places has to be confirmed', () => {
    // This database is a couple of hundred places; a run past this is a surprise worth a flag.
    expect(CONFIRM_ABOVE).toBe(400)
  })
})
