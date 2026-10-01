import { describe, expect, test } from 'bun:test'

import { areaFor, inSantoDomingo, placeIn, slugify } from './geo'
import type { GooglePlaceDetails } from './googlePlaces'

// Where a place is filed. The payloads below are what Google actually returned (Place Details,
// languageCode 'es', 2026-10-01), trimmed to the fields the filing reads — a hand-invented address
// would only test the shape we imagined.

const puntaCana: GooglePlaceDetails = {
  id: 'ChIJNymxO9WTqI4RrqSU6d-Uw4k',
  displayName: { text: 'SBG Punta Cana' },
  location: { latitude: 18.5584402, longitude: -68.3827458 },
  addressComponents: [
    // Google sends some components with no `types` at all.
    { longText: 'esquina Carretera Juanillo' },
    { longText: 'BlueMall', shortText: 'BlueMall', types: ['point_of_interest', 'establishment'] },
    { longText: 'Boulevard Turístico del Este', types: ['route'] },
    { longText: 'Punta Cana', shortText: 'Punta Cana', types: ['locality', 'political'] },
    {
      longText: 'Higüey',
      shortText: 'Higüey',
      types: ['administrative_area_level_2', 'political'],
    },
    {
      longText: 'La Altagracia',
      shortText: 'La Altagracia',
      types: ['administrative_area_level_1', 'political'],
    },
    { longText: 'República Dominicana', shortText: 'DO', types: ['country', 'political'] },
  ],
}

const miamiBeach: GooglePlaceDetails = {
  id: 'ChIJgYZ4DvG02YgR6zxax8FTfHo',
  displayName: { text: "Joe's Stone Crab" },
  location: { latitude: 25.769113, longitude: -80.135011 },
  addressComponents: [
    { longText: 'South Beach', shortText: 'South Beach', types: ['neighborhood', 'political'] },
    { longText: 'Miami Beach', shortText: 'Miami Beach', types: ['locality', 'political'] },
    {
      longText: 'Miami-Dade County',
      shortText: 'Miami-Dade County',
      types: ['administrative_area_level_2', 'political'],
    },
    { longText: 'Florida', shortText: 'FL', types: ['administrative_area_level_1', 'political'] },
    { longText: 'Estados Unidos', shortText: 'US', types: ['country', 'political'] },
  ],
}

const sectors = [
  { id: 'piantini', name: 'Piantini', lat: 18.4688, lng: -69.9374 },
  { id: 'naco', name: 'Naco', lat: 18.4832, lng: -69.9257 },
]

describe('inSantoDomingo', () => {
  test('the metro area is in; Punta Cana, Casa de Campo and Miami are not', () => {
    expect(inSantoDomingo(18.4688, -69.9374)).toBe(true) // Piantini
    expect(inSantoDomingo(18.4727, -69.8839)).toBe(true) // Zona Colonial side
    expect(inSantoDomingo(18.5584, -68.3827)).toBe(false) // Punta Cana
    expect(inSantoDomingo(18.4, -68.9)).toBe(false) // Casa de Campo
    expect(inSantoDomingo(25.7691, -80.135)).toBe(false) // Miami Beach
  })

  test('the edges of the box are inside it', () => {
    expect(inSantoDomingo(18.3, -70.1)).toBe(true)
    expect(inSantoDomingo(18.65, -69.6)).toBe(true)
    expect(inSantoDomingo(18.29, -69.9)).toBe(false)
    expect(inSantoDomingo(18.4, -69.59)).toBe(false)
  })
})

describe('slugify', () => {
  test('lowercases, strips accents, and collapses punctuation to single dashes', () => {
    expect(slugify('Higüey')).toBe('higuey')
    expect(slugify('Santo Domingo Este')).toBe('santo-domingo-este')
    expect(slugify("  Miami-Dade  County's ")).toBe('miami-dade-county-s')
  })

  test('keeps letters from other scripts, so two such cities do not share a slug', () => {
    expect(slugify('東京')).toBe('東京')
    expect(slugify('大阪')).not.toBe(slugify('東京'))
  })

  test('nothing but punctuation leaves nothing', () => {
    expect(slugify('—·—')).toBe('')
  })
})

describe('areaFor', () => {
  test('a Punta Cana restaurant is filed under Punta Cana, in the Dominican Republic', () => {
    expect(areaFor(puntaCana)).toEqual({
      slug: 'do-punta-cana',
      name: 'Punta Cana',
      city: 'Punta Cana',
      countryCode: 'do',
      lat: 18.5584402,
      lng: -68.3827458,
    })
  })

  test('the city wins over the neighborhood inside it: Miami Beach, not South Beach', () => {
    const area = areaFor(miamiBeach)
    expect(area?.slug).toBe('us-miami-beach')
    expect(area?.name).toBe('Miami Beach')
    expect(area?.countryCode).toBe('us')
  })

  test('with no locality it falls back to the next administrative level, then the country', () => {
    const noLocality = (types: string[][]): GooglePlaceDetails => ({
      ...puntaCana,
      addressComponents: [
        ...types.map((t, i) => ({ longText: `Level ${i}`, types: t })),
        { longText: 'República Dominicana', shortText: 'DO', types: ['country'] },
      ],
    })
    expect(
      areaFor(noLocality([['administrative_area_level_2'], ['administrative_area_level_1']]))?.name,
    ).toBe('Level 0')
    expect(areaFor(noLocality([['administrative_area_level_1']]))?.name).toBe('Level 0')
    expect(areaFor(noLocality([]))?.name).toBe('República Dominicana')
  })

  test('the same city always yields the same slug, whichever restaurant asks', () => {
    const another: GooglePlaceDetails = {
      ...puntaCana,
      location: { latitude: 18.6, longitude: -68.4 },
    }
    expect(areaFor(another)?.slug).toBe(areaFor(puntaCana)?.slug)
  })

  test('no country, or no location, means nothing honest to file it under', () => {
    const noCountry = {
      ...puntaCana,
      addressComponents: puntaCana.addressComponents?.filter((c) => !c.types?.includes('country')),
    }
    expect(areaFor(noCountry)).toBeNull()
    expect(areaFor({ ...puntaCana, location: undefined })).toBeNull()
    expect(areaFor({ id: 'x' })).toBeNull()
  })
})

describe('placeIn', () => {
  const inPiantini: GooglePlaceDetails = {
    id: 'ChIJ-sd',
    location: { latitude: 18.4688, longitude: -69.9374 },
    addressComponents: [
      { longText: 'Naco', shortText: 'Naco', types: ['sublocality_level_1', 'sublocality'] },
      { longText: 'Santo Domingo', shortText: 'Santo Domingo', types: ['locality', 'political'] },
      { longText: 'República Dominicana', shortText: 'DO', types: ['country', 'political'] },
    ],
  }

  test('inside Santo Domingo it is one of the sectors, resolved the way it always was', () => {
    const placing = placeIn(inPiantini, sectors)
    expect(placing?.kind).toBe('sector')
    expect(placing?.kind === 'sector' && placing.hood.id).toBe('naco') // Google says Naco
  })

  test('outside Santo Domingo it is the area for its city, never the nearest sector', () => {
    const placing = placeIn(puntaCana, sectors)
    expect(placing?.kind).toBe('area')
    expect(placing?.kind === 'area' && placing.area.slug).toBe('do-punta-cana')
  })

  test('a place the other side of the world is filed the same way', () => {
    const placing = placeIn(miamiBeach, sectors)
    expect(placing?.kind === 'area' && placing.area.slug).toBe('us-miami-beach')
  })

  test('with no sectors to choose from, a Santo Domingo place cannot be placed', () => {
    expect(placeIn(inPiantini, [])).toBeNull()
  })

  test('with no location it cannot be placed', () => {
    expect(placeIn({ id: 'x' }, sectors)).toBeNull()
  })
})
