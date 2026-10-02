import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import type { EventSummary } from '@/lib/types'

// Every upcoming event, soonest first (GET /events?when=upcoming). The one list that Explore's Events
// view and the Feed's "Events this week" shelf both read, so they share a cache entry — and an RSVP
// or a save anywhere (which invalidates ['events']) refreshes both.
export function useUpcomingEvents(options?: { enabled?: boolean; staleTime?: number }) {
  return useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events?when=upcoming'),
    ...options,
  })
}
