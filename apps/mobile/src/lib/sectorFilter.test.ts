/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'

import { COLLAPSED_COUNT, shownSectors } from './sectorFilter'

const sectors = Array.from({ length: 21 }, (_, i) => ({ slug: `s${i}`, name: `Sector ${i}` }))
sectors[3] = { slug: 'paraiso', name: 'Paraíso' }
sectors[15] = { slug: 'naco', name: 'Naco' }

describe('shownSectors', () => {
  test('collapsed: the first few, and how many are hidden', () => {
    const r = shownSectors(sectors, new Set(), '', false)
    expect(r.shown).toHaveLength(COLLAPSED_COUNT)
    expect(r.hidden).toBe(21 - COLLAPSED_COUNT)
  })

  test('a chosen sector leads even when it is far down the list', () => {
    const r = shownSectors(sectors, new Set(['naco']), '', false)
    expect(r.shown[0]?.slug).toBe('naco')
    expect(r.shown).toHaveLength(COLLAPSED_COUNT)
  })

  test('expanded shows everything', () => {
    const r = shownSectors(sectors, new Set(), '', true)
    expect(r.shown).toHaveLength(21)
    expect(r.hidden).toBe(0)
  })

  test('search ignores accents and case, and shows every match', () => {
    expect(shownSectors(sectors, new Set(), 'PARAISO', false).shown.map((s) => s.slug)).toEqual([
      'paraiso',
    ])
    expect(shownSectors(sectors, new Set(), 'sector 1', false).shown.length).toBeGreaterThan(
      COLLAPSED_COUNT,
    )
    expect(shownSectors(sectors, new Set(), 'zzz', false).shown).toEqual([])
  })
})
