// Google Places API (New) — server-only. GOOGLE_PLACES_API_KEY must never be
// VITE_-prefixed (Vite inlines every VITE_* into the public client bundle).
// Unset → both calls below degrade to "nothing found", never throw into the
// request path — same posture as R2/MapBox/Resend.
//
// Two calls live here because both need the key + the same error handling,
// and toMesaFields is the one place Google's vocabulary gets translated into
// Mesa's — keeping that translation in one file, not scattered across route
// handlers, is the whole reason this isn't just inlined into restaurants.ts.
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY

// For a caller that needs to tell "the key is unset" apart from "Google
// looked and found nothing" — the live app never needs this (both calls
// below already degrade to an empty result either way), but import-top100.ts
// does: without a key, "not found" isn't a real answer worth caching.
export function hasGooglePlacesKey(): boolean {
  return Boolean(GOOGLE_PLACES_KEY)
}

export interface ExternalSuggestion {
  provider: 'google'
  providerPlaceId: string
  name: string
  secondaryText: string | null
}

// Places Autocomplete — field-masked to placeId + display text only, which
// keeps it on the cheapest SKU and means no coordinates are ever returned.
// sessionToken (when passed by both this and placeDetails) bills the
// autocomplete requests in that session at zero once a Details call in the
// same session lands (M9) — optional, harmless to omit.
export async function autocomplete(
  q: string,
  sessionToken?: string,
): Promise<ExternalSuggestion[]> {
  if (!GOOGLE_PLACES_KEY) return []
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ['do'],
        includedPrimaryTypes: ['restaurant', 'bar', 'night_club', 'cafe'],
        languageCode: 'es',
        regionCode: 'do',
        ...(sessionToken ? { sessionToken } : {}),
      }),
      // Google is on the user's critical path here; don't let a stall hang
      // the rank/explore flow. Degrades to "no external results" below.
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[places] autocomplete failed (${res.status}): ${detail.slice(0, 300)}`)
      return []
    }
    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
        }
      }[]
    }
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> =>
        Boolean(p?.placeId && p.structuredFormat?.mainText?.text),
      )
      .map((p) => ({
        provider: 'google' as const,
        providerPlaceId: p.placeId as string,
        name: p.structuredFormat?.mainText?.text as string,
        secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
      }))
  } catch (err) {
    console.error('[places] autocomplete threw:', err)
    return []
  }
}

interface GoogleAddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}
interface GooglePeriod {
  open?: { day?: number; hour?: number; minute?: number }
  close?: { day?: number; hour?: number; minute?: number }
}
export interface GooglePlaceDetails {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  shortFormattedAddress?: string
  addressComponents?: GoogleAddressComponent[]
  location?: { latitude?: number; longitude?: number }
  primaryType?: string
  types?: string[]
  priceLevel?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  regularOpeningHours?: { periods?: GooglePeriod[] }
  businessStatus?: string
}

// Shared by placeDetails and searchText below — same object shape either
// call returns, so the same field list applies to both. Deliberately broad
// (this is the Enterprise SKU regardless, since hours/phone/website push it
// there) but still excludes photos, reviews, and anything else with no
// caching story.
const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'addressComponents',
  'location',
  'primaryType',
  'types',
  'priceLevel',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'businessStatus',
]

// Place Details — called ONLY when a member taps a suggestion (M9), never for
// the typeahead itself.
export async function placeDetails(
  placeId: string,
  sessionToken?: string,
): Promise<GooglePlaceDetails | null> {
  if (!GOOGLE_PLACES_KEY) return null
  try {
    const params = new URLSearchParams({ languageCode: 'es', regionCode: 'do' })
    if (sessionToken) params.set('sessionToken', sessionToken)
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`,
      {
        headers: {
          'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
          'X-Goog-FieldMask': PLACE_FIELDS.join(','),
        },
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[places] details failed (${res.status}): ${detail.slice(0, 300)}`)
      return null
    }
    return (await res.json()) as GooglePlaceDetails
  } catch (err) {
    console.error('[places] details threw:', err)
    return null
  }
}

// A center + radius over Santo Domingo's metro area — biases (never
// restricts) Text Search results toward the city Mesa actually covers, per
// Google's own recommendation for a single-city catalog. Center is roughly
// Piantini; the 25km radius covers the whole metro (Zona Colonial to
// Santo Domingo Este/Oeste) with room to spare.
const SD_LOCATION_BIAS = {
  circle: { center: { latitude: 18.4682, longitude: -69.9388 }, radius: 25000 },
}

// Text Search — the M5 Top 100 catalog importer's one geocoding call per
// restaurant name (never called from the live app; that's autocomplete +
// placeDetails above). pageSize: 1 keeps this to the cheapest useful shape:
// the importer only ever wants the single best guess, which it then verifies
// itself (bounding box + name agreement) before trusting.
export async function searchText(query: string): Promise<GooglePlaceDetails | null> {
  if (!GOOGLE_PLACES_KEY) return null
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': PLACE_FIELDS.map((f) => `places.${f}`).join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'es',
        regionCode: 'do',
        locationBias: SD_LOCATION_BIAS,
        pageSize: 1,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[places] searchText failed (${res.status}): ${detail.slice(0, 300)}`)
      return null
    }
    const data = (await res.json()) as { places?: GooglePlaceDetails[] }
    return data.places?.[0] ?? null
  } catch (err) {
    console.error('[places] searchText threw:', err)
    return null
  }
}

// Text Search, multi-result variant — for a one-off discovery script that
// wants "every place matching this query" rather than import-top100.ts's one
// best guess for a known name. pageSize maxes at 20 (Google's own cap for
// Text Search New); callers wanting broader coverage than one query's 20
// results issue several differently-worded queries instead of paginating —
// simpler, and each query is independently useful for logging/debugging.
export async function searchTextMany(
  query: string,
  opts: { pageSize?: number; includedType?: string } = {},
): Promise<GooglePlaceDetails[]> {
  if (!GOOGLE_PLACES_KEY) return []
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': PLACE_FIELDS.map((f) => `places.${f}`).join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'es',
        regionCode: 'do',
        locationBias: SD_LOCATION_BIAS,
        pageSize: Math.min(opts.pageSize ?? 20, 20),
        ...(opts.includedType ? { includedType: opts.includedType } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[places] searchTextMany failed (${res.status}): ${detail.slice(0, 300)}`)
      return []
    }
    const data = (await res.json()) as { places?: GooglePlaceDetails[] }
    return data.places ?? []
  } catch (err) {
    console.error('[places] searchTextMany threw:', err)
    return []
  }
}

// Google primaryType/types → Mesa's English cuisine vocabulary
// (apps/mobile/src/lib/display.ts's CUISINE_ES keys — the same target
// packages/db/src/import-foursquare.ts's FSQ_TO_MESA_CUISINE maps into).
// Unmapped → null, never the raw type string — cuisineLabel() passes unknowns
// through verbatim, which would leak English Google type slugs into the
// Spanish UI. Curated from Google's published Table A restaurant/food types;
// extend alongside CUISINE_ES as real searches turn up more.
const GOOGLE_TYPE_TO_MESA_CUISINE: Record<string, string> = {
  italian_restaurant: 'Italian',
  pizza_restaurant: 'Pizza',
  spanish_restaurant: 'Spanish',
  peruvian_restaurant: 'Peruvian',
  wine_bar: 'Wine Bar',
  dominican_restaurant: 'Dominican',
  caribbean_restaurant: 'Dominican',
  steak_house: 'Steakhouse',
  mediterranean_restaurant: 'Mediterranean',
  mexican_restaurant: 'Mexican',
  japanese_restaurant: 'Japanese',
  sushi_restaurant: 'Japanese',
  sandwich_shop: 'Sandwiches',
  chinese_restaurant: 'Chinese',
  thai_restaurant: 'Thai',
  seafood_restaurant: 'Seafood',
  cafe: 'Café',
  coffee_shop: 'Café',
}
function mapCuisine(primaryType: string | undefined, types: string[] | undefined): string | null {
  if (primaryType && GOOGLE_TYPE_TO_MESA_CUISINE[primaryType]) {
    return GOOGLE_TYPE_TO_MESA_CUISINE[primaryType]
  }
  for (const t of types ?? []) {
    if (GOOGLE_TYPE_TO_MESA_CUISINE[t]) return GOOGLE_TYPE_TO_MESA_CUISINE[t]
  }
  return null
}

// PRICE_LEVEL_* enum (Places API New) → Mesa's 1–4 $ tier. UNSPECIFIED/absent
// → null (no price pill), same as a seed row with no priceTier.
const GOOGLE_PRICE_TO_TIER: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

// A 24h {hour,minute} → Mesa's display label ("11p", "12a", "1a") — matches
// the exact format the seed data uses (packages/db/src/seed.ts's CLOSES_AT),
// hour-only, no leading zero, lowercase a/p suffix.
function formatClosesAt(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}${hour < 12 || hour === 24 ? 'a' : 'p'}`
}

// closesAt is a stable display-only label ("hasta 1a"), not a parsed
// schedule — so this takes the MODAL closing hour across the week's periods,
// not today's. A per-day value would be wrong six days out of seven and force
// a daily refresh; the "Abierto ahora" filter only ever checks `is not null`.
function modalClosesAt(periods: GooglePeriod[] | undefined): string | null {
  if (!periods?.length) return null
  const counts = new Map<number, number>()
  for (const p of periods) {
    const hour = p.close?.hour
    if (hour == null) continue
    counts.set(hour, (counts.get(hour) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let bestHour = 0
  let bestCount = -1
  for (const [hour, count] of counts) {
    if (count > bestCount) {
      bestHour = hour
      bestCount = count
    }
  }
  return formatClosesAt(bestHour)
}

function addressComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): string | null {
  return components?.find((c) => c.types?.includes(type))?.longText ?? null
}

export interface MesaFieldsFromGoogle {
  name: string
  lat: number
  lng: number
  address: string | null
  locality: string | null
  phone: string | null
  website: string | null
  priceTier: number | null
  cuisine: string | null
  closesAt: string | null
  closedAt: Date | null
}

// Pure mapping — no fetch, unit-testable against a hand-written payload.
export function toMesaFields(d: GooglePlaceDetails): MesaFieldsFromGoogle {
  return {
    name: d.displayName?.text ?? '',
    lat: d.location?.latitude ?? 0,
    lng: d.location?.longitude ?? 0,
    address: d.shortFormattedAddress ?? d.formattedAddress ?? null,
    locality: addressComponent(d.addressComponents, 'locality'),
    phone: d.internationalPhoneNumber ?? d.nationalPhoneNumber ?? null,
    // Only store an http(s) website — Google returns real URLs, but this keeps
    // a non-navigable scheme from ever landing in the column and being rendered
    // as an href downstream (the client also allow-lists, defense in depth).
    website: d.websiteUri && /^https?:\/\//i.test(d.websiteUri) ? d.websiteUri : null,
    priceTier: d.priceLevel ? (GOOGLE_PRICE_TO_TIER[d.priceLevel] ?? null) : null,
    cuisine: mapCuisine(d.primaryType, d.types),
    closesAt: modalClosesAt(d.regularOpeningHours?.periods),
    closedAt: d.businessStatus === 'CLOSED_PERMANENTLY' ? new Date() : null,
  }
}

const COMBINING_MARKS = /\p{M}/gu
function normalizeForMatch(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim()
}

// Which of Mesa's sectors a Google Details result sits in. Prefers an address
// component that already names a Mesa sector — centroid distance alone
// mislabels edge cases (Piantini/Naco share a border) — and falls back to
// nearest-centroid haversine over the 7 candidates (plain TS, never a
// per-row query) when nothing matches by name.
export function resolveNeighborhood<
  T extends { id: string; name: string; lat: number; lng: number },
>(d: GooglePlaceDetails, hoods: T[]): T {
  const named = ['sublocality_level_1', 'sublocality', 'neighborhood']
    .map((type) => addressComponent(d.addressComponents, type))
    .filter((v): v is string => v != null)
    .map(normalizeForMatch)
  for (const candidate of named) {
    const hit = hoods.find((h) => normalizeForMatch(h.name) === candidate)
    if (hit) return hit
  }

  const lat = d.location?.latitude
  const lng = d.location?.longitude
  let best = hoods[0] as T
  if (lat == null || lng == null) return best
  let bestDist = Number.POSITIVE_INFINITY
  for (const h of hoods) {
    const dLat = ((h.lat - lat) * Math.PI) / 180
    const dLng = ((h.lng - lng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) * Math.cos((h.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    if (dist < bestDist) {
      bestDist = dist
      best = h
    }
  }
  return best
}
