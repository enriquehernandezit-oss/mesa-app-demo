import { describe, expect, test } from 'bun:test'

import { planRefile, sectorForSublocality } from './refile'

const sectors = [
  { id: 'piantini', name: 'Piantini', aliases: [] },
  { id: 'naco', name: 'Naco', aliases: ['Ensanche Naco'] },
  { id: 'paraiso', name: 'Paraíso', aliases: ['Ensanche Paraíso'] },
  { id: 'universitaria', name: 'Ciudad Universitaria', aliases: ['Zona Universitaria'] },
]
const row = (id: string, hood: string, sub: string | null) => ({
  id,
  name: id,
  neighborhoodId: hood,
  googleSublocality: sub,
})

describe('sectorForSublocality', () => {
  test('matches the name or an alias, ignoring accents and case', () => {
    expect(sectorForSublocality('ENSANCHE NACO', sectors)?.id).toBe('naco')
    expect(sectorForSublocality('paraiso', sectors)?.id).toBe('paraiso')
    expect(sectorForSublocality('Ensanche Paraíso', sectors)?.id).toBe('paraiso')
    expect(sectorForSublocality('Zona Universitaria', sectors)?.id).toBe('universitaria')
  })
  test('null for a name no sector claims, or none given', () => {
    expect(sectorForSublocality('Villa Duarte', sectors)).toBeNull()
    expect(sectorForSublocality(null, sectors)).toBeNull()
  })
})

describe('planRefile', () => {
  test('moves a place whose sublocality names another sector; leaves the rest', () => {
    const { moves, unmatched } = planRefile(
      [
        row('a', 'piantini', 'Ensanche Paraíso'), // moves
        row('b', 'naco', 'Ensanche Naco'), // already right
        row('c', 'piantini', null), // no sublocality: stays
        row('d', 'piantini', 'Villa Duarte'), // no sector: stays, and is reported
        row('e', 'piantini', 'Villa Duarte'),
      ],
      sectors,
    )
    expect(moves.map((m) => [m.row.id, m.to.id])).toEqual([['a', 'paraiso']])
    expect(unmatched.get('Villa Duarte')).toBe(2)
  })
})
