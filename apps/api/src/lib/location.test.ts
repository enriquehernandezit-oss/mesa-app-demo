import { describe, expect, test } from 'bun:test'

import type { Rect } from './cities'
import { locationCondition, normalizeLocation, parseScope } from './location'

describe('parseScope', () => {
  test('knows the four values the app sends', () => {
    for (const v of ['sd', 'do', 'world', 'none'] as const) expect(parseScope(v)).toBe(v)
  })

  test('anything else — including nothing, an older app — is "no filter", not a default', () => {
    expect(parseScope(undefined)).toBeNull()
    expect(parseScope('')).toBeNull()
    expect(parseScope('moon')).toBeNull()
  })
})

describe('normalizeLocation', () => {
  const miami: Rect = { minLat: 25.6, maxLat: 25.9, minLng: -80.3, maxLng: -80.1 }

  test('"only my cities" with no city Google could place falls back to Santo Domingo', () => {
    expect(normalizeLocation('none', [])).toEqual({ scope: 'sd', rects: [] })
  })

  test('"only my cities" with a city stays that', () => {
    expect(normalizeLocation('none', [miami])).toEqual({ scope: 'none', rects: [miami] })
  })

  test('a preset is left alone, with or without cities beside it', () => {
    expect(normalizeLocation('do', [])).toEqual({ scope: 'do', rects: [] })
    expect(normalizeLocation('sd', [miami])).toEqual({ scope: 'sd', rects: [miami] })
  })
})

describe('locationCondition', () => {
  test('everywhere is no restriction at all', () => {
    expect(locationCondition({ scope: 'world', rects: [] })).toBeUndefined()
  })

  test('every other location is a restriction', () => {
    expect(locationCondition({ scope: 'sd', rects: [] })).toBeDefined()
    expect(locationCondition({ scope: 'do', rects: [] })).toBeDefined()
    expect(
      locationCondition({ scope: 'none', rects: [{ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 }] }),
    ).toBeDefined()
  })
})
