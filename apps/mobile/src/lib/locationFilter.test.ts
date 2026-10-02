import { describe, expect, test } from 'bun:test'

import {
  type City,
  DEFAULT_LOCATION,
  type LocationFilter,
  type LocationWords,
  MAX_LOCATIONS,
  addItem,
  addLocation,
  applyDefaultLocation,
  getDefaultLocation,
  getLocation,
  isDefaultLocation,
  itemKey,
  locationLabel,
  locationParams,
  locationQuery,
  parseStoredDefault,
  removeItem,
  removeLocation,
  resetLocation,
  sameLocation,
} from './locationFilter'

const miami: City = { placeId: 'ChIJ-miami-0001', name: 'Miami', subtitle: 'Florida, EE. UU.' }
const madrid: City = { placeId: 'ChIJ-madrid-0001', name: 'Madrid', subtitle: 'España' }
const city = (c: City) => ({ kind: 'city' as const, ...c })
const names = (f: LocationFilter) => f.map((i) => (i.kind === 'city' ? i.name : i.kind))
const words: LocationWords = { home: 'Santo Domingo, RD', sd: 'Santo Domingo' }

describe('the default', () => {
  test('is Santo Domingo until the member chooses another city', () => {
    expect(DEFAULT_LOCATION).toEqual([{ kind: 'sd' }])
    expect(isDefaultLocation(DEFAULT_LOCATION)).toBe(true)
    expect(getDefaultLocation()).toEqual(DEFAULT_LOCATION)
  })

  test('is not the default once anything else is chosen or added', () => {
    expect(isDefaultLocation([city(miami)])).toBe(false)
    expect(isDefaultLocation([{ kind: 'sd' }, city(miami)])).toBe(false)
  })

  test('sameLocation compares the places, in order', () => {
    expect(sameLocation([city(miami), city(madrid)], [city(miami), city(madrid)])).toBe(true)
    expect(sameLocation([city(miami), city(madrid)], [city(madrid), city(miami)])).toBe(false)
    expect(sameLocation([city(miami)], [city(miami), city(madrid)])).toBe(false)
  })
})

describe('addItem', () => {
  test('a city is added beside the others, in the order picked', () => {
    const f = addItem(addItem(DEFAULT_LOCATION, city(miami)), city(madrid))
    expect(names(f)).toEqual(['sd', 'Miami', 'Madrid'])
  })

  test('adding what is already there changes nothing', () => {
    const once = addItem(DEFAULT_LOCATION, city(miami))
    expect(addItem(once, city(miami))).toBe(once)
    expect(addItem(DEFAULT_LOCATION, { kind: 'sd' })).toBe(DEFAULT_LOCATION)
  })

  test(`at most ${MAX_LOCATIONS} places in all`, () => {
    let f: LocationFilter = DEFAULT_LOCATION
    for (let i = 0; i < MAX_LOCATIONS + 2; i++) {
      f = addItem(f, city({ placeId: `ChIJ-${i}-padding-id`, name: `C${i}`, subtitle: '' }))
    }
    expect(f).toHaveLength(MAX_LOCATIONS)
    expect(names(f)[0]).toBe('sd')
  })
})

describe('removeItem', () => {
  test('drops one place and keeps the rest', () => {
    const f = addItem(addItem(DEFAULT_LOCATION, city(miami)), city(madrid))
    expect(names(removeItem(f, itemKey(city(miami))))).toEqual(['sd', 'Madrid'])
  })

  test('removing the last place is not "nowhere" — it is the default', () => {
    expect(removeItem([city(miami)], itemKey(city(miami)))).toEqual(DEFAULT_LOCATION)
    expect(removeItem(DEFAULT_LOCATION, 'sd')).toEqual(DEFAULT_LOCATION)
  })

  test("…and a member's own default, when they have set one", () => {
    expect(removeItem([city(madrid)], itemKey(city(madrid)), [city(miami)])).toEqual([city(miami)])
  })
})

describe('locationParams — what the API takes', () => {
  test('Santo Domingo alone', () => {
    expect(locationParams(DEFAULT_LOCATION)).toEqual({ where: 'sd', cities: [] })
  })

  test('Santo Domingo plus cities: the sectors and the cities', () => {
    expect(locationParams([{ kind: 'sd' }, city(miami)])).toEqual({
      where: 'sd',
      cities: ['ChIJ-miami-0001'],
    })
  })

  test('cities only: where is none, so only the cities are searched', () => {
    expect(locationParams([city(miami), city(madrid)])).toEqual({
      where: 'none',
      cities: ['ChIJ-miami-0001', 'ChIJ-madrid-0001'],
    })
  })
})

describe('locationQuery', () => {
  test('a URL fragment, which is also the cache key for the search it scopes', () => {
    expect(locationQuery(DEFAULT_LOCATION)).toBe('where=sd')
    expect(locationQuery([{ kind: 'sd' }, city(miami), city(madrid)])).toBe(
      'where=sd&cities=ChIJ-miami-0001,ChIJ-madrid-0001',
    )
    expect(locationQuery([city(miami)])).toBe('where=none&cities=ChIJ-miami-0001')
  })
})

describe('locationLabel', () => {
  test('Santo Domingo alone says it in full', () => {
    expect(locationLabel(DEFAULT_LOCATION, words)).toBe('Santo Domingo, RD')
  })

  test('otherwise it lists the places', () => {
    expect(locationLabel([{ kind: 'sd' }, city(miami)], words)).toBe('Santo Domingo · Miami')
    expect(locationLabel([city(miami), city(madrid)], words)).toBe('Miami · Madrid')
    expect(locationLabel([city(miami)], words)).toBe('Miami')
  })
})

describe('parseStoredDefault', () => {
  test('reads what was saved', () => {
    expect(parseStoredDefault(JSON.stringify({ kind: 'sd' }))).toEqual({ kind: 'sd' })
    expect(parseStoredDefault(JSON.stringify(city(miami)))).toEqual(city(miami))
  })

  test('anything else is nothing — a stale or damaged value never breaks the filter', () => {
    expect(parseStoredDefault(null)).toBeNull()
    expect(parseStoredDefault('')).toBeNull()
    expect(parseStoredDefault('not json')).toBeNull()
    expect(parseStoredDefault('42')).toBeNull()
    expect(parseStoredDefault(JSON.stringify({ kind: 'do' }))).toBeNull()
    expect(parseStoredDefault(JSON.stringify({ kind: 'city', name: 'Miami' }))).toBeNull()
    expect(
      parseStoredDefault(JSON.stringify({ kind: 'city', placeId: '', name: 'x', subtitle: '' })),
    ).toBeNull()
  })
})

describe('the shared value', () => {
  test('add, remove and reset move the one filter every screen reads', () => {
    resetLocation()
    expect(getLocation()).toEqual(DEFAULT_LOCATION)
    addLocation(city(miami))
    expect(names(getLocation())).toEqual(['sd', 'Miami'])
    removeLocation(itemKey(city(miami)))
    expect(getLocation()).toEqual(DEFAULT_LOCATION)
    addLocation(city(madrid))
    resetLocation()
    expect(getLocation()).toEqual(DEFAULT_LOCATION)
  })

  test('choosing a default city starts the search there, and reset comes back to it', () => {
    applyDefaultLocation(city(miami))
    expect(getDefaultLocation()).toEqual([city(miami)])
    expect(getLocation()).toEqual([city(miami)])
    expect(isDefaultLocation(getLocation())).toBe(true)

    addLocation(city(madrid))
    expect(isDefaultLocation(getLocation())).toBe(false)
    resetLocation()
    expect(getLocation()).toEqual([city(miami)])
    // removing the lone default does not leave the filter empty
    removeLocation(itemKey(city(miami)))
    expect(getLocation()).toEqual([city(miami)])

    applyDefaultLocation({ kind: 'sd' }) // leave the shared state as we found it
    expect(getLocation()).toEqual(DEFAULT_LOCATION)
  })
})
