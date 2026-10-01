// How complete — and how honest — is the restaurant catalog? Read-only: no Google calls,
// no writes, safe against production.
//
//   DATABASE_URL="<url>" bun run places:audit
//
// Prints, per source (seed / catalog / foursquare / member), how many live places have each
// fact, then the wrong-data tells: the seed's invented phones and homepages
// (lib/placeContacts.ts), and "websites" that are really a social profile. Run it before and
// after places:enrich to see the gap close.

import { db, pool, schema } from '@mesa/db'
import { and, isNull } from 'drizzle-orm'

import { inBounds } from './import-top100'
import { databaseLabel } from './lib/databaseLabel'
import { isPlaceholderPhone, isPlaceholderWebsite, isSocialSite } from './lib/placeContacts'

const { restaurants } = schema

export interface AuditRow {
  source: string
  name: string
  googlePlaceId: string | null
  phone: string | null
  website: string | null
  address: string | null
  locality: string | null
  priceTier: number | null
  closesAt: string | null
  cuisine: string | null
  coverImageId: string | null
  sourceRefreshedAt: Date | null
  lat: number
  lng: number
}

export const FACTS = [
  'address',
  'locality',
  'phone',
  'website',
  'priceTier',
  'closesAt',
  'cuisine',
  'googlePlaceId',
  'coverImageId',
] as const
export type Fact = (typeof FACTS)[number]

export interface SourceAudit {
  source: string
  total: number
  have: Record<Fact, number>
  fakePhones: number
  fakeSites: number
  socialSites: number
  // Has a Google id but has never been refreshed from it, or not for 30 days.
  staleFromGoogle: number
  // Places whose pin is outside Santo Domingo. Mesa has seven Santo Domingo sectors and nowhere
  // else, so such a place is filed under the NEAREST sector — a Casa de Campo restaurant shows
  // as "Zona Colonial".
  outsideSantoDomingo: string[]
}

const STALE_MS = 30 * 24 * 60 * 60 * 1000

// Pure, so the counting is testable; the script below only prints it.
export function auditRows(rows: AuditRow[], now = Date.now()): SourceAudit[] {
  const bySource = new Map<string, SourceAudit>()
  for (const r of rows) {
    let a = bySource.get(r.source)
    if (!a) {
      a = {
        source: r.source,
        total: 0,
        have: Object.fromEntries(FACTS.map((f) => [f, 0])) as Record<Fact, number>,
        fakePhones: 0,
        fakeSites: 0,
        socialSites: 0,
        staleFromGoogle: 0,
        outsideSantoDomingo: [],
      }
      bySource.set(r.source, a)
    }
    a.total++
    for (const f of FACTS) if (r[f] != null) a.have[f]++
    if (isPlaceholderPhone(r.phone)) a.fakePhones++
    if (isPlaceholderWebsite(r.name, r.website)) a.fakeSites++
    if (isSocialSite(r.website)) a.socialSites++
    if (!inBounds(r.lat, r.lng)) a.outsideSantoDomingo.push(r.name)
    if (
      r.googlePlaceId &&
      (r.sourceRefreshedAt == null || now - r.sourceRefreshedAt.getTime() > STALE_MS)
    ) {
      a.staleFromGoogle++
    }
  }
  return [...bySource.values()].sort((x, y) => y.total - x.total)
}

const pct = (n: number, of: number) =>
  of === 0 ? '  —' : `${Math.round((n / of) * 100)}%`.padStart(4)

async function main() {
  console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
  const rows = await db
    .select({
      source: restaurants.source,
      name: restaurants.name,
      googlePlaceId: restaurants.googlePlaceId,
      phone: restaurants.phone,
      website: restaurants.website,
      address: restaurants.address,
      locality: restaurants.locality,
      priceTier: restaurants.priceTier,
      closesAt: restaurants.closesAt,
      cuisine: restaurants.cuisine,
      coverImageId: restaurants.coverImageId,
      sourceRefreshedAt: restaurants.sourceRefreshedAt,
      lat: restaurants.lat,
      lng: restaurants.lng,
    })
    .from(restaurants)
    .where(and(isNull(restaurants.removedAt), isNull(restaurants.closedAt)))

  console.log(`places:audit — ${rows.length} live place(s)\n`)
  for (const a of auditRows(rows)) {
    console.log(`${a.source} (${a.total})`)
    for (const f of FACTS) {
      console.log(`  ${f.padEnd(14)} ${String(a.have[f]).padStart(4)}  ${pct(a.have[f], a.total)}`)
    }
    console.log('  wrong or stale:')
    console.log(`    invented phones     ${a.fakePhones}`)
    console.log(`    invented websites   ${a.fakeSites}`)
    console.log(`    social-only sites   ${a.socialSites}  (real, kept — the app labels them)`)
    console.log(`    not refreshed 30d+  ${a.staleFromGoogle}  (have a Google id)`)
    if (a.outsideSantoDomingo.length > 0) {
      console.log(
        `    outside Santo Domingo  ${a.outsideSantoDomingo.length}: ${a.outsideSantoDomingo.join(', ')}`,
      )
    }
    console.log('')
  }
  console.log('Next: places:enrich --dry-run')
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
