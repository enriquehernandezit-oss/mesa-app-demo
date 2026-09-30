import { describe, expect, test } from 'bun:test'

import { isPlaceholderPhone, isPlaceholderWebsite, isSocialSite, seedSite } from './placeContacts'

// These decide what places:enrich overwrites and catalog:clean deletes, so a false positive
// destroys a REAL phone or homepage. The boundaries are worth pinning directly.

describe('isPlaceholderPhone', () => {
  test("the seed's +1809555XXXX shape is a placeholder", () => {
    expect(isPlaceholderPhone('+18095551004')).toBe(true)
    expect(isPlaceholderPhone('+18095550000')).toBe(true)
  })

  test("Google's formatted numbers are real, however they are written", () => {
    expect(isPlaceholderPhone('+1 809-363-4444')).toBe(false)
    expect(isPlaceholderPhone('(809) 363-4444')).toBe(false)
    expect(isPlaceholderPhone('+1 829-555-1004')).toBe(false)
  })

  test('only the exact shape counts: four digits after the prefix, nothing more or less', () => {
    expect(isPlaceholderPhone('+1809555100')).toBe(false)
    expect(isPlaceholderPhone('+180955510045')).toBe(false)
  })

  test('no phone is not a placeholder', () => {
    expect(isPlaceholderPhone(null)).toBe(false)
    expect(isPlaceholderPhone(undefined)).toBe(false)
  })
})

describe('seedSite', () => {
  test('rebuilds the URL the seed wrote: lowercase, no accents, no spaces or punctuation', () => {
    expect(seedSite('Segundo Muelle')).toBe('https://segundomuelle.do')
    expect(seedSite('Lulú Tasting Bar')).toBe('https://lulutastingbar.do')
    expect(seedSite("Buche' Perico")).toBe('https://bucheperico.do')
  })
})

describe('isPlaceholderWebsite', () => {
  test("a website is a placeholder only when it is exactly the seed's guess for THAT name", () => {
    expect(isPlaceholderWebsite('Casa Luca', 'https://casaluca.do')).toBe(true)
    expect(isPlaceholderWebsite('Casa Luca', 'https://otherplace.do')).toBe(false)
  })

  test('a real homepage that happens to look similar survives', () => {
    // Google's own value for Jalao differs from the seed's guess by scheme and a slash.
    expect(isPlaceholderWebsite('Jalao', 'https://jalao.do')).toBe(true)
    expect(isPlaceholderWebsite('Jalao', 'http://jalao.do/')).toBe(false)
    expect(isPlaceholderWebsite('Adrian Tropical', 'https://www.adriantropical.com/')).toBe(false)
  })

  test('no website is not a placeholder', () => {
    expect(isPlaceholderWebsite('Jalao', null)).toBe(false)
  })
})

describe('isSocialSite', () => {
  test('Instagram and Facebook profiles, any subdomain', () => {
    expect(isSocialSite('https://www.instagram.com/cafesbg')).toBe(true)
    expect(isSocialSite('https://m.facebook.com/LaCassinaSantoDomingo/')).toBe(true)
    expect(isSocialSite('http://instagram.com')).toBe(true)
    expect(isSocialSite('https://fb.me/x')).toBe(true)
  })

  test('a real site, or a look-alike domain, is not', () => {
    expect(isSocialSite('https://www.maracamenu.com/')).toBe(false)
    expect(isSocialSite('https://notinstagram.com/x')).toBe(false)
    expect(isSocialSite('https://instagram.com.evil.com/x')).toBe(false)
  })

  test('no website is not a social site', () => {
    expect(isSocialSite(null)).toBe(false)
  })
})
