import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MentionText } from '@/components/MentionText'
import { pickReportReasonNative } from '@/components/ReportControl'
import { EmptyState, ErrorState, IconButton, MAX_SCALE, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CloseIcon, MoreIcon, SendIcon } from '@/components/ui/icons'
import { ScoreBadge } from '@/components/ui/patterns'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { useMentionField } from '@/hooks/useMentionField'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import type { FeedItem, RankingComment, RankingCommentsResponse } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

const MAX_LEN = 280

type FeedPage = { feed: FeedItem[]; nextCursor: string | null }

// Comments on one feed post (a ranking), presented as a modal sheet: the post
// itself at the top for context, the thread, and a composer pinned to the
// bottom. Each comment carries a "···" that deletes it (yours, or any on your
// own ranking) or reports it (App Store 1.2) — visible, because 1.2 wants
// reporting clearly available and the long-press this used to be was invisible;
// the long-press still works. Native action sheets, not Mesa's Sheet: this
// screen IS a native modal, and Sheet can't present over one. Redesign 2: the post's score as a chip
// at the end of its header, faces at 38, and a capsule composer with a round burgundy send button.
export default function CommentsSheet() {
  const t = useT()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // The keyboard's cover of the screen's bottom — this sheet's composer sits on that edge.
  const keyboardInset = useKeyboardInset()
  const queryClient = useQueryClient()
  const placeholder = useColor('text-faint')
  const accent = useColor('accent')
  const keyboard = useResolvedTheme() === 'night' ? 'dark' : 'light'
  const lift = useLift()
  const { rankingId } = useLocalSearchParams<{ rankingId: string }>()
  const me = useProfile(true, 5 * 60_000).data?.profile
  const [draft, setDraft] = useState('')
  const mention = useMentionField({ value: draft, onChange: setDraft, maxLength: MAX_LEN })
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
    <View className="flex-1 bg-bg" style={{ paddingBottom: keyboardInset }}>
      {/* Header — title centered, close on the right, like the mock */}
      <View className="min-h-[52px] items-center justify-center px-5 pt-3 pb-2">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-body text-text">
          {t('comments.title')}
        </Text>
        <IconButton
          accessibilityLabel={t('comments.close')}
          onPress={() => router.back()}
          icon={<CloseIcon size={18} color="text" />}
          size={40}
          className="absolute right-4 top-2"
        />
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
            <View className="mb-1 flex-row items-start gap-3 border-line border-b pb-4">
              <Avatar
                name={post.user.name || post.user.handle || 'm'}
                src={post.user.image}
                size={40}
              />
              <View className="min-w-0 flex-1">
                <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-subhead text-text">
                  <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold">
                    {(post.user.name || post.user.handle || '').split(' ')[0]}
                  </Text>{' '}
                  {t('discover.ranked_verb')}{' '}
                  <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold">
                    {post.restaurant.name}
                  </Text>
                </Text>
                {post.note ? (
                  <Text
                    maxFontSizeMultiplier={MAX_SCALE}
                    className="mt-1 font-serif text-serif-sm text-text"
                  >
                    “<MentionText text={post.note} />”
                  </Text>
                ) : null}
              </View>
              <ScoreBadge size="sm" score={post.score} attribution={{ kind: 'stated' }} />
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
                <Avatar name={c.user.name || c.user.handle || 'm'} src={c.user.image} size={38} />
              </Pressable>
              <View className="min-w-0 flex-1">
                <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-pill">
                  <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-text">
                    {(c.user.name || c.user.handle || '').split(' ')[0]}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_SCALE} className="text-text-muted">
                    {' '}
                    {timeAgo(c.createdAt)}
                  </Text>
                </Text>
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="mt-0.5 font-ui text-subhead leading-[21px] text-text"
                >
                  <MentionText text={c.body} />
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

      {/* Who you might be tagging, above the composer — tap one to finish the @handle. */}
      {mention.suggestions ? <View className="px-3.5 pb-2">{mention.suggestions}</View> : null}

      {/* Composer */}
      <View
        className="flex-row items-center gap-2.5 border-line border-t px-3.5 pt-2.5"
        // With the keyboard up the home-indicator inset is under it, so only the small gap is left.
        style={{ paddingBottom: keyboardInset > 0 ? 8 : Math.max(insets.bottom, 12) }}
      >
        <Avatar name={me?.name || me?.handle || 'm'} src={me?.image ?? null} size={34} />
        <TextInput
          {...mention.inputProps}
          placeholder={t('comments.placeholder')}
          placeholderTextColor={placeholder}
          selectionColor={accent}
          keyboardAppearance={keyboard}
          maxFontSizeMultiplier={MAX_SCALE}
          maxLength={MAX_LEN}
          multiline
          className="max-h-28 min-h-[42px] flex-1 rounded-[21px] bg-surface px-4 py-2.5 font-ui text-subhead text-text"
          style={lift}
        />
        <Pressable
          hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
          accessibilityRole="button"
          accessibilityLabel={t('comments.send')}
          accessibilityState={{ disabled: !canSend }}
          onPress={() => {
            if (canSend) send.mutate(body)
          }}
          className={`h-[40px] w-[40px] items-center justify-center rounded-pill ${canSend ? 'bg-accent-fill' : 'bg-chip'}`}
        >
          <SendIcon size={19} color={canSend ? 'on-accent' : 'text-faint'} />
        </Pressable>
      </View>
    </View>
  )
}
