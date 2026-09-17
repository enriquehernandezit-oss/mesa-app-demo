import { pgEnum } from 'drizzle-orm/pg-core'

// What a report can point at. Vibe notes and dish posts are the UGC; users can
// also be reported directly (App Store 1.2).
export const reportTargetType = pgEnum('report_target_type', ['vibe_note', 'user', 'dish'])

// Moderation lifecycle for a report.
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'actioned', 'dismissed'])

// Where a restaurant row came from. 'seed' = demo data, 'foursquare' = the OS
// Places bulk import, 'member' = added through the app (either by hand or via
// the Google Places typeahead gap-filler), 'catalog' = a curated real-world
// import (M5's Top 100 + menus) — real, non-demo data, but distinct from
// 'foursquare' since it isn't a bulk geo extract and carries its own
// menu_items rows the seed guard must also protect.
export const restaurantSource = pgEnum('restaurant_source', [
  'seed',
  'foursquare',
  'member',
  'catalog',
])

// How trustworthy a restaurant's lat/lng actually is. 'exact' = a real geocode
// (seeded, or Foursquare-sourced). 'sector' = no geocode exists yet, so it sits
// on its neighborhood's centroid rather than a fabricated street address; the
// map handler (GET /restaurants/map) fans these out with a deterministic
// per-id jitter so they don't stack on one pixel.
export const geoPrecision = pgEnum('geo_precision', ['exact', 'sector'])

// A group dinner's lifecycle. 'open' = still voting (2–3 candidate spots) or
// just awaiting its date; 'confirmed' = the host picked a spot, whether that
// took a vote or the plan only ever had one spot to begin with; 'cancelled' =
// the host called it off. Terminal states don't revert to 'open'.
export const planStatus = pgEnum('plan_status', ['open', 'confirmed', 'cancelled'])

// A guest's RSVP on a plan. 'pending' is the default until they answer; the
// other three are their actual reply. There is no 'maybe I'll vote later' —
// voting for a spot (see plans.ts) is independent of this.
export const planReply = pgEnum('plan_reply', ['pending', 'going', 'maybe', 'declined'])

// Who's credited for a curated list (M15). 'mesa' (the default) is the
// editorial team itself — every list before this milestone, and most after
// it. 'creator'/'venue' are for a byline that isn't Mesa's own; the four
// seeded lists' mock creators are fictional (never a real influencer's name)
// per the founder's own instruction.
export const listAuthorKind = pgEnum('list_author_kind', ['mesa', 'creator', 'venue'])
