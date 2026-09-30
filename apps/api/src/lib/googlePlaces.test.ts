import { describe, expect, test } from 'bun:test'

import {
  type GooglePlaceDetails,
  isEatingPlace,
  resolveNeighborhood,
  toMesaFields,
} from './googlePlaces'

// toMesaFields is the one place Google's vocabulary becomes Mesa's, and every write path
// (the profile refresh, add-from-Google, the Top 100 importer, places:enrich) goes through
// it — so its mapping is worth pinning against a hand-written payload, not a live call.

const place = (over: Partial<GooglePlaceDetails> = {}): GooglePlaceDetails => ({
  id: 'ChIJ-test',
  displayName: { text: 'La Cassina' },
  formattedAddress: 'Av. Roberto Pastoriza 504, Santo Domingo 10147',
  shortFormattedAddress: 'Av. Roberto Pastoriza 504',
  addressComponents: [
    { longText: 'Ensanche Quisqueya', types: ['sublocality_level_1', 'sublocality'] },
    { longText: 'Santo Domingo', types: ['locality', 'political'] },
  ],
  location: { latitude: 18.4688, longitude: -69.9374 },
  primaryType: 'mediterranean_restaurant',
  types: ['restaurant', 'mediterranean_restaurant', 'food'],
  priceLevel: 'PRICE_LEVEL_EXPENSIVE',
  nationalPhoneNumber: '(809) 363-4444',
  internationalPhoneNumber: '+1 809-363-4444',
  websiteUri: 'https://lacassina.example/',
  regularOpeningHours: {
    periods: [{ open: { day: 1, hour: 12 }, close: { day: 1, hour: 23 } }],
  },
  businessStatus: 'OPERATIONAL',
  ...over,
})

const closingAt = (...hours: (number | undefined)[]) => ({
  regularOpeningHours: {
    periods: hours.map((hour, day) => ({
      open: { day, hour: 9 },
      close: hour === undefined ? undefined : { day, hour },
    })),
  },
})

describe('toMesaFields — a full payload', () => {
  test("maps every field into Mesa's shape", () => {
    expect(toMesaFields(place())).toEqual({
      name: 'La Cassina',
      lat: 18.4688,
      lng: -69.9374,
      address: 'Av. Roberto Pastoriza 504',
      locality: 'Santo Domingo',
      phone: '+1 809-363-4444',
      website: 'https://lacassina.example/',
      priceTier: 3,
      cuisine: 'Mediterranean',
      closesAt: '11p',
      closedAt: null,
    })
  })

  test('an empty payload degrades to nulls, never throws', () => {
    expect(toMesaFields({ id: 'x' })).toEqual({
      name: '',
      lat: 0,
      lng: 0,
      address: null,
      locality: null,
      phone: null,
      website: null,
      priceTier: null,
      cuisine: null,
      closesAt: null,
      closedAt: null,
    })
  })
})

describe('toMesaFields — phone and address', () => {
  test('prefers the international phone, falls back to national, else null', () => {
    expect(toMesaFields(place()).phone).toBe('+1 809-363-4444')
    expect(toMesaFields(place({ internationalPhoneNumber: undefined })).phone).toBe(
      '(809) 363-4444',
    )
    expect(
      toMesaFields(place({ internationalPhoneNumber: undefined, nationalPhoneNumber: undefined }))
        .phone,
    ).toBeNull()
  })

  test('prefers the short address, falls back to the full one', () => {
    expect(toMesaFields(place({ shortFormattedAddress: undefined })).address).toBe(
      'Av. Roberto Pastoriza 504, Santo Domingo 10147',
    )
  })
})

describe('toMesaFields — website', () => {
  test('keeps http and https', () => {
    expect(toMesaFields(place({ websiteUri: 'http://jalao.do/' })).website).toBe('http://jalao.do/')
    expect(toMesaFields(place({ websiteUri: 'HTTPS://Example.do' })).website).toBe(
      'HTTPS://Example.do',
    )
  })

  test('drops any other scheme, so it can never land in an href', () => {
    expect(toMesaFields(place({ websiteUri: 'javascript:alert(1)' })).website).toBeNull()
    expect(toMesaFields(place({ websiteUri: 'ftp://files.example' })).website).toBeNull()
    expect(toMesaFields(place({ websiteUri: 'lacassina.example' })).website).toBeNull()
  })

  test('none is null', () => {
    expect(toMesaFields(place({ websiteUri: undefined })).website).toBeNull()
  })
})

describe('toMesaFields — price tier', () => {
  test.each([
    ['PRICE_LEVEL_FREE', 1],
    ['PRICE_LEVEL_INEXPENSIVE', 1],
    ['PRICE_LEVEL_MODERATE', 2],
    ['PRICE_LEVEL_EXPENSIVE', 3],
    ['PRICE_LEVEL_VERY_EXPENSIVE', 4],
  ])('%s → %d', (level, tier) => {
    expect(toMesaFields(place({ priceLevel: level })).priceTier).toBe(tier)
  })

  test('unspecified or absent is null — no price pill, not a guess', () => {
    expect(toMesaFields(place({ priceLevel: 'PRICE_LEVEL_UNSPECIFIED' })).priceTier).toBeNull()
    expect(toMesaFields(place({ priceLevel: undefined })).priceTier).toBeNull()
  })
})

describe('toMesaFields — cuisine', () => {
  test('the primary type wins over the others', () => {
    expect(
      toMesaFields(place({ primaryType: 'pizza_restaurant', types: ['italian_restaurant'] }))
        .cuisine,
    ).toBe('Pizza')
  })

  test('falls back to the first mappable type', () => {
    expect(
      toMesaFields(place({ primaryType: 'restaurant', types: ['food', 'sushi_restaurant'] }))
        .cuisine,
    ).toBe('Japanese')
  })

  test('an unmapped type is null, never a raw Google slug leaking into the Spanish UI', () => {
    expect(
      toMesaFields(place({ primaryType: 'bar', types: ['bar', 'night_club'] })).cuisine,
    ).toBeNull()
  })
})

describe('toMesaFields — closing hour', () => {
  test('is the MODAL closing hour across the week, not any one day', () => {
    // closes at 23 on five days and at 1 on two — the label is "11p"
    expect(toMesaFields(place(closingAt(23, 23, 23, 23, 23, 1, 1))).closesAt).toBe('11p')
  })

  test('formats hours the way the seed does: no leading zero, lowercase a/p', () => {
    expect(toMesaFields(place(closingAt(0))).closesAt).toBe('12a')
    expect(toMesaFields(place(closingAt(1))).closesAt).toBe('1a')
    expect(toMesaFields(place(closingAt(12))).closesAt).toBe('12p')
    expect(toMesaFields(place(closingAt(22))).closesAt).toBe('10p')
  })

  test('a period with no close time is skipped; no usable periods is null', () => {
    expect(toMesaFields(place(closingAt(undefined, 22, undefined))).closesAt).toBe('10p')
    expect(toMesaFields(place(closingAt(undefined))).closesAt).toBeNull()
    expect(toMesaFields(place({ regularOpeningHours: { periods: [] } })).closesAt).toBeNull()
    expect(toMesaFields(place({ regularOpeningHours: undefined })).closesAt).toBeNull()
  })
})

describe('toMesaFields — business status', () => {
  test('permanently closed is dated; anything else is not', () => {
    expect(toMesaFields(place({ businessStatus: 'CLOSED_PERMANENTLY' })).closedAt).toBeInstanceOf(
      Date,
    )
    expect(toMesaFields(place({ businessStatus: 'CLOSED_TEMPORARILY' })).closedAt).toBeNull()
    expect(toMesaFields(place({ businessStatus: 'OPERATIONAL' })).closedAt).toBeNull()
  })
})

describe('resolveNeighborhood', () => {
  const hoods = [
    { id: 'piantini', name: 'Piantini', lat: 18.4688, lng: -69.9374 },
    { id: 'naco', name: 'Naco', lat: 18.4832, lng: -69.9257 },
  ]

  test("prefers an address component that names one of Mesa's sectors", () => {
    const d = place({
      // physically closer to Piantini's centroid, but Google says Naco
      location: { latitude: 18.469, longitude: -69.9374 },
      addressComponents: [{ longText: 'Naco', types: ['sublocality_level_1'] }],
    })
    expect(resolveNeighborhood(d, hoods).id).toBe('naco')
  })

  test('matches accent- and case-insensitively', () => {
    const d = place({ addressComponents: [{ longText: 'PIANTINÍ', types: ['sublocality'] }] })
    expect(resolveNeighborhood(d, hoods).id).toBe('piantini')
  })

  test('falls back to the nearest centroid when no component names a sector', () => {
    const d = place({
      addressComponents: [{ longText: 'Santo Domingo', types: ['locality'] }],
      location: { latitude: 18.4825, longitude: -69.926 },
    })
    expect(resolveNeighborhood(d, hoods).id).toBe('naco')
  })
})

describe('isEatingPlace', () => {
  const kind = (primaryType?: string, types: string[] = []) => isEatingPlace({ primaryType, types })

  test('restaurants, bars and cafés, including the long tail of cuisines', () => {
    expect(kind('restaurant')).toBe(true)
    expect(kind('japanese_restaurant')).toBe(true)
    expect(kind('fast_food_restaurant')).toBe(true)
    expect(kind('wine_bar')).toBe(true)
    expect(kind('cafe')).toBe(true)
    expect(kind('night_club')).toBe(true)
  })

  test("any of Google's types counts, not only the primary one", () => {
    // La Parrilla Steak House: primarily a steak_house, also listing restaurant
    expect(kind('steak_house', ['steak_house', 'restaurant', 'food'])).toBe(true)
    // Punto y Corcho: primarily a wholesaler, but a wine bar and restaurant too
    expect(kind('wholesaler', ['wine_bar', 'bar', 'wholesaler', 'restaurant', 'food'])).toBe(true)
    // The Butcher Shop: a grocery store with a deli and a cafeteria
    expect(kind('grocery_store', ['cafeteria', 'deli', 'grocery_store', 'food_store'])).toBe(true)
  })

  test('bakeries and dessert shops are places to eat', () => {
    expect(kind('pastry_shop', ['pastry_shop', 'dessert_shop', 'bakery', 'food_store'])).toBe(true)
    expect(kind('salad_shop')).toBe(true)
  })

  test('what a name search actually brought back instead of a restaurant is not', () => {
    expect(kind('condominium_complex', ['condominium_complex', 'service'])).toBe(false)
    expect(kind('shoe_store', ['shoe_store', 'store'])).toBe(false)
    expect(kind('hair_salon', ['hair_salon', 'beauty_salon', 'service'])).toBe(false)
    expect(kind('book_store', ['book_store', 'store'])).toBe(false)
  })

  test('a liquor store is not, even though Google tags it `food`', () => {
    expect(kind('liquor_store', ['liquor_store', 'store', 'food'])).toBe(false)
    expect(kind(undefined, ['food'])).toBe(false)
  })

  test('a `_shop` that is not food is not admitted by suffix', () => {
    expect(kind('barber_shop')).toBe(false)
    expect(kind('gift_shop')).toBe(false)
  })

  test('no type information is not an eating place', () => {
    expect(kind()).toBe(false)
    expect(kind(undefined, [])).toBe(false)
  })
})
