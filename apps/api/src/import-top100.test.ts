import { describe, expect, test } from 'bun:test'
import { inBounds, mapCuisine, namesAgree } from './import-top100'

// These three gate every write the importer makes — a silent regression here
// either drops real menu data (a false "unresolved") or geocodes a Santo
// Domingo restaurant onto the wrong city's namesake (a false "resolved"), so
// their boundaries are worth pinning directly rather than only through a
// live --dry-run.

describe('mapCuisine', () => {
  test("the sheet vocabulary passes through as Mesa's English cuisine key", () => {
    expect(mapCuisine('Mediterranean / Fine Dining')).toBe('Mediterranean')
    expect(mapCuisine('International')).toBe('International')
  })

  test('multi-word first segments with no "/" get their explicit override', () => {
    expect(mapCuisine('Contemporary Dominican')).toBe('Dominican')
    expect(mapCuisine('Asian Fusion')).toBe('Fusion')
    expect(mapCuisine('Mexican-Japanese Fusion')).toBe('Fusion')
  })

  test('placeholder labels map to null, not a fake cuisine', () => {
    expect(mapCuisine('To verify')).toBeNull()
    expect(mapCuisine('Restaurant')).toBeNull()
  })

  test('no category at all is null', () => {
    expect(mapCuisine(null)).toBeNull()
  })
})

describe('inBounds', () => {
  test('Piantini and Zona Colonial are in', () => {
    expect(inBounds(18.4688, -69.9374)).toBe(true)
    expect(inBounds(18.4739, -69.8849)).toBe(true)
  })

  test('another country\'s "Santo Domingo" homonym is out', () => {
    // Santo Domingo, Ecuador
    expect(inBounds(-0.2528, -79.1747)).toBe(false)
  })

  test('just past each edge of the box is out', () => {
    expect(inBounds(18.29, -69.9)).toBe(false)
    expect(inBounds(18.66, -69.9)).toBe(false)
    expect(inBounds(18.5, -70.11)).toBe(false)
    expect(inBounds(18.5, -69.59)).toBe(false)
  })
})

describe('namesAgree', () => {
  test('an exact (accent/case-insensitive) match agrees', () => {
    expect(namesAgree('Mesón de Bari', 'Meson De Bari')).toBe(true)
  })

  test('a real substring relation agrees, both directions', () => {
    expect(namesAgree('Laurel', 'Laurel Food & Wine')).toBe(true)
    expect(namesAgree('Laurel Food & Wine', 'Laurel')).toBe(true)
  })

  test('a short, generic substring does not agree', () => {
    // "Mila" (4 chars) shouldn't drag in an unrelated "Mila's Diner" via
    // containment alone — this only agrees because trigram similarity is
    // high for these two, not because of the length-5 containment floor.
    expect(namesAgree('Mila', 'Milagros Bar')).toBe(false)
  })

  test('two genuinely different names do not agree', () => {
    expect(namesAgree('Pizza Roma', 'Pizza Napoli')).toBe(false)
  })
})
