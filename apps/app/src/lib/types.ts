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
    neighborhood: Neighborhood | null
  }
  onboardingComplete: boolean
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
}

export interface RankedRestaurant {
  id: string
  name: string
  cuisine: string | null
  coverImageId?: string | null
  priceTier?: number | null
}

// A row in a ranked list (mine or someone else's).
export interface Ranking {
  id: string
  position: number
  score: number
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

export interface ExploreHit {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
  priceTier: number | null
  friendAvg: number | null
  friendCount: number
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
  type: 'cheers' | 'follow' | 'saved_ranked'
  at: string
  user: { id: string; name: string; handle: string | null; image: string | null }
  restaurant?: { id: string; name: string } | null
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
    priceTier: number | null
    neighborhood: { slug: string; name: string } | null
  }
  friendsRankings: FriendRanking[]
  friendAvg: number | null
  occasionTags: string[]
  allMesa: { avg: number | null; count: number }
  similar: RailSpot[]
  myRanking: { position: number; score: number } | null
  saved: boolean
}
