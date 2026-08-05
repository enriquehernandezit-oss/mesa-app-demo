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
}

// A row in a ranked list (mine or someone else's).
export interface Ranking {
  id: string
  position: number
  score: number
  restaurant: RankedRestaurant
  neighborhood: string | null
  note: string | null
  noteId?: string | null // present on other users' lists (for reporting)
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
    neighborhood: { slug: string; name: string } | null
  }
  friendsRankings: FriendRanking[]
  myRanking: { position: number; score: number } | null
  saved: boolean
}
