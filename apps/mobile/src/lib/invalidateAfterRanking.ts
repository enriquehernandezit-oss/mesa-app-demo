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
export function invalidateAfterRanking(restaurantId: string | null): void {
  queryClient.invalidateQueries({ queryKey: ['rankings'] })
  queryClient.invalidateQueries({ queryKey: ['saved'] })
  queryClient.invalidateQueries({ queryKey: ['feed'] })
  if (restaurantId) queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
  queryClient.invalidateQueries({ queryKey: ['me-stats'] })
  queryClient.invalidateQueries({ queryKey: ['explore'] })
  queryClient.invalidateQueries({ queryKey: ['map'] })
  queryClient.invalidateQueries({ queryKey: ['lists'] })
  queryClient.invalidateQueries({ queryKey: ['list'] })
  queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
  queryClient.invalidateQueries({ queryKey: ['trending'] })
  queryClient.invalidateQueries({ queryKey: ['user-rankings'] })
}
