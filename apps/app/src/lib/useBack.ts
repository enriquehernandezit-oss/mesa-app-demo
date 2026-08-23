import { useCanGoBack, useRouter } from '@tanstack/react-router'

// Shared "back" behaviour for the full-screen routes (restaurant, list, map,
// explore, leaderboard, activity, a member's profile, settings). Each of these
// used to hard-navigate to a fixed home tab, so backing out of Restaurant → List
// dumped you at the Feed instead of returning to the Restaurant — real history
// was ignored. This returns to the actual previous entry when there is one, and
// only uses the caller's fallback on a cold start or a deep link (no prior
// in-app entry to return to), so a shared/opened link still has a way home.
export function useBack(fallback: () => void) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return () => {
    if (canGoBack) router.history.back()
    else fallback()
  }
}
