import { describe, expect, test } from 'bun:test'

import { type AuditRow, type SourceAudit, auditRows } from './places-audit'

const NOW = Date.parse('2026-09-30T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  source: 'catalog',
  name: 'Casa Luca',
  googlePlaceId: 'ChIJ-x',
  phone: '+1 809-541-4101',
  website: 'https://real.example/',
  address: 'Calle Uno 5',
  locality: 'Santo Domingo',
  priceTier: 2,
  closesAt: '11p',
  cuisine: 'Italian',
  coverImageId: null,
  sourceRefreshedAt: new Date(NOW - DAY),
  lat: 18.4688,
  lng: -69.9374,
  ...over,
})

// The audit of a list that holds one source — throws rather than yielding `undefined`, which
// noUncheckedIndexedAccess would otherwise make every assertion below guard against.
const single = (rows: AuditRow[]): SourceAudit => {
  const [a, ...rest] = auditRows(rows, NOW)
  if (!a || rest.length > 0) throw new Error('expected exactly one source')
  return a
}

describe('auditRows', () => {
  test('groups by source, biggest first, and counts every fact', () => {
    const out = auditRows(
      [
        row(),
        row({ website: null, priceTier: null }),
        row({ source: 'seed', name: 'A', googlePlaceId: null }),
      ],
      NOW,
    )
    expect(out.map((a) => [a.source, a.total])).toEqual([
      ['catalog', 2],
      ['seed', 1],
    ])
    const [catalog, seed] = out
    if (!catalog || !seed) throw new Error('expected two sources')
    expect(catalog.have.website).toBe(1)
    expect(catalog.have.priceTier).toBe(1)
    expect(catalog.have.phone).toBe(2)
    expect(catalog.have.coverImageId).toBe(0)
    expect(seed.have.googlePlaceId).toBe(0)
  })

  test("counts the seed's invented phones and websites, and only those", () => {
    const a = single([
      row({ name: 'Casa Luca', phone: '+18095551036', website: 'https://casaluca.do' }),
      row({ name: 'Real Place', phone: '+1 809-541-4101', website: 'https://realplace.com/' }),
      row({ name: 'Jalao', website: 'http://jalao.do/' }),
    ])
    expect(a.fakePhones).toBe(1)
    expect(a.fakeSites).toBe(1)
  })

  test('counts social profiles that stand in for a website', () => {
    const a = single([
      row({ website: 'https://www.instagram.com/cafesbg' }),
      row({ website: 'https://m.facebook.com/x/' }),
      row({ website: 'https://real.example/' }),
    ])
    expect(a.socialSites).toBe(2)
  })

  test('a Google-backed row is stale when never refreshed or refreshed over 30 days ago', () => {
    const a = single([
      row({ sourceRefreshedAt: null }),
      row({ sourceRefreshedAt: new Date(NOW - 31 * DAY) }),
      row({ sourceRefreshedAt: new Date(NOW - 29 * DAY) }),
      row({ googlePlaceId: null, sourceRefreshedAt: null }),
    ])
    expect(a.staleFromGoogle).toBe(2)
  })

  test('lists places whose pin is outside Santo Domingo', () => {
    const a = single([
      row({ name: 'Piantini place' }),
      row({ name: 'Casa de Campo place', lat: 18.401, lng: -68.9 }),
      row({ name: 'Miami place', lat: 25.7617, lng: -80.1918 }),
    ])
    expect(a.outsideSantoDomingo).toEqual(['Casa de Campo place', 'Miami place'])
  })

  test('an empty catalog audits to nothing', () => {
    expect(auditRows([], NOW)).toEqual([])
  })
})
