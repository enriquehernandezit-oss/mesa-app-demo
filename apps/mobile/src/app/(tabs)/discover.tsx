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

import { CaughtUp } from '@/components/feed/CaughtUp'
import { EventsShelf } from '@/components/feed/EventsShelf'
import { FeedEnd } from '@/components/feed/FeedEnd'
import { FeedHeader } from '@/components/feed/FeedHeader'
import { type FeedView, FeedPills } from '@/components/feed/FeedPills'
import { FriendCard } from '@/components/feed/FriendCard'
import { FriendsEvents } from '@/components/feed/FriendsEvents'
import { ListCovers } from '@/components/feed/ListCovers'
import { NewNearYou } from '@/components/feed/NewNearYou'
import { PeopleShelf } from '@/components/feed/PeopleShelf'
import { PopularHeader } from '@/components/feed/PopularHeader'
import { PopularRow } from '@/components/feed/PopularRow'
import { TonightHero } from '@/components/feed/TonightHero'
import { TonightPick } from '@/components/feed/TonightPick'
import { YourSix } from '@/components/feed/YourSix'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { PersonRow } from '@/components/PersonRow'
import { Group } from '@/components/SettingsRow'
import {
  Body,
  Button,
  Caption,
  Card,
  ErrorState,
  EmptyState,
  Eyebrow,
  SectionHeader,
  Serif,
  Skeleton,
} from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { followLabelKey, useFollow } from '@/hooks/useFollow'
import { useResetOnTabPress } from '@/hooks/useResetOnTabPress'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'
import { api } from '@/lib/api'
import { eventsThisWeek } from '@/lib/eventTime'
import { type FeedRow, buildFeedRows } from '@/lib/feedRows'
import { readFeedSeen, writeFeedSeen } from '@/lib/feedSeen'
import { msUntilHomeRefresh } from '@/lib/homeCache'
import { useT } from '@/lib/i18n'
import type {
  EventSummary,
  FeedItem,
  FriendSuggestion,
  HomeResponse,
  Neighborhood,
  PopularItem,
  PopularPage,
  SuggestedUser,
} from '@/lib/types'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'

// The Feed (Redesign 2): a greeting, then five pills — For you, Friends, Popular, Events,
// Lists. "For you" and "Friends" are friends' rankings as cards; "Popular" is the whole
// city's places, ranked (GET /popular, a page at a time); "Events" and "Lists" host what
// used to be rails. For you also opens with "Your six" and "Tonight" (GET /home, cached
// until 5 AM) and, among the cards, the "Events this week", "People you may know" and "New near
// you" shelves.
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

// The Popular view's rows sit beside the friend feed's in one list: a ranked place, and a
// divider where the week's top places give way to the all-time favorites.
type Row =
  | FeedRow<FeedItem, FriendSuggestion, EventSummary>
  | { type: 'popular'; key: string; item: PopularItem; rank: number }
  | { type: 'popular_tail'; key: 'popular_tail' }

function uniqueByRankingId(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.rankingId) ? false : seen.add(i.rankingId)))
}

function uniqueByPlace(items: PopularItem[]): PopularItem[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.restaurant.id) ? false : seen.add(i.restaurant.id)))
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
  const [hood, setHood] = useState<string | null>(null)

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

  // Popular: the city's places, by cursor. A ranking invalidates it (lib/invalidateAfterRanking).
  const popular = useInfiniteQuery({
    queryKey: ['popular', hood],
    queryFn: ({ pageParam }) => {
      const qs = [
        hood ? `hood=${encodeURIComponent(hood)}` : null,
        pageParam ? `cursor=${encodeURIComponent(pageParam)}` : null,
      ]
        .filter(Boolean)
        .join('&')
      return api.get<PopularPage>(`/popular${qs ? `?${qs}` : ''}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 300_000,
    enabled: view === 'popular',
  })
  const popularItems = useMemo(
    () => uniqueByPlace(popular.data?.pages.flatMap((p) => p.items) ?? []),
    [popular.data],
  )
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: view === 'popular',
  })

  // The top of For you — your six, tonight, new near you — in one request, the same all
  // day (lib/homeCache.ts). A failure just leaves it out: the friends' feed is the page.
  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeResponse>('/home'),
    staleTime: (q) => msUntilHomeRefresh(new Date(q.state.dataUpdatedAt)),
    enabled: view === 'for_you',
  })
  const newNearYou = home.data?.newNearYou

  // This week's events, for the "Events this week" shelves — the Events view's own list (one cache
  // entry), without what the Tonight card above already shows. Like the People shelf, only For you
  // has them, and only once there is a feed to put them in.
  const upcoming = useUpcomingEvents({
    staleTime: 120_000,
    enabled: view === 'for_you' && feed.isSuccess && items.length > 0,
  })
  const tonight = home.data?.tonight
  const weekEvents = useMemo(
    () =>
      eventsThisWeek(
        upcoming.data?.events ?? [],
        new Date(),
        new Set(tonight?.kind === 'events' ? tonight.events.map((e) => e.id) : []),
      ),
    [upcoming.data, tonight],
  )

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
      view === 'popular'
        ? popularItems.flatMap((item, i): Row[] => {
            const row: Row = { type: 'popular', key: item.restaurant.id, item, rank: i + 1 }
            const startsTail = item.phase === 'all' && popularItems[i - 1]?.phase !== 'all'
            return startsTail ? [{ type: 'popular_tail', key: 'popular_tail' }, row] : [row]
          })
        : friendsView && seenAt !== undefined
          ? buildFeedRows({
              items,
              people: suggestions.data?.users ?? [],
              events: weekEvents,
              seenAt,
              shelves: view === 'for_you',
              nearYou: view === 'for_you' && (newNearYou?.length ?? 0) > 0,
            })
          : [],
    [friendsView, view, items, popularItems, suggestions.data, weekEvents, seenAt, newNearYou],
  )

  const refetchCurrent = useCallback(
    () =>
      view === 'events'
        ? queryClient.invalidateQueries({ queryKey: ['events'] })
        : view === 'lists'
          ? queryClient.invalidateQueries({ queryKey: ['lists'] })
          : view === 'popular'
            ? popular.refetch()
            : view === 'for_you'
              ? Promise.all([feed.refetch(), home.refetch(), upcoming.refetch()])
              : feed.refetch(),
    [view, queryClient, feed, home, upcoming, popular],
  )
  const { refreshing, onRefresh } = usePullToRefresh(refetchCurrent)

  const listRef = useRef<FlatList<Row>>(null)
  // "See all" on an Events shelf: over to the Events view, from the top of the page so the Events
  // pill is seen to be the one chosen (the shelf sits far down the For you list, and the Events
  // view is a different, shorter one).
  const seeAllEvents = useCallback(() => {
    setView('events')
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [])

  // Stable across renders, so a screen-level re-render (pull-to-refresh, the next page,
  // one cheers tap) doesn't make FlatList treat every mounted cell as changed.
  const renderRow = useCallback(
    ({ item: row, index }: { item: Row; index: number }) => {
      if (row.type === 'card') return <FriendCard item={row.item} index={index} />
      if (row.type === 'shelf') return <PeopleShelf people={row.people} />
      if (row.type === 'events_shelf')
        return <EventsShelf events={row.events} onSeeAll={seeAllEvents} />
      if (row.type === 'new_near_you') return <NewNearYou places={newNearYou ?? []} />
      if (row.type === 'popular') return <PopularRow item={row.item} rank={row.rank} />
      if (row.type === 'popular_tail') return <PopularTail />
      return <CaughtUp />
    },
    [newNearYou, seeAllEvents],
  )

  useResetOnTabPress(
    useCallback(
      (wasActive: boolean) => {
        // Pressing Feed while you are ALREADY on it starts over: back to "Para ti", at the top.
        // (Coming from another tab keeps the view you were on.)
        if (wasActive) setView('for_you')
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
        // A silent refetch, not onRefresh(): flipping RefreshControl's `refreshing` on
        // programmatically shifts the scroll offset down to reveal the spinner and
        // doesn't reliably restore it (usePullToRefresh's own header), which raced the
        // scrollToOffset above. A real pull-to-refresh gesture is untouched.
        const showing = wasActive ? 'for_you' : view
        if (showing === 'popular') {
          void popular.refetch()
          return
        }
        void feed.refetch()
        if (showing === 'for_you') {
          void home.refetch()
          void upcoming.refetch()
        }
      },
      [feed, home, popular, upcoming, view],
    ),
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
              <View className="px-4">
                <FriendsEvents />
              </View>
            ) : view === 'lists' ? (
              <ListCovers />
            ) : view === 'popular' ? (
              <PopularHeader
                hoods={neighborhoods.data?.neighborhoods ?? []}
                hood={hood}
                onHood={setHood}
              />
            ) : (
              <>
                {view === 'for_you' ? (
                  home.isPending ? (
                    <SixSkeleton />
                  ) : home.data ? (
                    <>
                      <YourSix six={home.data.six} />
                      {home.data.tonight?.kind === 'events' ? (
                        <TonightHero events={home.data.tonight.events} />
                      ) : home.data.tonight?.kind === 'pick' ? (
                        <TonightPick pick={home.data.tonight} />
                      ) : null}
                    </>
                  ) : null
                ) : null}
                {items.length > 0 ? (
                  <View className="px-5">
                    <SectionHeader action={<Caption>{t('feed.newest_first')}</Caption>}>
                      {t('feed.from_friends')}
                    </SectionHeader>
                  </View>
                ) : null}
              </>
            )}
          </>
        }
        ListEmptyComponent={
          view === 'popular' ? (
            popular.isPending ? (
              <PopularSkeleton />
            ) : popular.isError ? (
              <ErrorState onRetry={() => popular.refetch()}>{t('discover.load_error')}</ErrorState>
            ) : (
              <EmptyState body={t('popular.empty_body')}>{t('popular.empty_title')}</EmptyState>
            )
          ) : !friendsView ? null : feed.isPending || seenAt === undefined ? (
            <FeedSkeleton />
          ) : feed.isError ? (
            <ErrorState onRetry={() => feed.refetch()}>{t('discover.load_error')}</ErrorState>
          ) : (
            <EmptyFeed />
          )
        }
        ListFooterComponent={
          view === 'popular' ? (
            popular.isFetchingNextPage ? (
              <Body className="py-4 text-center">…</Body>
            ) : null
          ) : !friendsView || items.length === 0 ? null : feed.isFetchingNextPage ? (
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
          if (view === 'popular') {
            if (popular.hasNextPage && !popular.isFetchingNextPage) popular.fetchNextPage()
          } else if (friendsView && feed.hasNextPage && !feed.isFetchingNextPage) {
            feed.fetchNextPage()
          }
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
  const { status, toggle, pending } = useFollow(u.id, false, 'empty_feed')
  return (
    <PersonRow
      user={u}
      last={last}
      subtitle={[t('settings.ranked_count', { n: u.rankedCount ?? 0 }), u.neighborhood]
        .filter(Boolean)
        .join(' · ')}
      right={
        <Button
          variant={status !== 'none' ? 'secondary' : 'primary'}
          size="sm"
          className="min-h-[34px] px-4"
          onPress={toggle}
          disabled={pending}
        >
          {t(followLabelKey(status))}
        </Button>
      }
    />
  )
}

// Where the week's top places give way to the all-time favorites.
function PopularTail() {
  const t = useT()
  return (
    <View className="px-5">
      <SectionHeader>{t('popular.all_time')}</SectionHeader>
    </View>
  )
}

// Popular while it loads: rows of the same shape (rank, picture, two lines, a score).
function PopularSkeleton() {
  return (
    <View className="gap-3 px-5 pt-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton width={24} height={20} />
          <View className="overflow-hidden rounded-[16px]">
            <Skeleton width={54} height={54} />
          </View>
          <View className="flex-1 gap-2">
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  )
}

// "Your six" while it loads: the section title's height and three rows of two tiles, so
// the friend cards don't jump when the real thing arrives.
function SixSkeleton() {
  return (
    <View className="pb-1 pt-[60px]">
      <View className="gap-2 px-4">
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-row gap-2">
            {[0, 1].map((j) => (
              <View key={j} className="flex-1 overflow-hidden rounded">
                <Skeleton height={62} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
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
