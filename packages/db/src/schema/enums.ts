import { pgEnum } from 'drizzle-orm/pg-core'

// What a report can point at. Vibe notes and dish posts are the UGC; users can
// also be reported directly (App Store 1.2).
export const reportTargetType = pgEnum('report_target_type', ['vibe_note', 'user', 'dish'])

// Moderation lifecycle for a report.
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'actioned', 'dismissed'])

// Where a restaurant row came from. 'seed' = demo data, 'foursquare' = the OS
// Places bulk import, 'member' = added through the app (either by hand or via
// the Google Places typeahead gap-filler).
export const restaurantSource = pgEnum('restaurant_source', ['seed', 'foursquare', 'member'])

// How trustworthy a restaurant's lat/lng actually is. 'exact' = a real geocode
// (seeded, or Foursquare-sourced). 'sector' = no geocode exists yet, so it sits
// on its neighborhood's centroid (jittered — see MapScreen's project()) rather
// than a fabricated street address.
export const geoPrecision = pgEnum('geo_precision', ['exact', 'sector'])
