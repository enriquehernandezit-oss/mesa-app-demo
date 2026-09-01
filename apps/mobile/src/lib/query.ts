import { QueryClient } from '@tanstack/react-query'

// One QueryClient for the app. Cache-by-default (hard rule #5): feeds and lists
// stay warm so re-opening a tab is instant. staleTime keeps us from refetching
// on every mount; gcTime holds cache across tab switches.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min — feeds don't need to refetch on every focus
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
