import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { FollowBackPill } from '@/components/FollowBackPill'
import { Caption, EmptyState, ErrorState, MAX_SCALE, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { toast } from '@/components/ui/toast-store'
import { useFollowRequests } from '@/hooks/useBell'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { markNotificationsRead } from '@/lib/markRead'
import { timeAgo } from '@/lib/time'
import type { FollowRequest } from '@/lib/types'

// Follow requests (F1): everyone waiting on your private account, newest first — Confirm makes
// them a follower (and tells them), Delete removes the request without a word. A confirmed row
// stays put and turns into "Follow back" (or "Following"), so answering someone and following
// them back is one visit; it is gone the next time you open the screen. Reached from the pinned
// row at the top of Activity.
//
// The list is a snapshot taken when the requests first load: the query is refetched whenever a
// follow (or anything under ['notifications']) changes, and a row you have just answered must
// not vanish from under your thumb because of that.
type Item = FollowRequest & { accepted?: boolean }

export default function FollowRequestsScreen() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const q = useFollowRequests()
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    if (q.data && items === null) setItems(q.data.requests)
  }, [q.data, items])

  // Seeing the requests clears their bell count: read up to the newest request (its notification
  // lands a moment after the request, hence the few seconds of slack).
  const newest = useRef<string | null>(null)
  newest.current = q.data?.requests[0]
    ? new Date(Date.parse(q.data.requests[0].requestedAt) + 5000).toISOString()
    : null
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (newest.current) markNotificationsRead(queryClient, newest.current)
      }
    }, [queryClient]),
  )

  const answer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      api.post(`/social/requests/${id}/${action}`),
    onSuccess: (_data, { id, action }) => {
      setItems((prev) =>
        (prev ?? []).flatMap((r) =>
          r.id !== id ? [r] : action === 'decline' ? [] : [{ ...r, accepted: true }],
        ),
      )
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['me-stats'] })
    },
    onError: () => toast({ variant: 'error', message: t('requests.answer_error') }),
  })

  const rows = items ?? []
  return (
    // The list sits in a plain View, like Activity: as a screen's root element it can lose the
    // native large title.
    <View className="flex-1 bg-bg">
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 border-line border-b py-3">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/u/${item.id}`)}
              className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
            >
              <Avatar name={item.name || item.handle || 'm'} src={item.image} size={44} />
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-subhead text-text"
                >
                  {item.name || item.handle}
                </Text>
                <Caption numberOfLines={1} className="text-meta">
                  {item.accepted
                    ? t('requests.accepted')
                    : [item.handle ? `@${item.handle}` : null, timeAgo(item.requestedAt)]
                        .filter(Boolean)
                        .join(' · ')}
                </Caption>
              </View>
            </Pressable>
            {item.accepted ? (
              <FollowBackPill userId={item.id} initial={item.isFollowing} from="requests" />
            ) : (
              <View className="flex-row items-center gap-2">
                <Pressable
                  hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
                  accessibilityRole="button"
                  disabled={answer.isPending}
                  onPress={() => answer.mutate({ id: item.id, action: 'accept' })}
                  className="h-[34px] justify-center rounded-pill bg-ink px-4 active:opacity-70"
                >
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui-semibold text-label text-on-ink"
                  >
                    {t('requests.confirm')}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
                  accessibilityRole="button"
                  disabled={answer.isPending}
                  onPress={() => answer.mutate({ id: item.id, action: 'decline' })}
                  className="h-[34px] justify-center rounded-pill bg-chip px-4 active:opacity-70"
                >
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="font-ui-semibold text-label text-text"
                  >
                    {t('requests.delete')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          q.isPending || (q.data && items === null) ? (
            <RowsSkeleton />
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()}>{t('requests.load_error')}</ErrorState>
          ) : (
            <EmptyState body={t('requests.empty_body')}>{t('requests.empty_title')}</EmptyState>
          )
        }
      />
    </View>
  )
}
