import { describe, expect, test } from 'bun:test'

import { SD_BOUNDS } from './geo'
import type { Prediction } from './googlePlaces'
import { autocompleteBody, mergeTiers, parseWhere, tiersFor } from './placeSearch'

// The three searches, as Google actually answered the query "sbg" on 2026-10-01 (names, addresses
// and distances from Santo Domingo's centre, in metres). Each search returns at most five places,
// and the Dominican one was crowded out of Punta Cana by four Santo Domingo branches — which is the
// whole reason the worldwide search is merged in.
const p = (
  id: string,
  name: string,
  secondaryText: string | null,
  distanceM: number | null,
): Prediction => ({ provider: 'google', providerPlaceId: id, name, secondaryText, distanceM })

const sophias = p(
  'sophias',
  "SBG Sophia's Bar & Grill",
  'Calle Paseo de los Locutores, Santo Domingo',
  509,
)
const kitchen = p(
  'kitchen',
  'SBG KITCHEN',
  'Downtown Center, Avenida José Núñez de Cáceres, Santo Domingo',
  2424,
)
const atrium = p('atrium', 'Atrium by SBG', 'Avenida José Núñez de Cáceres, Santo Domingo', 2420)
const cafe = p('cafe', 'Café SBG BlueMall', 'Avenida Winston Churchill, Santo Domingo', 547)
const casaDeCampo = p('casa', 'SBG Casa de Campo', 'La Romana', 109579)
const puntaCana = p(
  'pc',
  'SBG Punta Cana',
  'BlueMall, Boulevard Turístico del Este, Punta Cana',
  164378,
)
const curacao = p(
  'cw',
  'SBG Nightclub',
  'Elias R. A. Moreno Boulevard, Willemstad, Curazao',
  715766,
)
const london = p('ldn', 'SBGRILLZ', 'High Road Leyton, Londres, Reino Unido', 7030410)

const names = (list: { name: string }[]) => list.map((s) => s.name)

describe('mergeTiers', () => {
  test('Santo Domingo first, then the rest of the Dominican Republic, then the world', () => {
    const merged = mergeTiers({
      sd: [sophias, kitchen, atrium, cafe],
      dr: [sophias, casaDeCampo, kitchen, atrium, cafe],
      world: [casaDeCampo, sophias, curacao, puntaCana, london],
    })
    expect(names(merged)).toEqual([
      "SBG Sophia's Bar & Grill",
      'SBG KITCHEN',
      'Atrium by SBG',
      'Café SBG BlueMall',
      'SBG Casa de Campo',
      // only the worldwide search found Punta Cana, but it is Dominican, so it beats Curaçao
      'SBG Punta Cana',
      'SBG Nightclub',
      'SBGRILLZ',
    ])
  })

  test('a place appears once, in the first tier that has it', () => {
    const merged = mergeTiers({
      sd: [kitchen],
      dr: [casaDeCampo, kitchen],
      world: [kitchen, london],
    })
    expect(names(merged)).toEqual(['SBG KITCHEN', 'SBG Casa de Campo', 'SBGRILLZ'])
  })

  test("within the first two tiers Google's own order stands — it is relevance to what was typed", () => {
    const merged = mergeTiers({ sd: [cafe, sophias], dr: [puntaCana, casaDeCampo], world: [] })
    expect(names(merged)).toEqual([
      'Café SBG BlueMall',
      "SBG Sophia's Bar & Grill",
      'SBG Punta Cana',
      'SBG Casa de Campo',
    ])
  })

  test('a world-only place with no known distance goes last', () => {
    const unknown = p('x', 'Somewhere', null, null)
    const merged = mergeTiers({ sd: [], dr: [], world: [unknown, london, curacao] })
    expect(names(merged)).toEqual(['SBG Nightclub', 'SBGRILLZ', 'Somewhere'])
  })

  test('is capped at eight, keeping the highest-priority ones', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      p(`w${i}`, `World ${i}`, 'Somewhere', 1_000_000 + i),
    )
    const merged = mergeTiers({
      sd: [sophias, kitchen, atrium, cafe, p('sd5', 'SD five', 'Santo Domingo', 1)],
      dr: [casaDeCampo],
      world: many,
    })
    expect(names(merged)).toEqual([
      "SBG Sophia's Bar & Grill",
      'SBG KITCHEN',
      'Atrium by SBG',
      'Café SBG BlueMall',
      'SD five',
      'SBG Casa de Campo',
      'World 0',
      'World 1',
    ])
  })

  test('hands the app only what it knows: no distance', () => {
    const [first] = mergeTiers({ sd: [sophias], dr: [], world: [] })
    expect(first).toEqual({
      provider: 'google',
      providerPlaceId: 'sophias',
      name: "SBG Sophia's Bar & Grill",
      secondaryText: 'Calle Paseo de los Locutores, Santo Domingo',
    })
    expect(first).not.toHaveProperty('distanceM')
  })

  test('nothing found anywhere is an empty list', () => {
    expect(mergeTiers({ sd: [], dr: [], world: [] })).toEqual([])
  })
})

describe('autocompleteBody — the contract with Google', () => {
  test('Santo Domingo is a hard restriction to the importer’s box, and not a region filter', () => {
    const body = autocompleteBody('sbg', 'sd')
    expect(body.locationRestriction).toEqual({
      rectangle: {
        low: { latitude: SD_BOUNDS.minLat, longitude: SD_BOUNDS.minLng },
        high: { latitude: SD_BOUNDS.maxLat, longitude: SD_BOUNDS.maxLng },
      },
    })
    expect(body).not.toHaveProperty('includedRegionCodes')
  })

  test('the Dominican Republic is a region filter, with no area restriction', () => {
    const body = autocompleteBody('sbg', 'do')
    expect(body.includedRegionCodes).toEqual(['do'])
    expect(body).not.toHaveProperty('locationRestriction')
  })

  test('the world has neither', () => {
    const body = autocompleteBody('sbg', 'world')
    expect(body).not.toHaveProperty('includedRegionCodes')
    expect(body).not.toHaveProperty('locationRestriction')
  })

  test('every search carries the query, the place types, Spanish and a distance origin', () => {
    for (const tier of ['sd', 'do', 'world'] as const) {
      const body = autocompleteBody('sophias', tier)
      expect(body.input).toBe('sophias')
      expect(body.includedPrimaryTypes).toEqual(['restaurant', 'bar', 'night_club', 'cafe'])
      expect(body.languageCode).toBe('es')
      expect(body.origin).toEqual({ latitude: 18.4682, longitude: -69.9388 })
    }
  })

  test('the Dominican region hint is on the first two searches only — on the third it fills the list with Dominican places', () => {
    expect(autocompleteBody('sbg', 'sd').regionCode).toBe('do')
    expect(autocompleteBody('sbg', 'do').regionCode).toBe('do')
    expect(autocompleteBody('sbg', 'world')).not.toHaveProperty('regionCode')
  })

  test('the session token goes in only when there is one — it is what makes the searches free once a place is added', () => {
    expect(autocompleteBody('sbg', 'do', 'tok-1').sessionToken).toBe('tok-1')
    expect(autocompleteBody('sbg', 'do')).not.toHaveProperty('sessionToken')
  })
})

describe('scope', () => {
  test('the narrower the scope, the fewer searches (and the less Google bills)', () => {
    expect(tiersFor('sd')).toEqual(['sd'])
    expect(tiersFor('do')).toEqual(['sd', 'do'])
    expect(tiersFor('world')).toEqual(['sd', 'do', 'world'])
  })

  test('anything but the two narrow scopes is the widest, so an older app gets the world', () => {
    expect(parseWhere('sd')).toBe('sd')
    expect(parseWhere('do')).toBe('do')
    expect(parseWhere('world')).toBe('world')
    expect(parseWhere(undefined)).toBe('world')
    expect(parseWhere('moon')).toBe('world')
  })
})
