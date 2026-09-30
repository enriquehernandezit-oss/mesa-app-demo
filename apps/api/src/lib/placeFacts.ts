// The rules for filling a restaurant row's facts from a trusted source — Google Places via
// places:enrich, or a duplicate row being merged away via places:merge. Pure, so the rules are
// testable and the two scripts cannot drift.
//
//   • Empty fields are filled; a field that already has a value is never overwritten.
//   • An INVENTED contact (the seed's placeholder phone or guessed homepage —
//     lib/placeContacts.ts) is replaced by the source's real value, or cleared when the source has
//     none. A fake is worse than nothing.
//   • The MAP PIN follows the source (and the neighborhood with it), because the seed's
//     hand-placed pins were up to 5 km off.

import { haversineM } from '@mesa/db'

import type { MesaFieldsFromGoogle } from './googlePlaces'
import { isPlaceholderPhone, isPlaceholderWebsite } from './placeContacts'

// A pin closer than this to Google's is left where it is: it is the same spot, and moving it
// would only churn coordinates.
export const PIN_MOVE_MIN_M = 50

export interface EnrichRow {
  id: string
  name: string
  lat: number
  lng: number
  neighborhoodId: string
  googlePlaceId: string | null
  phone: string | null
  website: string | null
  address: string | null
  locality: string | null
  priceTier: number | null
  closesAt: string | null
  cuisine: string | null
}

// Only the columns that change. phone/website can become null (a fake cleared); the rest only
// ever fill, except the pin (lat/lng + its neighborhood) and closedAt, which follow Google.
export interface EnrichPatch {
  phone?: string | null
  website?: string | null
  address?: string
  locality?: string
  priceTier?: number
  closesAt?: string
  cuisine?: string
  googlePlaceId?: string
  lat?: number
  lng?: number
  neighborhoodId?: string
}

// The fill rule above, pure. `hoodId` is the neighborhood Google's location resolves to; it is
// only adopted when the pin itself moves.
export function enrichPatch(
  row: EnrichRow,
  fields: MesaFieldsFromGoogle,
  googlePlaceId: string,
  hoodId: string,
): EnrichPatch {
  const patch: EnrichPatch = {}
  if (isPlaceholderPhone(row.phone)) patch.phone = fields.phone
  else if (row.phone == null && fields.phone) patch.phone = fields.phone
  if (isPlaceholderWebsite(row.name, row.website)) patch.website = fields.website
  else if (row.website == null && fields.website) patch.website = fields.website
  if (row.address == null && fields.address) patch.address = fields.address
  if (row.locality == null && fields.locality) patch.locality = fields.locality
  if (row.priceTier == null && fields.priceTier != null) patch.priceTier = fields.priceTier
  if (row.closesAt == null && fields.closesAt) patch.closesAt = fields.closesAt
  if (row.cuisine == null && fields.cuisine) patch.cuisine = fields.cuisine
  if (row.googlePlaceId == null) patch.googlePlaceId = googlePlaceId

  const hasLocation = fields.lat !== 0 || fields.lng !== 0
  if (hasLocation && pinDistanceM(row, fields) > PIN_MOVE_MIN_M) {
    patch.lat = fields.lat
    patch.lng = fields.lng
    if (hoodId !== row.neighborhoodId) patch.neighborhoodId = hoodId
  }
  return patch
}

export function pinDistanceM(
  row: Pick<EnrichRow, 'lat' | 'lng'>,
  fields: Pick<MesaFieldsFromGoogle, 'lat' | 'lng'>,
): number {
  return haversineM(row.lat, row.lng, fields.lat, fields.lng)
}
