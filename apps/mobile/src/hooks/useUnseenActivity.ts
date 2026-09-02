import { useActivitySeen } from '@/lib/activitySeen'
import { api } from '@/lib/api'
import type { ActivityItem } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'

// How many activity events landed since the member last opened Activity. Shared
// by the TopBar bell and the tab bar's badge, so both read one query and one
// watermark — extracted from TopBar when the native tab bar gained a badge.
export function useUnseenActivity(): number {
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
    staleTime: 60_000,
  })
  const watermark = useActivitySeen()
  return (activity.data?.activity ?? []).filter((a) => a.at > watermark).length
}
