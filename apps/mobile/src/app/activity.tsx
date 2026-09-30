import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, SectionList, View } from 'react-native'

import { ActivityRow } from '@/components/activity/ActivityRow'
import { GroupLabel } from '@/components/SettingsRow'
import { Button, Chip, ChipRail, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { INBOX_KEY, UNREAD_KEY } from '@/hooks/useBell'
import { type ActivityFilter, FILTERS, groupByBucket, matchesFilter } from '@/lib/activityGroups'
import { api } from '@/lib/api'
import { useLanguage, useT } from '@/lib/i18n'
import { registerForPush } from '@/lib/push'
import type { NotificationItem, NotificationsPage } from '@/lib/types'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useColor } from '@/theme/useColor'

// The screen behind the bell (Redesign 2): everything that happened to you or near you, newest
// first, in Today / This week / Earlier, under five pills. It reads the stored inbox
// (GET /notifications/inbox, 30 at a time) — the same rows the pushes are made from — so the
// dots, the badge and the pushes agree. Rows are flat on the cream ground with hairlines; an
// accent dot in the left gutter marks what you haven't seen. Leaving the screen marks
// everything you were shown as read (not opening it: the dots stay put while you read).
// Follow back / place photo on the right; the row itself opens what it is about.

// A pill that hides most of what's loaded keeps fetching pages until it has this many rows
// (or the inbox runs out), so "Plans" never looks empty just because the plans are on page 3.
const MIN_FILTERED_ROWS = 10

export default function ActivityScreen() {
  const t = useT()
  const lang = useLanguage()
  const router = useRouter()
  const queryClient = useQueryClient()
  const accent = useColor('accent')
  const [filter, setFilter] = useState<ActivityFilter>('all')

  const q = useInfiniteQuery({
    queryKey: INBOX_KEY,
    queryFn: ({ pageParam }) =>
      api.get<NotificationsPage>(
        `/notifications/inbox${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })

  // Contextual push-permission prompt (M17) — someone opening Activity has already shown they
  // care about what happens around them, the exact thing push notifications extend beyond the
  // app being open. Mount-only; safe to call more than once (idempotent once decided).
  useEffect(() => {
    void registerForPush()
  }, [])

  // Read state moves on the way OUT, not in: opening the screen must not clear the dots while
  // someone is still looking at them. `before` is the newest row this visit showed, so anything
  // that arrives while it is open stays unread.
  const newest = useRef<string | null>(null)
  newest.current = q.data?.pages[0]?.notifications[0]?.createdAt ?? null
  useFocusEffect(
    useCallback(() => {
      return () => {
        const before = newest.current
        if (!before) return
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
        api
          .post('/notifications/read', { before })
          .then(() => queryClient.invalidateQueries({ queryKey: UNREAD_KEY }))
          .catch(() => queryClient.invalidateQueries({ queryKey: UNREAD_KEY }))
      }
    }, [queryClient]),
  )

  const shown = useMemo(
    () =>
      (q.data?.pages.flatMap((page) => page.notifications) ?? []).filter((n) =>
        matchesFilter(n.kind, filter),
      ),
    [q.data, filter],
  )
  // Rebuilt when the rows or the language change (t is a fresh function every render).
  const sections = useMemo(
    () =>
      groupByBucket(shown, new Date()).map((s) => ({
        ...s,
        title: t(`activity.section_${s.key}`),
      })),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [shown, lang],
  )

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q
  // Local `refreshing`, true only for a pull the member started — q.isRefetching also flips on
  // a follow-back invalidating the inbox, and iOS shifts the list down for a spinner it then
  // never takes back.
  const { refreshing, onRefresh } = usePullToRefresh(q.refetch)
  useEffect(() => {
    if (
      filter !== 'all' &&
      shown.length < MIN_FILTERED_ROWS &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage()
    }
  }, [filter, shown.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const filterLabel: Record<ActivityFilter, string> = {
    all: t('activity.filter_all'),
    followers: t('activity.filter_follows'),
    rankings: t('activity.filter_rankings'),
    plans: t('activity.filter_plans'),
    events: t('activity.filter_events'),
  }

  // What fills the list when there are no rows: still loading (or still looking for a pill's
  // rows further back), failed, or genuinely quiet.
  const empty =
    q.isPending || (shown.length === 0 && hasNextPage) ? (
      <RowsSkeleton />
    ) : q.isError ? (
      <ErrorState onRetry={() => q.refetch()}>{t('activity.load_error')}</ErrorState>
    ) : (
      <EmptyState
        body={t('activity.empty_body')}
        action={
          <Button size="sm" variant="secondary" onPress={() => router.push('/friends')}>
            {t('activity.discover_people')}
          </Button>
        }
      >
        {t('activity.empty_title')}
      </EmptyState>
    )

  // The list sits inside a plain View, not as the screen root: as the root, the native large
  // title vanished after an overscroll (react-native-screens tracks the screen's first child).
  return (
    <View className="flex-1 bg-bg">
      <SectionList<NotificationItem, { key: string; title: string; data: NotificationItem[] }>
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
        // A short list (one pill's few rows) can still be pulled to refresh.
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <GroupLabel>{section.title}</GroupLabel>}
        renderItem={({ item }) => <ActivityRow n={item} />}
        ListHeaderComponent={
          <ChipRail className="mb-1">
            {FILTERS.map((f) => (
              <Chip
                key={f}
                size="sm"
                state={filter === f ? 'selected' : 'default'}
                onPress={() => setFilter(f)}
              >
                {filterLabel[f]}
              </Chip>
            ))}
          </ChipRail>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={isFetchingNextPage ? <RowsSkeleton rows={2} /> : null}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
      />
    </View>
  )
}
