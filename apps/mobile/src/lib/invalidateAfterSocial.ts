import { queryClient } from './query'

// What a follow, a block and a save touch, in one place each — the way invalidateAfterRanking.ts does
// it for a ranking. Each of these used to refresh a short, hand-written list that missed screens
// showing the same fact: unfollow from Following, switch tabs and back, and the row read "Following"
// again; block someone and Settings → Blocked did not list them for a minute, so there was nothing to
// unblock; unsave in Saved, open the place, still "saved".

// Marked stale but not refetched while on screen: the Find friends list and a followers list would
// otherwise drop or reshuffle the very row just tapped, under the thumb. The next visit refetches.
const STALE_ONLY = ['follow-list', 'suggestions', 'followers'] as const

export function invalidateAfterFollow(userId: string): void {
  for (const key of ['feed', 'home', 'notifications', 'people', 'me-stats']) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
  queryClient.invalidateQueries({ queryKey: ['user-rankings', userId] })
  queryClient.invalidateQueries({ queryKey: ['user-match', userId] })
  for (const key of STALE_ONLY) {
    queryClient.invalidateQueries({ queryKey: [key], refetchType: 'none' })
  }
  // Friends' scores and averages on a place page, in Explore, Popular, the map and the leaderboard
  // all come from who you follow — but none of them is the screen the tap happened on, and every
  // mounted tab refetches the moment it is invalidated. Held back a moment so the follow itself (the
  // pill, the profile) is not competing with them, as the rank flow does (invalidateAfterRanking.ts).
  setTimeout(() => {
    for (const key of ['restaurant', 'explore', 'popular', 'map', 'leaderboard', 'trending']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, 1500)
}

// Block and unblock change the same surfaces: someone appears in, or disappears from, nearly every
// social read.
export function invalidateAfterBlockChange(): void {
  for (const key of [
    'blocks',
    'feed',
    'home',
    'people',
    'notifications',
    'user-rankings',
    'user-match',
    'explore',
    'popular',
    'leaderboard',
    'trending',
    'restaurant',
    'list',
    'lists',
    'map',
    'plans',
    'plan',
    'events',
    'event',
    'comments',
    'saved',
    'saved-dishes',
    'dishes',
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
  for (const key of STALE_ONLY) {
    queryClient.invalidateQueries({ queryKey: [key], refetchType: 'none' })
  }
}

// Saving or unsaving a place: the Saved lists, the place page's saved state and friends' counts, the
// lists a place sits in, "Your six" (which leaves out saved places) and the feed card's saved flag.
export function invalidateAfterSavedPlace(restaurantId: string): void {
  for (const key of ['saved', 'collections', 'collection', 'home', 'feed']) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
  queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
}

export function invalidateAfterSavedDish(dishId: string): void {
  for (const key of ['saved-dishes', 'collections', 'collection', 'feed']) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
  queryClient.invalidateQueries({ queryKey: ['dish', dishId] })
}
