// The location filter, as the app sends it with a search: `where` — a preset ('sd' Santo Domingo,
// 'do' the Dominican Republic, 'world', or 'none' for "only the cities I picked") — and `cities`,
// Google place ids resolved to boxes by lib/cities.ts. It scopes BOTH halves of a search: Mesa's own
// places (here) and Google's (lib/placeSearch.ts).

import { schema } from '@mesa/db'
import { type SQL, and, eq, gte, lte, or } from 'drizzle-orm'

import type { Rect } from './cities'

export type Scope = 'sd' | 'do' | 'world' | 'none'

// Null when the value is absent or not one of ours: an older app sends no filter at all, and keeps
// the behavior it had.
export function parseScope(raw: string | undefined): Scope | null {
  return raw === 'sd' || raw === 'do' || raw === 'world' || raw === 'none' ? raw : null
}

export interface Location {
  scope: Scope
  rects: Rect[]
}

// "Only the cities I picked" with no city Google could place is nowhere; fall back to the default,
// Santo Domingo, rather than an empty search.
export function normalizeLocation(scope: Scope, rects: Rect[]): Location {
  return scope === 'none' && rects.length === 0 ? { scope: 'sd', rects } : { scope, rects }
}

// Which Mesa places a location includes, over the `restaurants` and joined `neighborhoods` columns:
// the preset (Santo Domingo's own sectors; any place filed in the Dominican Republic; everywhere)
// plus every picked city's box, by the place's pin. Undefined means no restriction.
export function locationCondition(loc: Location): SQL | undefined {
  if (loc.scope === 'world') return undefined
  const { restaurants, neighborhoods } = schema
  const parts: (SQL | undefined)[] = []
  if (loc.scope === 'sd') parts.push(eq(neighborhoods.listed, true))
  if (loc.scope === 'do') parts.push(eq(neighborhoods.countryCode, 'do'))
  for (const r of loc.rects) {
    parts.push(
      and(
        gte(restaurants.lat, r.minLat),
        lte(restaurants.lat, r.maxLat),
        gte(restaurants.lng, r.minLng),
        lte(restaurants.lng, r.maxLng),
      ),
    )
  }
  return or(...parts)
}
