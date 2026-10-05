import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import type { EventSummary } from '@/lib/types'

// The events the member is going to (GET /events/mine). One cache entry under the ['events'] prefix
// that an RSVP anywhere already invalidates — read by Explore's Events view and the Feed's.
export function useMyEvents() {
  return useQuery({
    queryKey: ['events', 'mine'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events/mine'),
  })
}
