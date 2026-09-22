import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { pickReportReasonNative } from '@/components/ReportControl'
import { EmptyState, ErrorState, MAX_SCALE, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ArrowUpIcon, CloseIcon, MoreIcon } from '@/components/ui/icons'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { api } from '@/lib/api'
import { displayScore } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import type { FeedItem, RankingComment, RankingCommentsResponse } from '@/lib/types'
import { useColor } from '@/theme/useColor'

const MAX_LEN = 280

type FeedPage = { feed: FeedItem[]; nextCursor: string | null }

// Comments on one feed post (a ranking), presented as a modal sheet: the post
// itself at the top for context, the thread, and a composer pinned to the
// bottom. Each comment carries a "···" that deletes it (yours, or any on your
// own ranking) or reports it (App Store 1.2) — visible, because 1.2 wants
// reporting clearly available and the long-press this used to be was invisible;
// the long-press still works. Native action sheets, not Mesa's Sheet: this
// screen IS a native modal, and Sheet can't present over one.
export default function CommentsSheet() {
  const t = useT()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const placeholder = useColor('text-muted')
  const { rankingId } = useLocalSearchParams<{ rankingId: string }>()
  const me = useProfile(true, 5 * 60_000).data?.profile
  const [draft, setDraft] = useState('')
  const listRef = useRef<FlatList<RankingComment>>(null)

  const key = ['comments', rankingId]
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<RankingCommentsResponse>(`/comments/ranking/${rankingId}`),
  })

  // Keeps the feed card's count + "latest comment" preview in step without
  // refetching every feed page.
  function patchFeed(comments: RankingComment[]) {
    const last = comments[comments.length - 1]
    queryClient.setQueryData<InfiniteData<FeedPage>>(['feed'], (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              feed: p.feed.map((f) =>
                f.rankingId === rankingId
                  ? {
                      ...f,
                      commentCount: comments.length,
                      lastComment: last
                        ? {
                            user: {
                              id: last.user.id,
                              name: last.user.name,
                              handle: last.user.handle,
                            },
                            body: last.body,
                          }
                        : null,
                    }
                  : f,
              ),
            })),
          }
        : data,
    )
  }

  const send = useMutation({
    mutationFn: (body: string) =>
      api.post<{ comment: RankingComment }>(`/comments/ranking/${rankingId}`, { body }),
    onSuccess: ({ comment }) => {
      setDraft('')
      const next = [...(q.data?.comments ?? []), comment]
      queryClient.setQueryData<RankingCommentsResponse>(key, (d) =>
        d ? { ...d, comments: next } : d,
      )
      patchFeed(next)
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    },
    onError: () => Alert.alert(t('comments.send_error')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/comments/${id}`),
    onSuccess: (_d, id) => {
      const next = (q.data?.comments ?? []).filter((c) => c.id !== id)
      queryClient.setQueryData<RankingCommentsResponse>(key, (d) =>
        d ? { ...d, comments: next } : d,
      )
      patchFeed(next)
    },
    onError: () => Alert.alert(t('comments.delete_error')),
  })

  const report = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post('/moderation/reports', { targetType: 'comment', targetId: id, reason }),
    onSuccess: () => Alert.alert(t('common.reported')),
    onError: () => Alert.alert(t('common.report_error')),
  })

  async function openCommentMenu(c: RankingComment) {
    if (c.canDelete) {
      const i = await showActionSheet({
        options: [{ label: t('comments.delete'), destructive: true }],
      })
      if (i === 0) remove.mutate(c.id)
      return
    }
    const reason = await pickReportReasonNative('comment')
    if (reason) report.mutate({ id: c.id, reason })
  }

  const body = draft.trim()
  const canSend = body.length > 0 && body.length <= MAX_LEN && !send.isPending
  const post = q.data?.ranking

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-bg" keyboardVerticalOffset={0}>
      {/* Header — title centered, close on the right, like the mock */}
      <View className="flex-row items-center justify-center px-5 pt-5 pb-3">
        <Text className="font-ui-semibold text-subhead text-text">{t('comments.title')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.close')}
          onPress={() => router.back()}
          hitSlop={8}
          className="absolute right-4 top-3 h-10 w-10 items-center justify-center rounded-pill bg-bg-sunk active:opacity-70"
        >
          <CloseIcon size={18} />
        </Pressable>
      </View>

      {q.isPending ? (
        <RowsSkeleton className="px-5" />
      ) : q.isError || !post ? (
        <ErrorState onRetry={() => q.refetch()}>{t('comments.load_error')}</ErrorState>
      ) : (
        <FlatList
          ref={listRef}
          data={q.data.comments}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerClassName="px-5 pb-4"
          ListHeaderComponent={
            <View className="flex-row gap-3 border-line border-b pb-4 mb-2">
              <Avatar
                name={post.user.name || post.user.handle || 'm'}
                src={post.user.image}
                size={40}
              />
              <View className="flex-1">
                <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-subhead text-text">
                  <Text className="font-ui-semibold">
                    {(post.user.name || post.user.handle || '').split(' ')[0]}
                  </Text>{' '}
                  {t('discover.ranked_verb')}{' '}
                  <Text className="font-ui-semibold">{post.restaurant.name}</Text>
                  <Text className="text-text-muted"> · {displayScore(post.score)}</Text>
                </Text>
                {post.note ? (
                  <Text className="mt-1 font-serif-italic text-serif-sm text-text-2">
                    “{post.note}”
                  </Text>
                ) : null}
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState>{t('comments.empty')}</EmptyState>}
          renderItem={({ item: c }) => (
            <Pressable
              onLongPress={() => openCommentMenu(c)}
              delayLongPress={350}
              className="flex-row gap-3 py-3 active:opacity-80"
            >
              <Pressable onPress={() => router.push(`/u/${c.user.id}`)} hitSlop={6}>
                <Avatar name={c.user.name || c.user.handle || 'm'} src={c.user.image} size={40} />
              </Pressable>
              <View className="flex-1">
                <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-label">
                  <Text className="font-ui-semibold text-text">
                    {(c.user.name || c.user.handle || '').split(' ')[0]}
                  </Text>
                  <Text className="text-text-muted"> {timeAgo(c.createdAt)}</Text>
                </Text>
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="mt-0.5 font-ui text-body text-text"
                >
                  {c.body}
                </Text>
              </View>
              {/* One action per row, so the label names it outright rather than
                  saying "more": your own comment deletes, everyone else's
                  reports. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={c.canDelete ? t('comments.delete') : t('comments.report')}
                onPress={() => openCommentMenu(c)}
                hitSlop={8}
                className="h-11 w-7 items-center justify-center self-start active:opacity-60"
              >
                <MoreIcon size={18} color="text-faint" />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Composer */}
      <View
        className="flex-row items-center gap-3 border-line border-t px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <Avatar name={me?.name || me?.handle || 'm'} src={me?.image ?? null} size={36} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('comments.placeholder')}
          placeholderTextColor={placeholder}
          maxLength={MAX_LEN}
          multiline
          className="max-h-28 min-h-[44px] flex-1 rounded-card border border-line bg-surface px-4 py-3 font-ui text-body text-text"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.send')}
          accessibilityState={{ disabled: !canSend }}
          onPress={() => {
            if (canSend) send.mutate(body)
          }}
          className={`h-11 w-11 items-center justify-center rounded-pill ${canSend ? 'bg-accent-fill' : 'bg-bg-sunk'}`}
        >
          <ArrowUpIcon size={20} color={canSend ? 'on-accent' : 'text-muted'} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
