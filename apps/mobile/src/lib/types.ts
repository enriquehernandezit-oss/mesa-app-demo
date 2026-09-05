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
  }
  onboardingComplete: boolean
}

// A row in the moderator queue. `target` carries the reported content itself —
// a bare id can't be judged — and is null when the row is already gone.
export interface ModerationReport {
  id: string
  reporterId: string
  targetType: 'vibe_note' | 'user' | 'dish'
  targetId: string
  reason: string
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed'
  createdAt: string
  target:
    | { kind: 'vibe_note'; body: string }
    | { kind: 'dish'; name: string; caption: string | null; imageId: string }
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
  imageId: string
  grain: string
  createdAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
}

// The dish-detail screen (C3): a dish + its linked ranking/place.
export interface DishDetail {
  id: string
  name: string
  caption: string | null
  imageId: string
  grain: string
  createdAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  score: number // the poster's own score for the linked place (0–100)
  posterIsMe: boolean
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

export interface FeaturedList {
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
  list: { slug: string; title: string; subtitle: string | null; coverImageId: string | null }
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
  type: 'cheers' | 'follow' | 'saved_ranked' | 'friend_ranked'
  at: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant?: { id: string; name: string; coverImageId: string | null } | null
  score?: number | null // friend_ranked: their score (0–100)
  yourScore?: number | null // friend_ranked: mine, for "— above your 8.8"
  followsBack?: boolean // follow rows: do I already follow them back?
}

export interface SavedPlace {
  restaurant: RankedRestaurant
  neighborhood: string | null
  savedAt: string
}

export interface UserRankingsResponse {
  user: {
    id: string
    name: string
    handle: string | null
    image: string | null
    neighborhood: { name: string } | null
  }
  rankings: Ranking[]
  isFollowing: boolean
  followerCount: number
  followingCount: number
  matchPercent: number | null
  sharedCount: number
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
  rankedAt: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant: RankedRestaurant
  neighborhood: string | null
  note: string | null
  cheersCount?: number
  cheeredByMe?: boolean
  dishId?: string | null
  dishImage?: string | null
  dishName?: string | null
  dishGrain?: string | null
}

export interface FriendRanking {
  user: { id: string; name: string; handle: string | null; image: string | null }
  score: number
  position: number
  note: string | null
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
