import { toast } from '@/components/ui/toast-store'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

// The one follow/unfollow implementation. Before this hook existed the same
// mutation was hand-rolled four times (onboarding's FriendsStep, the empty
// feed's suggestions, an Activity row, and a member's passport) with three
// different — and mostly missing — error-handling stories: a silent
// `.catch(() => {})`, no `onError` at all, or a "Siguiendo" that flips before
// the request even lands and never rolls back on failure. A follow that
// silently fails is a broken promise in a social app, so every caller now goes
// through one optimistic toggle with a real rollback.
//
// `initial` drives the local `following` value; it re-syncs whenever the
// caller's own data changes (a refetch, a different row), but a `pendingRef`
// guards against a stale `initial` from an in-flight invalidation stomping the
// optimistic flip before that refetch actually lands — the ref (not
// `mutation.isPending`) is what the sync effect reads, so it never needs to be
// a dependency of that effect.
export type FollowSource =
  | 'onboarding'
  | 'empty_feed'
  | 'activity'
  | 'passport'
  | 'people_screen'
  | 'find_friends'

const RELATED_QUERY_KEYS = ['feed', 'activity', 'people', 'me-stats'] as const

export function useFollow(userId: string, initial: boolean, from: FollowSource) {
  const [following, setFollowing] = useState(initial)
  const queryClient = useQueryClient()
  const pendingRef = useRef(false)

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post('/social/follow', { userId }) : api.del(`/social/follow/${userId}`),
    onSuccess: (_data, next) => {
      track(next ? 'follow_added' : 'follow_removed', { from })
      for (const key of RELATED_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      queryClient.invalidateQueries({ queryKey: ['user-rankings', userId] })
    },
    onError: (_err, next) => {
      // Roll back the optimistic flip — the request never landed.
      setFollowing(!next)
      toast({
        variant: 'error',
        message: next ? 'No se pudo seguir. Intenta de nuevo.' : 'No se pudo dejar de seguir.',
      })
    },
    onSettled: () => {
      pendingRef.current = false
    },
  })

  useEffect(() => {
    if (!pendingRef.current) setFollowing(initial)
  }, [initial])

  const toggle = () => {
    if (mutation.isPending) return
    pendingRef.current = true
    const next = !following
    setFollowing(next)
    mutation.mutate(next)
  }

  return { following, toggle, pending: mutation.isPending }
}
