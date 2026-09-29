import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EventsBrowse } from '@/components/events/EventsBrowse'
import { CaughtUp } from '@/components/feed/CaughtUp'
import { FeedEnd } from '@/components/feed/FeedEnd'
import { FeedHeader } from '@/components/feed/FeedHeader'
import { type FeedView, FeedPills } from '@/components/feed/FeedPills'
import { FriendCard } from '@/components/feed/FriendCard'
import { ListCovers } from '@/components/feed/ListCovers'
import { PeopleShelf } from '@/components/feed/PeopleShelf'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { PersonRow } from '@/components/PersonRow'
import { Group } from '@/components/SettingsRow'
import {
  Body,
  Button,
  Caption,
  Card,
  ErrorState,
  Eyebrow,
  SectionHeader,
  Serif,
  Skeleton,
} from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { useFollow } from '@/hooks/useFollow'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { api } from '@/lib/api'
import { type FeedRow, buildFeedRows } from '@/lib/feedRows'
import { readFeedSeen, writeFeedSeen } from '@/lib/feedSeen'
import { useT } from '@/lib/i18n'
import type { FeedItem, FriendSuggestion, SuggestedUser } from '@/lib/types'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'

// The Feed (Redesign 2): a greeting, then four pills — For you, Friends, Events, Lists.
// "For you" and "Friends" are friends' rankings as cards (For you also has the "People
// you may know" shelf between them); "Events" and "Lists" host what used to be rails.
// Once the inline pills scroll away, a glass bar pins them to the top.
//
// One persistent FlatList, not a ternary across load states: that swapped the element
// TYPE on every state change, which loses the ref and the scroll position a plain
// re-render would keep, and a stable ref is what scroll-to-top-on-tab-press needs.
// Pull-to-refresh and infinite scroll are RefreshControl + onEndReached.

interface FeedPage {
  feed: FeedItem[]
  nextCursor: string | null
}

type Row = FeedRow<FeedItem, FriendSuggestion>

function uniqueByRankingId(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.rankingId) ? false : seen.add(i.rankingId)))
}

export default function DiscoverTab() {
  const t = useT()
  const accent = useColor('accent')
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const tabBarClearance = useTabBarClearance()
  const indicator = useResolvedTheme() === 'night' ? ('white' as const) : ('black' as const)
  const [view, setView] = useState<FeedView>('for_you')
  const friendsView = view === 'for_you' || view === 'friends'

  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      api.get<FeedPage>(`/feed${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  // Defensive: with a sound (createdAt, id) cursor server-side this shouldn't
  // duplicate across pages, but deduping by id is a cheap guarantee either way.
  // Memoized: it is FlatList's data, and a fresh array every render made the list
  // re-diff its whole window regardless of whether the feed had changed.
  const items = useMemo(
    () => uniqueByRankingId(feed.data?.pages.flatMap((p) => p.feed) ?? []),
    [feed.data],
  )

  // People to meet, for the shelf. Only "For you" shows it, and only once there is a
  // feed to put it in.
  const suggestions = useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api.get<{ users: FriendSuggestion[] }>('/social/suggestions'),
    staleTime: 120_000,
    enabled: view === 'for_you' && feed.isSuccess && items.length > 0,
  })

  // How far the member had read last time — read ONCE, so the "caught up" divider
  // stays where it was while they scroll and only moves on the next visit.
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined)
  const seenRef = useRef<string | null>(null)
  useEffect(() => {
    void readFeedSeen().then((v) => {
      seenRef.current = v
      setSeenAt(v)
    })
  }, [])
  const newestRef = useRef<string | null>(null)
  newestRef.current = items[0]?.rankedAt ?? null
  const flushSeen = useCallback(() => {
    if (newestRef.current) void writeFeedSeen(newestRef.current, seenRef.current)
  }, [])
  // Save the watermark when the member leaves the tab or the app.
  useFocusEffect(useCallback(() => flushSeen, [flushSeen]))
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flushSeen()
    })
    return () => sub.remove()
  }, [flushSeen])

  const rows = useMemo<Row[]>(
    () =>
      friendsView && seenAt !== undefined
        ? buildFeedRows({
            items,
            people: suggestions.data?.users ?? [],
            seenAt,
            shelves: view === 'for_you',
          })
        : [],
    [friendsView, view, items, suggestions.data, seenAt],
  )

  const refetchCurrent = useCallback(
    () =>
      view === 'events'
        ? queryClient.invalidateQueries({ queryKey: ['events'] })
        : view === 'lists'
          ? queryClient.invalidateQueries({ queryKey: ['lists'] })
          : feed.refetch(),
    [view, queryClient, feed],
  )
  const { refreshing, onRefresh } = usePullToRefresh(refetchCurrent)

  // Stable across renders, so a screen-level re-render (pull-to-refresh, the next page,
  // one cheers tap) doesn't make FlatList treat every mounted cell as changed.
  const renderRow = useCallback(({ item: row, index }: { item: Row; index: number }) => {
    if (row.type === 'card') return <FriendCard item={row.item} index={index} />
    if (row.type === 'shelf') return <PeopleShelf people={row.people} />
    return <CaughtUp />
  }, [])

  const listRef = useRef<FlatList<Row>>(null)
  useResetOnTabPress(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
      // A silent refetch, not onRefresh(): flipping RefreshControl's `refreshing` on
      // programmatically shifts the scroll offset down to reveal the spinner and
      // doesn't reliably restore it (usePullToRefresh's own header), which raced the
      // scrollToOffset above. A real pull-to-refresh gesture is untouched.
      void feed.refetch()
    }, [feed]),
  )

  // The pinned pill bar: once the inline pills have scrolled up under the status bar.
  const pillsY = useRef(0)
  const [pinned, setPinned] = useState(false)
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = e.nativeEvent.contentOffset.y > pillsY.current - insets.top - 4
      setPinned((was) => (was === past ? was : past))
    },
    [insets.top],
  )
  const changeView = useCallback(
    (v: FeedView) => {
      setView(v)
      // Tapped from the pinned bar: land the new view right under it, not wherever the
      // old view's scroll position happened to be.
      if (pinned) listRef.current?.scrollToOffset({ offset: pillsY.current, animated: false })
    },
    [pinned],
  )

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <FeedHeader />
            <View onLayout={(e) => (pillsY.current = e.nativeEvent.layout.y)}>
              <FeedPills value={view} onChange={changeView} />
            </View>
            {view === 'events' ? (
              <View className="px-5">
                <EventsBrowse />
              </View>
            ) : view === 'lists' ? (
              <ListCovers />
            ) : items.length > 0 ? (
              <View className="px-5">
                <SectionHeader action={<Caption>{t('feed.newest_first')}</Caption>}>
                  {t('feed.from_friends')}
                </SectionHeader>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !friendsView ? null : feed.isPending || seenAt === undefined ? (
            <FeedSkeleton />
          ) : feed.isError ? (
            <ErrorState onRetry={() => feed.refetch()}>{t('discover.load_error')}</ErrorState>
          ) : (
            <EmptyFeed />
          )
        }
        ListFooterComponent={
          !friendsView || items.length === 0 ? null : feed.isFetchingNextPage ? (
            <Body className="py-4 text-center">…</Body>
          ) : !feed.hasNextPage ? (
            <FeedEnd />
          ) : null
        }
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
        }
        // Without this a 2-item feed can't be pulled — there's nothing to overscroll —
        // so a new member has no way to refresh.
        alwaysBounceVertical
        indicatorStyle={indicator}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (friendsView && feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage()
        }}
      />
      <PinnedPills visible={pinned} view={view} onChange={changeView} />
    </View>
  )
}

// The pills again, in a glass bar that fades in over the top of the page once the inline
// row has scrolled away.
function PinnedPills({
  visible,
  view,
  onChange,
}: {
  visible: boolean
  view: FeedView
  onChange: (v: FeedView) => void
}) {
  const insets = useSafeAreaInsets()
  const o = useSharedValue(0)
  useEffect(() => {
    o.value = withTiming(visible ? 1 : 0, { duration: 160 })
  }, [visible, o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, style]}
    >
      <Glass
        solid
        variant="bar"
        radius={0}
        style={{
          borderWidth: 0,
          borderBottomWidth: 1,
          paddingTop: insets.top + 8,
          paddingBottom: 10,
        }}
      >
        <FeedPills value={view} onChange={onChange} />
      </Glass>
    </Animated.View>
  )
}

// Empty feed — the invite card + a few people to follow so the feed fills.
function EmptyFeed() {
  const t = useT()
  const suggested = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })
  const users = suggested.data?.users ?? []
  return (
    <View className="px-4">
      <Card className="items-center gap-2 p-6">
        <Serif className="text-center text-title text-text">{t('discover.empty_title')}</Serif>
        <Body className="text-center text-text-muted">{t('discover.empty_body')}</Body>
      </Card>
      {users.length > 0 && (
        <>
          <Eyebrow className="mb-2 mt-5 px-1">{t('discover.start_with_these')}</Eyebrow>
          <Group>
            {users.map((u, i) => (
              <SuggestedRow key={u.id} user={u} last={i === users.length - 1} />
            ))}
          </Group>
        </>
      )}
    </View>
  )
}

function SuggestedRow({ user: u, last }: { user: SuggestedUser; last: boolean }) {
  const t = useT()
  const { following, toggle, pending } = useFollow(u.id, false, 'empty_feed')
  return (
    <PersonRow
      user={u}
      last={last}
      subtitle={[t('settings.ranked_count', { n: u.rankedCount ?? 0 }), u.neighborhood]
        .filter(Boolean)
        .join(' · ')}
      right={
        <Button
          variant={following ? 'secondary' : 'primary'}
          size="sm"
          className="min-h-[34px] px-4"
          onPress={toggle}
          disabled={pending}
        >
          {following ? t('activity.following_pill') : t('activity.follow_pill')}
        </Button>
      }
    />
  )
}

// The skeleton holds the SAME shapes as the loaded feed so nothing reflows when data
// arrives: friend cards, 112 tall.
function FeedSkeleton() {
  return (
    <View className="px-4 pt-1">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="mb-2.5 overflow-hidden rounded-card">
          <Skeleton height={112} />
        </View>
      ))}
    </View>
  )
}
