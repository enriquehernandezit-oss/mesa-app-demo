import { useCallback, useState } from 'react'

// `query.isRefetching` is true for ANY background refetch (another screen
// invalidating this query), not just a user's own pull. iOS's RefreshControl
// shifts the scroll offset down and starts spinning whenever `refreshing`
// flips true, and never restores it on its own — if that happens while the
// tab is hidden or covered, the spinner is still there, frozen, next time you
// look. This hook's `refreshing` is local state, true only for the span of a
// pull the user actually started.
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])
  return { refreshing, onRefresh }
}
