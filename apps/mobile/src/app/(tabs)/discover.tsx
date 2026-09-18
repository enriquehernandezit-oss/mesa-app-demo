import { CheersButton } from '@/components/CheersButton'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { PersonRow } from '@/components/PersonRow'
import { pickReportReason } from '@/components/ReportControl'
import { SaveButton } from '@/components/SaveButton'
import { TopBar } from '@/components/TopBar'
import {
  Body,
  Button,
  Caption,
  ErrorState,
  Eyebrow,
  MAX_SCALE,
  SerifItalic,
  Skeleton,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ScoreBadge, SpotCard, SpotRail } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { useFollow } from '@/hooks/useFollow'
import { api } from '@/lib/api'
import { cuisineLabel, listAuthorLabel, priceLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { cloudinaryUrl } from '@/lib/media'
import { timeAgo } from '@/lib/time'
import type { EventSummary, FeaturedList, FeedItem, SuggestedUser } from '@/lib/types'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { type Href, useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

// The discovery feed (Phase 6 mocks A1–A3): a featured-lists carousel, then the
// feed column. Ranking cards are compact paper cards; dish posts carry a photo.
// Ported from apps/app/src/screens/tabs/DiscoverTab.tsx. The QuickActions rail
// (Reserve/Pedir inert, Cerca → map) is dropped from the native launch: all
// three are cut or map-gated (N7). Pull-to-refresh + infinite scroll use a
// FlatList (RefreshControl + onEndReached) in place of the web IntersectionObserver.

interface FeedPage {
  feed: FeedItem[]
  nextCursor: string | null
}

function uniqueByRankingId(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.rankingId) ? false : seen.add(i.rankingId)))
}

export default function DiscoverTab() {
  const t = useT()
  const accent = useColor('accent')
  const tabBarClearance = useTabBarClearance()
  const indicator = useResolvedTheme() === 'candlelit' ? ('white' as const) : ('black' as const)
  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      api.get<FeedPage>(`/feed${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  // Defensive: with a sound (createdAt, id) cursor server-side this shouldn't
  // duplicate across pages, but a ranking never appears twice in one person's
  // feed anyway (one row per ranking) — deduping by id is a cheap guarantee
  // either way, not a workaround for a specific known gap.
  const items = uniqueByRankingId(feed.data?.pages.flatMap((p) => p.feed) ?? [])
  const { refreshing, onRefresh } = usePullToRefresh(feed.refetch)

  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="discover" />
      {feed.isPending ? (
        <ScrollView
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
        >
          <FeedHeader />
          <FeedSkeleton />
        </ScrollView>
      ) : feed.isError ? (
        <ScrollView
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
          }
        >
          <FeedHeader />
          <ErrorState onRetry={() => feed.refetch()}>{t('discover.load_error')}</ErrorState>
        </ScrollView>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
          }
        >
          <FeedHeader />
          <EmptyFeed />
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.rankingId}
          renderItem={({ item, index }) => <FeedCard item={item} index={index} />}
          ListHeaderComponent={
            <>
              <FeedHeader />
              <ListsRail />
              <EventsRail />
            </>
          }
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
          }
          // Without this a 2-item feed can't be pulled — there's nothing to
          // overscroll — so a new member has no way to refresh.
          alwaysBounceVertical
          indicatorStyle={indicator}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage()
          }}
          ListFooterComponent={
            feed.isFetchingNextPage ? <Body className="py-4 text-center">…</Body> : null
          }
        />
      )}
    </View>
  )
}

// The tab-header — eyebrow + title + a search field that hands off to
// Explore's real (native) search bar. Search itself doesn't live here — this
// is just the entry point — but `?focus=1` tells Explore to open with its
// search bar already focused and the keyboard up, so tapping this reads as
// "go search" rather than a dead-end redirect to Explore's plain browse view.
// No horizontal padding of its own: the parent FlatList's contentContainer
// already applies px-5, and this used to add a SECOND px-5 on top of it —
// the header sat ~24pt further right than "Listas destacadas" and the
// carousel just below it, with no shared left edge on the page.
function FeedHeader() {
  const t = useT()
  const router = useRouter()
  return (
    <View className="pt-2 pb-1">
      <Eyebrow>{t('discover.eyebrow')}</Eyebrow>
      <Title className="mt-1 mb-3">{t('discover.title')}</Title>
      <Pressable
        accessibilityRole="search"
        onPress={() => router.push('/explore?focus=1')}
        className="min-h-[44px] justify-center rounded border border-line bg-surface px-4 active:opacity-80"
      >
        <Text className="font-ui text-body text-text-muted">
          {t('discover.search_placeholder')}
        </Text>
      </Pressable>
    </View>
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
    <View>
      <View className="items-center gap-2 rounded border border-line bg-surface p-6">
        <SerifItalic className="text-title">{t('discover.empty_title')}</SerifItalic>
        <Body className="text-center">{t('discover.empty_body')}</Body>
      </View>
      {users.length > 0 && (
        <Eyebrow className="mb-3 mt-5">{t('discover.start_with_these')}</Eyebrow>
      )}
      {users.map((u) => (
        <SuggestedRow key={u.id} user={u} />
      ))}
    </View>
  )
}

function SuggestedRow({ user: u }: { user: SuggestedUser }) {
  const t = useT()
  const { following, toggle, pending } = useFollow(u.id, false, 'empty_feed')
  return (
    <PersonRow
      user={u}
      subtitle={[t('settings.ranked_count', { n: u.rankedCount ?? 0 }), u.neighborhood]
        .filter(Boolean)
        .join(' · ')}
      right={
        <Button
          variant="secondary"
          className="w-auto min-h-[40px] px-4"
          onPress={toggle}
          disabled={pending}
        >
          {following ? t('activity.following_pill') : t('activity.follow_pill')}
        </Button>
      }
    />
  )
}

// Featured editorial lists — a carousel of light paper cards (mock A3).
function ListsRail() {
  const t = useT()
  const q = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get<{ lists: FeaturedList[] }>('/lists'),
    staleTime: 120_000,
  })
  const lists = q.data?.lists ?? []
  if (lists.length === 0) return null
  return (
    <View className="mb-2">
      <SpotRail title={t('discover.featured_lists')}>
        {lists.map((l) => (
          <SpotCard
            key={l.slug}
            variant="wide"
            href={`/lists/${l.slug}`}
            seed={l.slug}
            name={l.title}
            coverImageId={l.coverImageId}
            caption={
              <View className="gap-0.5">
                <Caption className="text-micro" numberOfLines={1}>
                  {t('discover.list_progress', { mine: l.mine, total: l.total })}
                </Caption>
                <Caption className="text-micro text-text-faint" numberOfLines={1}>
                  {listAuthorLabel(l)}
                </Caption>
              </View>
            }
          />
        ))}
      </SpotRail>
    </View>
  )
}

// "Este finde" (M21) — same SpotRail/wide-SpotCard idiom as ListsRail right
// above, one row down. Always the weekend window, never tonight/upcoming —
// the feed is a single glance, not a place to pick a date range; Explore's
// Eventos tab is where that lives. Hidden entirely when nothing's on this
// weekend, same "just disappear" gate as ListsRail.
function EventsRail() {
  const t = useT()
  const q = useQuery({
    queryKey: ['events', 'weekend'],
    queryFn: () => api.get<{ events: EventSummary[] }>('/events?when=weekend'),
    staleTime: 120_000,
  })
  const list = q.data?.events ?? []
  if (list.length === 0) return null
  return (
    <View className="mb-2">
      <SpotRail title={t('discover.this_weekend')}>
        {list.map((e) => (
          <SpotCard
            key={e.id}
            variant="wide"
            href={`/eventos/${e.id}`}
            seed={e.id}
            name={e.title}
            coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
            caption={
              <Caption className="text-micro" numberOfLines={1}>
                {e.restaurant.name}
              </Caption>
            }
          />
        ))}
      </SpotRail>
    </View>
  )
}

// The skeleton holds the SAME shapes as the loaded feed so nothing reflows when
// data arrives (mock A1).
function FeedSkeleton() {
  return (
    <View>
      <Skeleton height={12} width={110} className="mb-3 mt-5" />
      <View className="mb-4 flex-row gap-3">
        {[0, 1, 2].map((i) => (
          <View key={i} className="w-40">
            <Skeleton height={96} />
            <Skeleton height={13} width="80%" className="mt-2" />
            <Skeleton height={10} width="55%" className="mt-1" />
          </View>
        ))}
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="flex-row items-start gap-3">
          <Skeleton height={36} width={36} className="mt-3" />
          <View className="flex-1 border-line border-b py-3">
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <Skeleton height={15} width="80%" />
                <Skeleton height={13} width="55%" className="mt-1" />
              </View>
              <Skeleton height={30} width={40} />
            </View>
            <Skeleton height={18} width="90%" className="mt-2" />
            <Skeleton height={20} width={20} className="mt-2" />
          </View>
        </View>
      ))}
    </View>
  )
}

// Phase 6 (M9 flat-row pass): two flat, borderless row types instead of boxed
// cards — a dish post carries a photo; a ranking is a dense sentence-plus-note
// row with an inline badged score circle (attributed to the friend — never the
// place's own rating). A hairline (`border-line border-b`) inset to the text
// column is the only separator, matching Threads/X/Beli-style density.
function FeedCard({ item, index = 0 }: { item: FeedItem; index?: number }) {
  const t = useT()
  const router = useRouter()
  const firstName = (item.user.name || item.user.handle || 'm').split(' ')[0] ?? 'm'
  // Long-press on the note itself reports it (App Store 1.2) — the row is one
  // big tap target to the restaurant, so this rides a different gesture rather
  // than adding a permanent "Reportar" line to every row in the feed.
  const reportNote = useMutation({
    mutationFn: ({ reason, noteId }: { reason: string; noteId: string }) =>
      api.post('/moderation/reports', { targetType: 'vibe_note', targetId: noteId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })
  const noteId = item.noteId
  const onLongPressNote =
    item.note && noteId
      ? async () => {
          const reason = await pickReportReason('vibe_note')
          if (reason) reportNote.mutate({ reason, noteId })
        }
      : undefined
  // One line — price|cuisine and neighborhood collapsed into a single row,
  // truncated rather than ever wrapping to a second.
  const priceCuisine = [
    priceLabel(item.restaurant.priceTier),
    cuisineLabel(item.restaurant.cuisine),
  ]
    .filter(Boolean)
    .join(' | ')
  const oneLineMeta = [priceCuisine, item.neighborhood].filter(Boolean).join(' · ')

  if (item.dishImage) {
    const href: Href = item.dishId ? `/dish/${item.dishId}` : `/r/${item.restaurant.id}`
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(href)}
        className="active:opacity-90"
      >
        <Animated.View
          entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 60)}
          className="flex-row items-start gap-3"
        >
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push(`/u/${item.user.id}`)}
            className="mt-3 active:opacity-70"
          >
            <Avatar
              name={item.user.name || item.user.handle || 'm'}
              src={item.user.image}
              size={36}
            />
          </Pressable>
          <View className="flex-1 border-line border-b py-3">
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui text-subhead text-text"
            >
              <Text
                className="font-ui-semibold"
                onPress={() => router.push(`/u/${item.user.id}`)}
                suppressHighlighting
              >
                {firstName}
              </Text>{' '}
              {t('discover.posted_dish')}
              {/* A non-breaking space glues "·" to the time so a wrap moves
                  "· 3w" together instead of stranding "3w" alone on its own
                  line. */}
              <Text className="text-text-muted">
                {' · '}
                {timeAgo(item.rankedAt)}
              </Text>
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/r/${item.restaurant.id}`)}
              className="active:opacity-70"
            >
              <Caption className="mt-[2px]" numberOfLines={1}>
                <Text className="font-ui-semibold text-text">
                  {item.dishName || item.restaurant.name}
                </Text>
                {' · '}
                {item.restaurant.name}
              </Caption>
            </Pressable>
            <View className="mt-2 h-44 overflow-hidden rounded-sm bg-bg-sunk">
              <Image
                source={{ uri: cloudinaryUrl(item.dishImage, { w: 800, h: 600 }) ?? undefined }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            </View>
            <View className="mt-2 flex-row items-center gap-1">
              <CheersButton
                rankingId={item.rankingId}
                count={item.cheersCount ?? 0}
                cheered={item.cheeredByMe ?? false}
              />
              {item.dishId ? (
                <SaveButton
                  target={{ kind: 'dish', id: item.dishId }}
                  initial={item.dishSaved ?? false}
                  name={item.dishName || item.restaurant.name}
                />
              ) : null}
            </View>
          </View>
        </Animated.View>
      </Pressable>
    )
  }

  return (
    // The whole row is one tap target to the restaurant — it used to be
    // tappable only at the avatar, the two name spans, and the score, which
    // looked tappable everywhere and mostly wasn't (a self-inflicted D4 fix:
    // this traded a nested-<Link>-in-<Link> gesture bug for an under-tappable
    // card; a plain Pressable nested inside a plain Pressable, as used here,
    // doesn't have that problem — only <Link>'s own gesture machinery did).
    // The avatar keeps its OWN destination (the person, not the place) as the
    // one nested exception; CheersButton keeps working the same way it always
    // has, as the second nested exception.
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/r/${item.restaurant.id}`)}
      className="active:opacity-90"
    >
      <Animated.View
        entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 60)}
        className="flex-row items-start gap-3"
      >
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push(`/u/${item.user.id}`)}
          className="mt-3 active:opacity-70"
        >
          <Avatar
            name={item.user.name || item.user.handle || 'm'}
            src={item.user.image}
            size={36}
          />
        </Pressable>
        <View className="flex-1 border-line border-b py-3">
          <View className="flex-row items-start gap-3">
            <View className="flex-1">
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui text-subhead text-text"
              >
                <Text
                  className="font-ui-semibold"
                  onPress={() => router.push(`/u/${item.user.id}`)}
                  suppressHighlighting
                >
                  {firstName}
                </Text>{' '}
                {t('discover.ranked_verb')}{' '}
                <Text className="font-ui-semibold">{item.restaurant.name}</Text>
                {/* Non-breaking space between "·" and the time so a wrap
                    moves "· 3w" together rather than stranding "3w" alone. */}
                <Text className="text-text-muted">
                  {' · '}
                  {timeAgo(item.rankedAt)}
                </Text>
              </Text>
              {oneLineMeta ? (
                <Caption className="mt-[2px]" numberOfLines={1}>
                  {oneLineMeta}
                </Caption>
              ) : null}
            </View>
            <ScoreBadge size="sm" score={item.score} attribution={{ kind: 'stated' }} />
          </View>
          {item.note ? (
            <Text
              selectable
              numberOfLines={2}
              onLongPress={onLongPressNote}
              className="mt-1 font-serif-italic text-serif-sm text-text-2"
            >
              “{item.note}”
            </Text>
          ) : null}
          <View className="mt-2 flex-row items-center gap-1">
            <CheersButton
              rankingId={item.rankingId}
              count={item.cheersCount ?? 0}
              cheered={item.cheeredByMe ?? false}
            />
            <SaveButton
              target={{ kind: 'restaurant', id: item.restaurant.id }}
              initial={item.restaurantSaved ?? false}
              name={item.restaurant.name}
            />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  )
}
