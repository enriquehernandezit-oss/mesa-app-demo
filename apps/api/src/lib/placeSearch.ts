// The search bar's "En Google" list: Google Places Autocomplete, ordered the way Mesa means it —
// Santo Domingo first, the rest of the Dominican Republic second, the world third.
//
// One Autocomplete request returns at most FIVE places, and Google ranks them by its own idea of
// relevance, so a single request cannot be told "these first". Mesa asks up to three, at once, each
// scoped to one tier, and merges them in tier order:
//
//   sd     Santo Domingo only — a hard `locationRestriction` over the same box the importer and the
//          filing use (lib/geo.ts), so "in Santo Domingo" means one thing everywhere.
//   do     the Dominican Republic — `includedRegionCodes`. Santo Domingo's own matches can fill its
//          five slots, so on its own it misses places elsewhere in the country.
//   world  anywhere, no restriction. This is what finds a Dominican place the `do` search crowded out
//          (a brand with four Santo Domingo branches hides its Punta Cana one) and every foreign one.
//
// `where` narrows how many are asked: 'sd' asks only the first, 'do' the first two, 'world' all three.
//
// Billing: each is an "Autocomplete Request"; a session that ends in Place Details (POST
// /from-google, with the same sessionToken) bills them at zero. Three per search in 'world' is the
// price of the ordering — see docs/PLACES.md, "Cost".

import { db, schema } from '@mesa/db'
import { and, inArray, isNull } from 'drizzle-orm'

import { SD_BOUNDS } from './geo'
import { type ExternalSuggestion, type Prediction, autocompleteRequest } from './googlePlaces'

export type SearchWhere = 'sd' | 'do' | 'world'

// Anything but the two narrower scopes is the widest, so an older app that sends nothing gets it.
export function parseWhere(v: string | undefined): SearchWhere {
  return v === 'sd' || v === 'do' ? v : 'world'
}

// Where distances are measured from: Santo Domingo's centre (Piantini).
const SD_ORIGIN = { latitude: 18.4682, longitude: -69.9388 }

// Restaurants, bars, clubs and cafés — nothing else is worth adding to Mesa.
const PRIMARY_TYPES = ['restaurant', 'bar', 'night_club', 'cafe']

// The body of one Autocomplete request, pure so the contract with Google is pinned by a test
// rather than by a live call. `regionCode: 'do'` formats Dominican results without their country
// ("Punta Cana", not "Punta Cana, República Dominicana") — but it ALSO ranks, so Google fills its
// five slots with Dominican places. That suits the first two searches and ruins the third: asked
// for "sbg" with the hint, the worldwide search returned the same five Dominican places and never
// reached Curaçao or London. So the worldwide search goes without it, and shows every country.
export function autocompleteBody(q: string, tier: SearchWhere, sessionToken?: string) {
  return {
    input: q,
    includedPrimaryTypes: PRIMARY_TYPES,
    languageCode: 'es',
    ...(tier === 'world' ? {} : { regionCode: 'do' }),
    origin: SD_ORIGIN,
    ...(tier === 'sd'
      ? {
          locationRestriction: {
            rectangle: {
              low: { latitude: SD_BOUNDS.minLat, longitude: SD_BOUNDS.minLng },
              high: { latitude: SD_BOUNDS.maxLat, longitude: SD_BOUNDS.maxLng },
            },
          },
        }
      : {}),
    ...(tier === 'do' ? { includedRegionCodes: ['do'] } : {}),
    ...(sessionToken ? { sessionToken } : {}),
  }
}

// More than this is a longer list than a search bar wants, and the tail is the least relevant: for a
// generic word ("pizza") Santo Domingo alone fills most of it, and the rest is the world's noise.
const MAX_RESULTS = 8

// The three searches' results as one list: each tier in turn, a place only once (the first tier
// that has it wins), and what only the worldwide search found ordered nearest to Santo Domingo —
// so a Dominican place the `do` search missed still comes before Curaçao and London. Within the
// first two tiers Google's own order stands: that is relevance to what was typed.
export function mergeTiers(tiers: {
  sd: Prediction[]
  dr: Prediction[]
  world: Prediction[]
}): ExternalSuggestion[] {
  const seen = new Set<string>()
  const out: Prediction[] = []
  const take = (list: Prediction[]) => {
    for (const p of list) {
      if (seen.has(p.providerPlaceId)) continue
      seen.add(p.providerPlaceId)
      out.push(p)
    }
  }
  const far = Number.MAX_SAFE_INTEGER
  take(tiers.sd)
  take(tiers.dr)
  take([...tiers.world].sort((a, b) => (a.distanceM ?? far) - (b.distanceM ?? far)))
  // Drop the distance: it is the API's, not the app's.
  return out.slice(0, MAX_RESULTS).map(({ distanceM: _distance, ...suggestion }) => suggestion)
}

// Which of the three searches a scope asks: the narrower the scope, the fewer requests.
export function tiersFor(where: SearchWhere): SearchWhere[] {
  return where === 'sd' ? ['sd'] : where === 'do' ? ['sd', 'do'] : ['sd', 'do', 'world']
}

export async function searchPlaces(
  q: string,
  where: SearchWhere,
  sessionToken?: string,
): Promise<ExternalSuggestion[]> {
  const asked = tiersFor(where)
  const ask = (tier: SearchWhere) =>
    asked.includes(tier)
      ? autocompleteRequest(autocompleteBody(q, tier, sessionToken))
      : Promise.resolve<Prediction[]>([])
  const [sd, dr, world] = await Promise.all([ask('sd'), ask('do'), ask('world')])
  return mergeTiers({ sd, dr, world })
}

// A place Mesa already has, found by Google's own id.
export type MesaPlace = { id: string; closed: boolean }

// Which of these Google ids Mesa already has — one query. A removed row is not a place Mesa has;
// a permanently closed one is, but is never offered (see partitionByMesa).
export async function ownedByGoogleId(googleIds: string[]): Promise<Map<string, MesaPlace>> {
  const owned = new Map<string, MesaPlace>()
  if (googleIds.length === 0) return owned
  const { restaurants } = schema
  const rows = await db
    .select({ id: restaurants.id, gid: restaurants.googlePlaceId, closedAt: restaurants.closedAt })
    .from(restaurants)
    .where(and(inArray(restaurants.googlePlaceId, googleIds), isNull(restaurants.removedAt)))
  for (const r of rows) if (r.gid) owned.set(r.gid, { id: r.id, closed: r.closedAt != null })
  return owned
}

// The search's results split by whether Mesa already has the place — matched on GOOGLE'S ID, never on
// a name: "SBG Sophia's Bar & Grill" and "Sophia's Bar & Grill" are one place, and offering it under
// "En Google" as if it were new was a bug. The ones Mesa has leave that list and come back as Mesa
// ids, in the search's own order (Santo Domingo first…), for the app to show among Mesa's results.
// A closed place is dropped from both: Explore hides closed places, and nobody should add one.
export function partitionByMesa(
  found: ExternalSuggestion[],
  owned: Map<string, MesaPlace>,
): { fresh: ExternalSuggestion[]; mesaIds: string[] } {
  const fresh: ExternalSuggestion[] = []
  const mesaIds: string[] = []
  for (const s of found) {
    const mine = owned.get(s.providerPlaceId)
    if (!mine) fresh.push(s)
    else if (!mine.closed) mesaIds.push(mine.id)
  }
  return { fresh, mesaIds }
}
