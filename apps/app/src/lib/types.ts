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
