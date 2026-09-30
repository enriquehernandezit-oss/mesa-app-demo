import { type InfiniteData, type QueryClient } from '@tanstack/react-query'

import { INBOX_KEY, UNREAD_KEY } from '@/hooks/useBell'

import { api } from './api'
import type { NotificationsPage } from './types'

// Marks everything in the inbox up to `before` as read: the visible rows flip at once, the badge
// drops to zero (then the server's real count replaces it — a row newer than `before` stays
// unread), and the server is told. Used when leaving Activity and the follow-requests list.
export function markNotificationsRead(queryClient: QueryClient, before: string): void {
  queryClient.setQueryData<InfiniteData<NotificationsPage>>(INBOX_KEY, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            notifications: page.notifications.map((n) =>
              n.createdAt <= before ? { ...n, read: true } : n,
            ),
          })),
        }
      : data,
  )
  queryClient.setQueryData(UNREAD_KEY, { count: 0 })
  const refresh = () => queryClient.invalidateQueries({ queryKey: UNREAD_KEY })
  api.post('/notifications/read', { before }).then(refresh).catch(refresh)
}
