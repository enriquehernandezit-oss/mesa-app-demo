// What a ranking write touches, in one place — imported by both rank.tsx (rank
// / re-rank / save-with-photo) and rankingRemoval.ts (delete), which used to
// each hand-roll their own partial list. A new rank changes more than the
// rankings list and the feed: it can move a friend-match percentage, a
// neighborhood's "N of M ranked" progress on a curated list, the leaderboard,
// the trending rail, and the profile's own stat trio — all of it stale the
// instant this resolves unless every one of those keys is invalidated too.
import { queryClient } from './query'

// restaurantId is nullable because rank.tsx's callers hold it in state typed
// string | null — by the time these mutations resolve it's always been set
// (that's what let them fire), but the type can't prove that from here.
//
// Two halves, because WHEN each refreshes matters on a phone. The rank flow is a sheet over the tabs, and
// every query below that a mounted tab is watching refetches the instant it is invalidated — the feed (cards
// and photos), home, Explore, the map … — and the phone has to receive and re-render all of it while the
// member is still tapping "Listo" on the score screen. A measured save took 37 ms on the server and every
// refetch under 100 ms, yet the screen stalled: the cost was on the phone. So the rank flow refreshes only
// what its own screens and Your list show right away (`invalidateRankingNow`), and the rest when it closes
// (`invalidateRankingRest`) — the member is looking at a different screen by then. Everything else that
// changes a ranking (removal) wants both at once: `invalidateAfterRanking`.

// What is on screen during the flow, or one tap away the moment it ends: Your list, saved places, this
// place's page (the score screen's friend line), the profile's stat trio.
export function invalidateRankingNow(restaurantId: string | null): void {
  queryClient.invalidateQueries({ queryKey: ['rankings'] })
  queryClient.invalidateQueries({ queryKey: ['saved'] })
  if (restaurantId) queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
  queryClient.invalidateQueries({ queryKey: ['me-stats'] })
}

// Everything a ranking also moves, none of it visible from the rank flow: the feed, "Your six", Popular, the
// Explore results and map pins, curated lists' progress, the leaderboard, trending, a member's profile.
export function invalidateRankingRest(): void {
  queryClient.invalidateQueries({ queryKey: ['feed'] })
  // Your six leaves out what you've ranked, and friends' rankings feed it.
  queryClient.invalidateQueries({ queryKey: ['home'] })
  // Popular moves with every ranking.
  queryClient.invalidateQueries({ queryKey: ['popular'] })
  queryClient.invalidateQueries({ queryKey: ['explore'] })
  queryClient.invalidateQueries({ queryKey: ['map'] })
  queryClient.invalidateQueries({ queryKey: ['lists'] })
  queryClient.invalidateQueries({ queryKey: ['list'] })
  queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
  queryClient.invalidateQueries({ queryKey: ['trending'] })
  queryClient.invalidateQueries({ queryKey: ['user-rankings'] })
  // A member's match with you moves with your list; dishes and dish lists read your rankings.
  queryClient.invalidateQueries({ queryKey: ['user-match'] })
  queryClient.invalidateQueries({ queryKey: ['dish-lists'] })
  queryClient.invalidateQueries({ queryKey: ['dish-names'] })
}

export function invalidateAfterRanking(restaurantId: string | null): void {
  invalidateRankingNow(restaurantId)
  invalidateRankingRest()
}
