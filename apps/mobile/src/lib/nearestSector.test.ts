/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'

import { nearestSector } from './nearestSector'

const sectors = [
  { slug: 'piantini', name: 'Piantini', lat: 18.4688, lng: -69.9374 },
  { slug: 'naco', name: 'Naco', lat: 18.4728, lng: -69.9272 },
  { slug: 'zona-colonial', name: 'Zona Colonial', lat: 18.4739, lng: -69.8849 },
  { slug: 'no-centre', name: 'Unknown' },
]

describe('nearestSector', () => {
  test('picks the sector whose centre is closest', () => {
    expect(nearestSector({ lat: 18.4695, lng: -69.936 }, sectors)?.slug).toBe('piantini')
    expect(nearestSector({ lat: 18.4735, lng: -69.8855 }, sectors)?.slug).toBe('zona-colonial')
  })

  test('ignores a sector with no centre', () => {
    expect(nearestSector({ lat: 18.4688, lng: -69.9374 }, [sectors[3] as never])).toBeNull()
  })

  test('someone far from every sector is not filed under the least-far one', () => {
    // Punta Cana
    expect(nearestSector({ lat: 18.5601, lng: -68.3725 }, sectors)).toBeNull()
    // Miami
    expect(nearestSector({ lat: 25.76, lng: -80.19 }, sectors)).toBeNull()
  })

  test('no sectors, no suggestion', () => {
    expect(nearestSector({ lat: 18.47, lng: -69.93 }, [])).toBeNull()
  })
})
