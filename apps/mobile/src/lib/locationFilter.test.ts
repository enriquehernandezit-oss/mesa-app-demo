import { describe, expect, test } from 'bun:test'

import {
  type City,
  DEFAULT_LOCATION,
  type LocationFilter,
  type LocationWords,
  MAX_CITIES,
  addItem,
  addLocation,
  getLocation,
  isDefaultLocation,
  itemKey,
  locationLabel,
  locationParams,
  locationQuery,
  removeItem,
  removeLocation,
  resetLocation,
} from './locationFilter'

const miami: City = { placeId: 'ChIJ-miami-0001', name: 'Miami', subtitle: 'Florida, EE. UU.' }
const madrid: City = { placeId: 'ChIJ-madrid-0001', name: 'Madrid', subtitle: 'España' }
const city = (c: City) => ({ kind: 'city' as const, ...c })
const kinds = (f: LocationFilter) => f.map((i) => i.kind)

describe('the default', () => {
  test('is Santo Domingo, and nothing else', () => {
    expect(DEFAULT_LOCATION).toEqual([{ kind: 'sd' }])
    expect(isDefaultLocation(DEFAULT_LOCATION)).toBe(true)
  })

  test('is not the default once anything else is chosen', () => {
    expect(isDefaultLocation([{ kind: 'do' }])).toBe(false)
    expect(isDefaultLocation([{ kind: 'sd' }, city(miami)])).toBe(false)
  })
})

describe('addItem', () => {
  test('a city is added beside Santo Domingo — both are searched', () => {
    expect(kinds(addItem(DEFAULT_LOCATION, city(miami)))).toEqual(['sd', 'city'])
  })

  test('cities keep the order they were picked in', () => {
    const f = addItem(addItem(DEFAULT_LOCATION, city(miami)), city(madrid))
    expect(f.map((i) => (i.kind === 'city' ? i.name : i.kind))).toEqual(['sd', 'Miami', 'Madrid'])
  })

  test('adding what is already there changes nothing', () => {
    const once = addItem(DEFAULT_LOCATION, city(miami))
    expect(addItem(once, city(miami))).toBe(once)
    expect(addItem(DEFAULT_LOCATION, { kind: 'sd' })).toBe(DEFAULT_LOCATION)
  })

  test('the Dominican Republic contains Santo Domingo, so it replaces it — and keeps the cities', () => {
    const f = addItem(addItem(DEFAULT_LOCATION, city(miami)), { kind: 'do' })
    expect(kinds(f)).toEqual(['do', 'city'])
  })

  test('Santo Domingo is not added inside the Dominican Republic', () => {
    const f = addItem([{ kind: 'do' }], { kind: 'sd' })
    expect(kinds(f)).toEqual(['do'])
  })

  test('the world replaces everything', () => {
    const f = addItem(addItem(DEFAULT_LOCATION, city(miami)), { kind: 'world' })
    expect(f).toEqual([{ kind: 'world' }])
  })

  test('a city narrows "everywhere" to itself — you are now looking somewhere in particular', () => {
    expect(kinds(addItem([{ kind: 'world' }], city(miami)))).toEqual(['city'])
  })

  test(`at most ${MAX_CITIES} cities`, () => {
    let f: LocationFilter = DEFAULT_LOCATION
    for (let i = 0; i < MAX_CITIES + 2; i++) {
      f = addItem(f, city({ placeId: `ChIJ-city-${i}-0000`, name: `City ${i}`, subtitle: 'x' }))
    }
    expect(f.filter((i) => i.kind === 'city')).toHaveLength(MAX_CITIES)
  })
})

describe('removeItem', () => {
  test('removes one place and leaves the rest', () => {
    const f = addItem(DEFAULT_LOCATION, city(miami))
    expect(kinds(removeItem(f, itemKey(city(miami))))).toEqual(['sd'])
    expect(kinds(removeItem(f, 'sd'))).toEqual(['city'])
  })

  test('removing the last place is not "nowhere": it is back to the default', () => {
    expect(removeItem([city(miami)], itemKey(city(miami)))).toEqual(DEFAULT_LOCATION)
    expect(removeItem(DEFAULT_LOCATION, 'sd')).toEqual(DEFAULT_LOCATION)
  })
})

describe('locationParams — what the API takes', () => {
  test('the widest preset wins, and the cities are their Google ids', () => {
    expect(locationParams(DEFAULT_LOCATION)).toEqual({ where: 'sd', cities: [] })
    expect(locationParams([{ kind: 'do' }, city(miami)])).toEqual({
      where: 'do',
      cities: [miami.placeId],
    })
    expect(locationParams([{ kind: 'world' }])).toEqual({ where: 'world', cities: [] })
  })

  test('with only cities there is no preset: "none"', () => {
    expect(locationParams([city(miami), city(madrid)])).toEqual({
      where: 'none',
      cities: [miami.placeId, madrid.placeId],
    })
  })

  test('as a query string — the same text is the cache key of the search it scopes', () => {
    expect(locationQuery(DEFAULT_LOCATION)).toBe('where=sd')
    expect(locationQuery([{ kind: 'sd' }, city(miami), city(madrid)])).toBe(
      `where=sd&cities=${miami.placeId},${madrid.placeId}`,
    )
    expect(locationQuery([city(miami)])).toBe(`where=none&cities=${miami.placeId}`)
  })
})

describe('locationLabel', () => {
  const words: LocationWords = {
    home: 'Santo Domingo, RD',
    sd: 'Santo Domingo',
    do: 'República Dominicana',
    world: 'Todo el mundo',
  }

  test('the default says where you are, in full', () => {
    expect(locationLabel(DEFAULT_LOCATION, words)).toBe('Santo Domingo, RD')
  })

  test('anything else lists what is selected', () => {
    expect(locationLabel([{ kind: 'sd' }, city(miami)], words)).toBe('Santo Domingo · Miami')
    expect(locationLabel([city(miami), city(madrid)], words)).toBe('Miami · Madrid')
    expect(locationLabel([{ kind: 'do' }], words)).toBe('República Dominicana')
    expect(locationLabel([{ kind: 'world' }], words)).toBe('Todo el mundo')
  })
})

describe('the shared value', () => {
  test('is shared by whoever reads it, changes with add and remove, and resets to the default', () => {
    resetLocation()
    expect(getLocation()).toEqual(DEFAULT_LOCATION)
    addLocation(city(miami))
    expect(kinds(getLocation())).toEqual(['sd', 'city'])
    removeLocation('sd')
    expect(kinds(getLocation())).toEqual(['city'])
    resetLocation()
    expect(getLocation()).toEqual(DEFAULT_LOCATION)
  })
})
