import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { MeResponse } from '../lib/types'

// The current user's profile + onboarding gate. Cached; refetched after
// onboarding mutations invalidate ['me']. Only runs when `enabled` (i.e. once
// Better Auth reports a session), so it never fires an unauthed 401.
export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
    enabled,
  })
}
