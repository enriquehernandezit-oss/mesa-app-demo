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
}

export interface BlockedUser {
  id: string
  name: string
  handle: string | null
  image: string | null
}
