import { describe, expect, test } from 'bun:test'

import type { AreaDraft } from './geo'
import type { MesaFieldsFromGoogle } from './googlePlaces'
import { type EnrichRow, PIN_MOVE_MIN_M, type Target, enrichPatch } from './placeFacts'

// enrichPatch decides what places:enrich and places:merge write to a real row. A wrong answer
// destroys a real value or keeps a fake one, so the rules are pinned here rather than only via a
// dry run.

const HOOD = 'hood-piantini'

const row = (over: Partial<EnrichRow> = {}): EnrichRow => ({
  id: 'r1',
  name: 'Casa Luca',
  lat: 18.4688,
  lng: -69.9374,
  neighborhoodId: HOOD,
  googlePlaceId: 'ChIJ-existing',
  phone: '+1 809-541-4101',
  website: 'https://real.example/',
  address: 'Calle Uno 5',
  locality: 'Santo Domingo',
  priceTier: 2,
  closesAt: '11p',
  cuisine: 'Italian',
  ...over,
})

// Google's view of the same place, on exactly the same spot unless a test moves it.
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
  ...over,
})

const sector = (hoodId: string): Target => ({ kind: 'sector', hoodId })

const patchFor = (r: EnrichRow, g: MesaFieldsFromGoogle, hood = HOOD) =>
  enrichPatch(r, g, 'ChIJ-existing', sector(hood))

describe('enrichPatch — a complete row', () => {
  test('is left completely alone: nothing already filled is overwritten', () => {
    expect(patchFor(row(), google())).toEqual({})
  })
})

describe('enrichPatch — filling empty fields', () => {
  test('fills exactly the empty ones and nothing else', () => {
    const patch = patchFor(
      row({ phone: null, website: null, address: null, priceTier: null }),
      google(),
    )
    expect(patch).toEqual({
      phone: '+1 809-000-0000',
      website: 'https://google.example/',
      address: 'Calle Google 9',
      priceTier: 4,
    })
  })

  test('does not write a null over a null: Google having nothing is no change', () => {
    const patch = patchFor(
      row({ website: null, priceTier: null, closesAt: null, cuisine: null }),
      google({ website: null, priceTier: null, closesAt: null, cuisine: null }),
    )
    expect(patch).toEqual({})
  })

  test('a price tier of 1 is a value, not an absence', () => {
    expect(patchFor(row({ priceTier: null }), google({ priceTier: 1 })).priceTier).toBe(1)
  })
})

describe('enrichPatch — invented contacts', () => {
  test("the seed's placeholder phone is replaced by Google's real one", () => {
    expect(patchFor(row({ phone: '+18095551004' }), google()).phone).toBe('+1 809-000-0000')
  })

  test('and cleared when Google has none — a fake is worse than nothing', () => {
    expect(patchFor(row({ phone: '+18095551004' }), google({ phone: null }))).toEqual({
      phone: null,
    })
  })

  test("the seed's guessed homepage is replaced, or cleared when Google has none", () => {
    const fake = row({ website: 'https://casaluca.do' })
    expect(patchFor(fake, google()).website).toBe('https://google.example/')
    expect(patchFor(fake, google({ website: null }))).toEqual({ website: null })
  })

  test('a real phone or homepage that differs from Google is never overwritten', () => {
    const patch = patchFor(
      row({ phone: '+1 809-123-4567', website: 'https://ours.example/' }),
      google(),
    )
    expect(patch).toEqual({})
  })
})

describe('enrichPatch — the Google id', () => {
  test('is attached when the row had none', () => {
    expect(
      enrichPatch(row({ googlePlaceId: null }), google(), 'ChIJ-new', sector(HOOD)).googlePlaceId,
    ).toBe('ChIJ-new')
  })

  test('is never replaced once there', () => {
    expect(enrichPatch(row(), google(), 'ChIJ-other', sector(HOOD)).googlePlaceId).toBeUndefined()
  })
})

// Roughly: 0.001° of latitude is 111 m.
describe('enrichPatch — the map pin follows Google', () => {
  test('a pin within 50 m of Google is the same spot and stays put', () => {
    expect(PIN_MOVE_MIN_M).toBe(50)
    expect(patchFor(row(), google({ lat: 18.4688 + 0.0003 }))).toEqual({})
  })

  test("a pin further off moves to Google's exact location", () => {
    const moved = google({ lat: 18.4698, lng: -69.9364 })
    expect(patchFor(row(), moved)).toEqual({ lat: moved.lat, lng: moved.lng })
  })

  test('the neighborhood follows the pin — but only when the pin moved and the hood differs', () => {
    const far = google({ lat: 18.4688 + 0.02 })
    expect(patchFor(row(), far, 'hood-naco').neighborhoodId).toBe('hood-naco')
    // moved, but Google's spot is still the same neighborhood
    expect(patchFor(row(), far, HOOD)).not.toHaveProperty('neighborhoodId')
    // a pin that did not move never re-files the place, even if the resolver disagrees
    expect(patchFor(row(), google(), 'hood-naco')).toEqual({})
  })

  test('Google having no location at all leaves the pin alone', () => {
    expect(patchFor(row(), google({ lat: 0, lng: 0 }))).toEqual({})
  })
})

describe('enrichPatch — idempotence', () => {
  test('applying a patch and running again changes nothing', () => {
    const before = row({
      googlePlaceId: null,
      phone: '+18095551004',
      website: 'https://casaluca.do',
      address: null,
      locality: null,
      priceTier: null,
      lat: 18.5,
      lng: -69.9,
    })
    const fields = google()
    const patch = enrichPatch(before, fields, 'ChIJ-new', sector('hood-naco'))
    expect(patch.lat).toBe(fields.lat)
    expect(patch.neighborhoodId).toBe('hood-naco')
    const after = { ...before, ...patch } as EnrichRow
    expect(enrichPatch(after, fields, 'ChIJ-new', sector('hood-naco'))).toEqual({})
  })
})

// A place outside Santo Domingo is filed under the area for its city — and, unlike a sector, that
// does not wait for the pin to move: it was only ever under a Santo Domingo sector because that was
// the nearest thing to file it under.
describe('enrichPatch — a place outside Santo Domingo', () => {
  const draft: AreaDraft = {
    slug: 'do-punta-cana',
    name: 'Punta Cana',
    city: 'Punta Cana',
    countryCode: 'do',
    lat: 18.56,
    lng: -68.37,
  }
  const puntaCana = google({ lat: draft.lat, lng: draft.lng })
  const misfiled = row({ lat: draft.lat, lng: draft.lng, neighborhoodId: HOOD })

  test('an area that does not exist yet is asked for, even though the pin did not move', () => {
    const target: Target = { kind: 'area', hoodId: null, draft }
    expect(enrichPatch(misfiled, puntaCana, 'ChIJ-existing', target)).toEqual({ area: draft })
  })

  test('an area that exists is adopted by id', () => {
    const target: Target = { kind: 'area', hoodId: 'area-punta-cana', draft }
    expect(enrichPatch(misfiled, puntaCana, 'ChIJ-existing', target)).toEqual({
      neighborhoodId: 'area-punta-cana',
    })
  })

  test('a place already under its area is left alone', () => {
    const target: Target = { kind: 'area', hoodId: 'area-punta-cana', draft }
    const filed = row({ lat: draft.lat, lng: draft.lng, neighborhoodId: 'area-punta-cana' })
    expect(enrichPatch(filed, puntaCana, 'ChIJ-existing', target)).toEqual({})
  })

  test('no location from Google files nothing, in any direction', () => {
    const target: Target = { kind: 'area', hoodId: null, draft }
    expect(enrichPatch(misfiled, google({ lat: 0, lng: 0 }), 'ChIJ-existing', target)).toEqual({})
  })
})
