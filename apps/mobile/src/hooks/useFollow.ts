import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/toast-store'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { FollowStatus } from '@/lib/types'

// The one follow/unfollow implementation. Before this hook existed the same
// mutation was hand-rolled four times (onboarding's FriendsStep, the empty
// feed's suggestions, an Activity row, and a member's passport) with three
// different — and mostly missing — error-handling stories: a silent
// `.catch(() => {})`, no `onError` at all, or a "Siguiendo" that flips before
// the request even lands and never rolls back on failure. A follow that
// silently fails is a broken promise in a social app, so every caller now goes
// through one optimistic toggle with a real rollback.
//
// Following has THREE states since private accounts (F1): `none`, `following`, and `requested`
// — a request to a private account that its owner has not answered. Tapping Follow on a private
// account asks, tapping Requested withdraws it. The server decides which one a Follow becomes
// (`status` in the response). When the caller already knows the person is private it passes
// `isPrivate`, and the pill flips straight to Requested; when it doesn't (a suggestion, a search
// row) nothing flips until the answer lands, so a private account never flashes "Following".
//
// `initial` drives the local state; it re-syncs whenever the caller's own data changes (a
// refetch, a different row), but a `pendingRef` guards against a stale `initial` from an
// in-flight invalidation stomping the optimistic flip before that refetch actually lands — the
// ref (not `mutation.isPending`) is what the sync effect reads, so it never needs to be a
// dependency of that effect. A plain boolean is `following` / `none`.
export type FollowSource =
  | 'onboarding'
  | 'empty_feed'
  | 'activity'
  | 'passport'
  | 'people_screen'
  | 'find_friends'
  | 'feed_shelf'
  | 'requests'

const RELATED_QUERY_KEYS = ['feed', 'home', 'notifications', 'people', 'me-stats'] as const

const toStatus = (v: boolean | FollowStatus): FollowStatus =>
  v === true ? 'following' : v === false ? 'none' : v

export function useFollow(
  userId: string,
  initial: boolean | FollowStatus,
  from: FollowSource,
  isPrivate?: boolean,
) {
  const [status, setStatus] = useState<FollowStatus>(toStatus(initial))
  const t = useT()
  const queryClient = useQueryClient()
  const pendingRef = useRef(false)
  const beforeRef = useRef<FollowStatus>(status)

  const mutation = useMutation({
    mutationFn: async (action: 'follow' | 'unfollow'): Promise<FollowStatus> => {
      if (action === 'unfollow') {
        await api.del(`/social/follow/${userId}`)
        return 'none'
      }
      const res = await api.post<{ status?: FollowStatus }>('/social/follow', { userId })
      return res.status === 'requested' ? 'requested' : 'following'
    },
    onSuccess: (result, action) => {
      setStatus(result)
      track(
        action === 'unfollow'
          ? 'follow_removed'
          : result === 'requested'
            ? 'follow_requested'
            : 'follow_added',
        { from },
      )
      for (const key of RELATED_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      queryClient.invalidateQueries({ queryKey: ['user-rankings', userId] })
    },
    onError: (_err, action) => {
      // Roll back the optimistic flip — the request never landed.
      setStatus(beforeRef.current)
      toast({
        variant: 'error',
        message: action === 'follow' ? t('social.follow_error') : t('social.unfollow_error'),
      })
    },
    onSettled: () => {
      pendingRef.current = false
    },
  })

  useEffect(() => {
    if (!pendingRef.current) setStatus(toStatus(initial))
  }, [initial])

  const toggle = () => {
    if (mutation.isPending) return
    pendingRef.current = true
    beforeRef.current = status
    if (status === 'none') {
      if (isPrivate !== undefined) setStatus(isPrivate ? 'requested' : 'following')
      mutation.mutate('follow')
    } else {
      setStatus('none')
      mutation.mutate('unfollow')
    }
  }

  return {
    status,
    following: status === 'following',
    requested: status === 'requested',
    toggle,
    pending: mutation.isPending,
  }
}

// The label a Follow pill wears for each state.
export const followLabelKey = (status: FollowStatus) =>
  status === 'following'
    ? 'activity.following_pill'
    : status === 'requested'
      ? 'activity.requested_pill'
      : 'activity.follow_pill'
