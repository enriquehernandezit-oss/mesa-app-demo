// Shapes returned by the Mesa API (apps/api/src/routes/*). Kept in one place so
// screens and hooks share them. These mirror the JSON the handlers send.

export interface Neighborhood {
  slug: string
  name: string
}

export interface MeResponse {
  profile: {
    id: string
    name: string
    handle: string | null
    bio: string | null
    image: string | null
    email: string | null
    emailVerified: boolean
    neighborhood: Neighborhood | null
    createdAt?: string // ISO — "Member since {month} {year}" on the profile
    // Gates the moderation queue. Set directly in the DB; nothing in the
    // product can grant it.
    isModerator?: boolean
    // Contacts find-friends opt-in (M18) — "let your contacts find you".
    // Never the phone number or its hash, just whether one is on file.
    phoneMatchEnabled: boolean
  }
  onboardingComplete: boolean
}

// A row in the moderator queue. `target` carries the reported content itself —
// a bare id can't be judged — and is null when the row is already gone.
// 'comment' is in the union because the API has accepted and returned comment
// reports since migration 0022; this copy of the type omitted it, and the queue
// screen's action then fell through to the eject endpoint (see moderation.tsx).
export interface ModerationReport {
  id: string
  reporterId: string
  targetType: 'vibe_note' | 'user' | 'dish' | 'comment'
  targetId: string
  reason: string
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed'
  createdAt: string
  target:
    | { kind: 'vibe_note'; body: string; userId: string }
    | { kind: 'dish'; name: string; caption: string | null; imageId: string | null }
    | { kind: 'comment'; body: string; userId: string; rankingId: string }
    | { kind: 'user'; name: string; handle: string | null }
    | null
  // True when the content was already removed/banned by someone else — the row
  // stays visible so it can be dismissed, but the remove action is pointless.
  alreadyHandled: boolean
}

export interface Restaurant {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: Neighborhood | null
}

export interface SuggestedUser {
  id: string
  name: string
  handle: string | null
  image: string | null
  neighborhood?: string | null
  followerCount?: number
  rankedCount?: number // "41 ranked · Piantini" on start-with-these rows
}

// GET /social/suggestions (M18) — richer than SuggestedUser above: every row
// carries why it's suggested.
export type SuggestionReason =
  | { kind: 'mutual'; name: string; extraCount: number }
  | { kind: 'taste'; percent: number }
  | { kind: 'popular' }

export interface FriendSuggestion {
  id: string
  name: string
  handle: string | null
  image: string | null
  neighborhood: string | null
  reason: SuggestionReason
}

// A minimal person row shared by /social/contacts/match and
// /social/instagram/match's responses.
export interface ContactMatchUser {
  id: string
  name: string
  handle: string | null
  image: string | null
}

// GET /social/followers and /following — a member row in someone's graph.
export interface FollowUser {
  id: string
  name: string
  handle: string | null
  image: string | null
  neighborhood: string | null
  isFollowing: boolean
}

export interface RankedRestaurant {
  id: string
  name: string
  cuisine: string | null
  coverImageId?: string | null
  priceTier?: number | null
  closesAt?: string | null
  phone?: string | null
  lat?: number
  lng?: number
}

// The restaurant slice that comes back on someone ELSE's ranking row
// (GET /rankings/user/:userId, rankings.ts:228-238) and on a saved place
// (GET /saved, saved.ts:19-25) — both select only these 4 columns, unlike
// GET /rankings' own list, which genuinely does select the rest of
// RankedRestaurant. Kept as its own type instead of widening those two
// selects to match RankedRestaurant, or narrowing RankedRestaurant itself
// and breaking the own-list screens that read its other fields.
export interface RestaurantRef {
  id: string
  name: string
  cuisine: string | null
  priceTier?: number | null
}

// A row in a ranked list (mine or someone else's).
export interface Ranking {
  id: string
  position: number
  score: number
  // Present on GET /rankings (own list) for the "Recientes" sort; omitted on
  // another member's passport, which is why it's optional.
  createdAt?: string
  tags?: string[] | null
  favoriteDish?: string | null
  restaurant: RankedRestaurant
  neighborhood: string | null
  note: string | null
  noteId?: string | null // present on other users' lists (for reporting)
}

// A card in the Trending / For-you / Similar rails.
export interface RailSpot {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  cheerCount?: number
  friendAvg?: number
  friendCount?: number
}

export interface Dish {
  id: string
  name: string
  caption: string | null
  // Nullable as of M11 — a dish can be a photo-less "Qué pedir" pick.
  imageId: string | null
  categoryId: string
  grain: string
  createdAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
}

// The dish-detail screen (C3): a dish + its linked ranking/place.
export interface DishDetail {
  id: string
  name: string
  caption: string | null
  imageId: string | null
  categoryId: string
  grain: string
  createdAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  score: number // the poster's own score for the linked place (0–100)
  posterIsMe: boolean
  saved: boolean // SaveButton's initial state (M19)
  restaurant: {
    id: string
    name: string
    cuisine: string | null
    priceTier: number | null
    phone: string | null
    website: string | null
    closesAt: string | null
    lat: number
    lng: number
    coverImageId: string | null
  }
  neighborhood: string | null
}

// The closed dish-category taxonomy (M11) — GET /dishes/categories. Mirrors
// packages/db/src/dishCategories.ts's shape; see
// apps/mobile/src/lib/dishCategories.ts for why this app keeps its own copy
// of the (small) keyword-guess function instead of importing that package.
export interface DishGroup {
  id: string
  nameEs: string
}
export interface DishCategory {
  id: string
  group: string
  nameEs: string
  sortOrder: number
  keywords: string[]
}

// A distinct dish name already logged at a restaurant, with a count and the
// most common category among its loggers — GET /dishes/restaurant/:id/names,
// the chip source for the rank flow's "Qué pedir" step. Aggregated data only;
// deliberately carries no poster information.
export interface DishName {
  nameKey: string
  label: string
  count: number
  categoryId: string
}

// M15 — who curated a list. authorKind 'mesa' (the schema default) never
// carries a name/handle: the byline just reads "Mesa" for that case; see
// lib/display.ts's listAuthorLabel.
export interface ListAuthor {
  authorKind: 'mesa' | 'creator' | 'venue'
  authorName: string | null
  authorHandle: string | null
  authorAvatarId: string | null
}

export interface FeaturedList extends ListAuthor {
  id: string
  slug: string
  title: string
  subtitle: string | null
  coverImageId: string | null
  total: number
  mine: number
}

export interface ListDetailItem {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  priceTier: number | null
  position: number
  friendAvg: number | null
  friendCount: number
  myScore: number | null
}

export interface ListDetailResponse {
  list: ListAuthor & {
    slug: string
    title: string
    subtitle: string | null
    coverImageId: string | null
    description: string | null
    curationNote: string | null
  }
  items: ListDetailItem[]
}

export interface ExploreHit {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  priceTier: number | null
  closesAt?: string | null
  address?: string | null
  friendAvg: number | null
  friendCount: number
  mesaCount: number
  // True only for a searched hit nobody has ranked yet — the no-query browse
  // pool is restricted to ranked places, so this is always false there.
  isNew: boolean
}

// A member row in "place, dish, or member" search results.
export interface ExploreMember {
  id: string
  name: string
  handle: string | null
  image: string | null
  neighborhood: string | null
  rankedCount: number
}

export interface ExploreResponse {
  restaurants: ExploreHit[]
  members: ExploreMember[]
}

// POST /restaurants body — the client passes a neighborhood slug (it has slugs,
// not UUIDs). The restaurant returned by POST /restaurants ("Add a new restaurant").
export interface NewRestaurantInput {
  name: string
  cuisine?: string
  neighborhoodSlug: string
  priceTier?: number
}

// A Google Places autocomplete suggestion (M8) — deliberately NOT a Mesa place
// shape: no id, no coverImageId, no scores, so it can never be rendered through
// a Mesa place code path by accident. It only becomes a real restaurant when a
// member confirms it through the add-a-place form.
export interface ExternalSuggestion {
  provider: 'google'
  providerPlaceId: string
  name: string // structuredFormat.mainText
  secondaryText: string | null // structuredFormat.secondaryText (address-ish)
}
export interface NewRestaurant {
  id: string
  name: string
  cuisine: string | null
  priceTier: number | null
  coverImageId: string | null
  neighborhood: string | null
}

export interface MapSpot {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  lat: number
  lng: number
  priceTier: number | null
  friendAvg: number | null
  friendCount: number
}

export interface MeStats {
  places: number
  followers: number
  following: number
  saved: number
  streakWeeks: number
  rankInDr: number | null
  avgScore: number | null
  topCuisine: string | null
  topNeighborhood: string | null
}

export interface LeaderboardRow {
  id: string
  name: string
  handle: string | null
  image: string | null
  neighborhood: string | null
  count: number
  avgScore: number
}

export interface ActivityItem {
  type:
    | 'cheers'
    | 'follow'
    | 'saved_ranked'
    | 'friend_ranked'
    | 'plan_invite'
    | 'plan_reply'
    | 'event_going'
  at: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant?: { id: string; name: string; coverImageId: string | null } | null
  score?: number | null // friend_ranked: their score (0–100)
  yourScore?: number | null // friend_ranked: mine, for "— above your 8.8"
  followsBack?: boolean // follow rows: do I already follow them back?
  planId?: string // plan_invite / plan_reply
  startsAt?: string // plan_invite / event_going — when the thing is
  reply?: 'going' | 'maybe' // plan_reply — what the invitee answered
  eventId?: string // event_going
  eventTitle?: string // event_going
}

export interface SavedPlace {
  restaurant: RestaurantRef
  neighborhood: string | null
  savedAt: string
}

// GET /saved/dishes (M19).
export interface SavedDish {
  dish: { id: string; name: string; imageId: string | null }
  restaurant: { id: string; name: string }
  savedAt: string
}

// GET /collections — a list row, optionally carrying the calling screen's
// own item-membership check (save-to-list.tsx's ?restaurantId=/?dishId= filter);
// itemId is the collection_items row when it contains that item, else null.
export interface CollectionSummary {
  id: string
  name: string
  // Optional playlist-style bio + cover (Sept 2026). A cover is a data URL,
  // an https URL or a seed path — render through cloudinaryUrl().
  description: string | null
  coverImageId: string | null
  // When there's no cover: the photo of the most recently added item.
  previewImageId: string | null
  createdAt: string
  itemCount: number
  itemId: string | null
}

// GET /collections/:id — a list's full contents.
export interface CollectionItem {
  itemId: string
  addedAt: string
  restaurant:
    | (RestaurantRef & {
        coverImageId: string | null
        neighborhood: string | null
        // Set once I've ranked this place since adding it to the list —
        // "Ya fuiste · #N" instead of the normal saved-place row.
        myRanking: { position: number; score: number } | null
      })
    | null
  dish: { id: string; name: string; imageId: string | null; restaurantId: string | null } | null
}

export interface CollectionDetail {
  id: string
  name: string
  description: string | null
  coverImageId: string | null
  items: CollectionItem[]
}

// Repeat-dish ranking (M20). POST /dishes returns `nudge` on the exact call
// that either creates the list (3rd distinct restaurant, 'first') or adds a
// new restaurant to an already-ranked one ('insert') — see routes/dishes.ts's
// own comment for why each fires exactly once.
export interface DishNudge {
  kind: 'first' | 'insert'
  listId: string
  label: string
}

// GET /dish-lists — one row per dish the member has posted at 3+ places.
export interface DishListSummary {
  id: string
  nameKey: string
  label: string
  rankedAt: string | null
  restaurantCount: number
}

// One entry in a dish list's ranked[] or unranked[] — the same restaurant +
// dish shape either way; `dish` carries this member's own sentiment/caption
// for it (never anyone else's, since a dish list is entirely one person's).
export interface DishListEntry {
  restaurant: RestaurantRef & { coverImageId: string | null; neighborhood: string | null }
  dish: {
    id: string
    name: string
    caption: string | null
    imageId: string | null
    sentiment: 'loved' | 'fine' | 'disliked' | null
  }
}

export interface DishListDetail {
  id: string
  label: string
  nameKey: string
  rankedAt: string | null
  // Ordered, position-ascending.
  ranked: (DishListEntry & { position: number })[]
  unranked: DishListEntry[]
}

// The ranking row shape on someone ELSE's passport — narrower than Ranking
// (no createdAt, restaurant is a RestaurantRef) because rankings.ts's
// /user/:userId select genuinely sends less than the owner's own /rankings
// does. See RestaurantRef's comment for why this isn't just Ranking reused.
export interface TheirRanking {
  id: string
  position: number
  score: number
  restaurant: RestaurantRef
  neighborhood: string | null
  note: string | null
  noteId: string | null
  tags: string[] | null
  favoriteDish: string | null
}

export interface UserRankingsResponse {
  user: {
    id: string
    name: string
    handle: string | null
    image: string | null
    neighborhood: { name: string } | null
  }
  rankings: TheirRanking[]
  isFollowing: boolean
  followerCount: number
  followingCount: number
  matchPercent: number | null
  sharedCount: number
}

// GET /rankings/user/:userId/match — the pair page (M16).
export interface MatchPlace {
  restaurantId: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  mine: { position: number; score: number }
  theirs: { position: number; score: number }
  gap: number
  agree: boolean
}

export interface MatchPerson {
  id: string
  name: string
  handle: string | null
  image: string | null
}

export interface MatchNotTried {
  restaurantId: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  position: number
  score: number
}

export interface UserMatchResponse {
  me: MatchPerson
  them: MatchPerson
  matchPercent: number | null
  sharedCount: number
  myListSize: number
  theirListSize: number
  places: MatchPlace[]
  sharedCuisines: string[]
  sharedNeighborhoods: string[]
  notTried: MatchNotTried[]
}

export interface BlockedUser {
  id: string
  name: string
  handle: string | null
  image: string | null
}

// A person + place in the discovery feed.
export interface FeedItem {
  rankingId: string
  position: number
  score: number
  // When this ranking was first CREATED, not last edited — the feed pages on
  // (createdAt, id) (see apps/api/src/routes/feed.ts), so a re-rank doesn't
  // resurface an old row or shift its place in the timeline.
  rankedAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant: RankedRestaurant
  neighborhood: string | null
  note: string | null
  noteId?: string | null
  cheersCount?: number
  cheeredByMe?: boolean
  dishId?: string | null
  dishImage?: string | null
  dishName?: string | null
  dishGrain?: string | null
  // SaveButton's initial state (M19) — a dish post saves the dish, a
  // ranking post saves the restaurant.
  restaurantSaved?: boolean
  dishSaved?: boolean
  // Comments on the post (the ranking) — the count, plus the latest visible
  // one previewed under the note, Instagram-style.
  commentCount?: number
  lastComment?: { user: { id: string; name: string; handle: string | null }; body: string } | null
}

export interface RankingComment {
  id: string
  body: string
  createdAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  // The author, or the owner of the ranking it sits on.
  canDelete: boolean
}

export interface RankingCommentsResponse {
  ranking: {
    id: string
    score: number
    note: string | null
    user: { id: string; name: string; handle: string | null; image: string | null }
    restaurant: { id: string; name: string }
  }
  comments: RankingComment[]
}

export interface FriendRanking {
  user: { id: string; name: string; handle: string | null; image: string | null }
  score: number
  position: number
  note: string | null
  noteId: string | null
}

export interface RestaurantProfileResponse {
  restaurant: {
    id: string
    name: string
    cuisine: string | null
    lat: number
    lng: number
    coverImageId: string | null
    phone: string | null
    website: string | null
    closesAt: string | null
    priceTier: number | null
    neighborhood: { slug: string; name: string } | null
    // M9: populated when the profile was created (or enriched) from a Google
    // Places result.
    address: string | null
    geoPrecision: 'exact' | 'sector'
    google: boolean
    hasMenu: boolean
  }
  friendsRankings: FriendRanking[]
  friendAvg: number | null
  occasionTags: string[]
  allMesa: { avg: number | null; count: number }
  lists: { slug: string; title: string }[]
  similar: RailSpot[]
  // Friends who saved this place → the "N friends want to try" social line.
  friendsWantToTry: { count: number; people: { name: string; image: string | null }[] }
  myRanking: { position: number; score: number } | null
  saved: boolean
}

// A restaurant's own published menu (M5) — GET /restaurants/:id/menu.
export interface MenuItem {
  id: string
  name: string
  description: string | null
  priceCents: number | null
  currency: string | null
}
export interface RestaurantMenu {
  sections: { name: string; label: { es: string; en: string }; items: MenuItem[] }[]
  verifiedAt: string | null
}

// Planes (M3) — group dinners. Mirrors apps/api/src/routes/plans.ts's response
// shapes; that file has no equivalent client this app can import (same reason
// as ActivityItem above), so this is the hand-kept copy.
export type PlanStatus = 'open' | 'confirmed' | 'cancelled'
export type PlanReply = 'pending' | 'going' | 'maybe' | 'declined'

export interface PlanOption {
  id: string
  name: string
  coverImageId: string | null
  neighborhood: string | null
  cuisine: string | null
  priceTier: number | null
  position: number
  votes?: number // present on GET /plans/:id only, not the list
}

export interface Plan {
  id: string
  status: PlanStatus
  startsAt: string
  note: string | null
  chosenRestaurantId: string | null
  host: { id: string; name: string; handle: string | null; image: string | null }
  isHost: boolean
  myReply: PlanReply | null // null when I'm the host (no invite row)
  myVote: string | null
  options: PlanOption[]
  counts: { going: number; maybe: number; pending: number }
}

export interface PlanMember {
  id: string
  name: string
  handle: string | null
  image: string | null
  reply: PlanReply
  voteRestaurantId: string | null
  repliedAt: string | null
}

export interface PlanDetail extends Omit<Plan, 'counts'> {
  members: PlanMember[]
}

// Mesa-curated events in Explore (M21). GET /events, GET /events/restaurant/:id
// and GET /events/:id all return this same shape — the list endpoints as
// { events: EventSummary[] }, the detail one as { event: EventSummary } (its
// `description`/`ticketUrl` are always present on every response, just
// usually null; there's no separate "detail-only" type).
export interface EventSummary {
  id: string
  slug: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  category: string | null
  priceLabel: string | null
  ticketUrl: string | null
  coverImageId: string | null
  restaurant: RestaurantRef & { coverImageId: string | null; neighborhood: string | null }
  myRsvp: 'going' | 'interested' | null
  // Bookmarked into the member's Saved → Events (independent of going; an
  // event can't go into a custom list). Optional until every API in the wild
  // returns it.
  savedByMe?: boolean
  goingCount: number
  friendsGoing: { id: string; name: string; image: string | null }[]
  // Optional capacity ("12 de 16 cupos") and a WhatsApp booking number
  // (digits, E.164 without "+"). spotsLeft = max(0, capacity − goingCount).
  capacity: number | null
  bookingWhatsapp: string | null
  spotsLeft: number | null
  // False for every mock/seed event until the venue actually agrees to it —
  // the UI shows a quiet "evento de muestra" mark while this is false. Not
  // optional like savedByMe: the API ships this column before any client
  // build reaches testers, so there is no in-the-wild API missing it.
  venueConfirmed: boolean
}
