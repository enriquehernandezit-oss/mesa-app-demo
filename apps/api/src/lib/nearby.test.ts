import { describe, expect, test } from 'bun:test'

import { DEFAULT_RADIUS_M, parseNear, parseRadius } from './nearby'

describe('parseNear', () => {
  test('reads "lat,lng"', () => {
    expect(parseNear('18.472,-69.931')).toEqual({ lat: 18.472, lng: -69.931 })
  })
  test('refuses anything that is not a real coordinate', () => {
    for (const bad of [undefined, '', 'x,y', '18.4', '18,1,2', '91,0', '0,181', 'NaN,1']) {
      expect(parseNear(bad)).toBeNull()
    }
  })
})

describe('parseRadius', () => {
  test('defaults, and stays within 500 m – 20 km', () => {
    expect(parseRadius(undefined)).toBe(DEFAULT_RADIUS_M)
    expect(parseRadius('abc')).toBe(DEFAULT_RADIUS_M)
    expect(parseRadius('100')).toBe(500)
    expect(parseRadius('1000000')).toBe(20_000)
    expect(parseRadius('2500')).toBe(2500)
  })
})
