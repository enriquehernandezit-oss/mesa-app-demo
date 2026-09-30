import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { api } from '@/lib/api'
import { onNotificationReceived } from '@/lib/push'
import type { FollowRequest } from '@/lib/types'

// The bell's two queries live under one ['notifications'] prefix, so a single
// invalidateQueries({ queryKey: ['notifications'] }) refreshes the list and the badge.
export const INBOX_KEY = ['notifications', 'inbox'] as const
export const UNREAD_KEY = ['notifications', 'unread'] as const
export const REQUESTS_KEY = ['notifications', 'requests'] as const

// The follow requests waiting on me (F1) — behind Activity's pinned row and the requests list.
// Empty for anyone without a private account, so it is one cheap query.
export function useFollowRequests() {
  return useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: () => api.get<{ requests: FollowRequest[]; count: number }>('/social/requests'),
    staleTime: 60_000,
  })
}

// How many rows in the inbox are still unread — the number behind the feed's bell dot and the
// tab bar's badge. The server counts (it knows what the inbox would show), so this is one
// small query however long the inbox gets. Replaces the old local "seen" watermark.
export function useUnreadCount(): number {
  const unread = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api.get<{ count: number }>('/notifications/unread'),
    staleTime: 60_000,
  })
  return unread.data?.count ?? 0
}

// Keeps the badge honest without polling: refresh when the app comes back to the foreground,
// and when a push lands while it is open. Mounted once, from the signed-in layout.
export function useBellRefresh(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    const stopPush = onNotificationReceived(refresh)
    return () => {
      appState.remove()
      stopPush()
    }
  }, [queryClient])
}
