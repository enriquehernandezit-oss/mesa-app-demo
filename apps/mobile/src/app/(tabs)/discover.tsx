import { CheersButton } from '@/components/CheersButton'
import { useTabBarClearance } from '@/components/MesaTabBar'
import { PersonRow } from '@/components/PersonRow'
import { pickReportReason } from '@/components/ReportControl'
import { SaveButton } from '@/components/SaveButton'
import { TopBar } from '@/components/TopBar'
import { EventMiniCard, useNow } from '@/components/events/EventTicket'
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
import { PlaceCover } from '@/components/ui/PlaceCover'
import { ChevronIcon, CommentIcon, MoreIcon } from '@/components/ui/icons'
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
import { DATA_FIGURES } from '@/theme/vars'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { type Href, useRouter } from 'expo-router'
import { memo, useCallback } from 'react'
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
  // Stable across renders (perf pass, same reasoning as rankings.tsx's M14
  // comment on renderRankingRow) — a fresh renderItem function every render
  // of this screen made FlatList treat every mounted cell as changed on
  // every pull-to-refresh/fetchNextPage/cheers tap, even with FeedCard now
  // wrapped in memo() above.
  const renderFeedItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => <FeedCard item={item} index={index} />,
    [],
  )

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
          renderItem={renderFeedItem}
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

// The tab-header — eyebrow + title. Used to also carry a search field that
// handed off to Explore's real (native) search bar with `?focus=1`; removed
// at the founder's request — Explore's own search bar (in its nav bar) is
// the one search entry point now. No horizontal padding of its own: the
// parent FlatList's contentContainer already applies px-5, and this used to
// add a SECOND px-5 on top of it — the header sat ~24pt further right than
// "Listas destacadas" and the carousel just below it, with no shared left
// edge on the page.
function FeedHeader() {
  const t = useT()
  return (
    // Tight to the first rail below (SpotRail's header adds its own mt-5):
    // a bottom margin here on top of that left a ~32pt dead band between the
    // title and "Listas destacadas".
    <View className="pt-2 -mb-2">
      <Eyebrow>{t('discover.eyebrow')}</Eyebrow>
      <Title className="mt-1">{t('discover.title')}</Title>
      <Caption className="mt-0.5">{t('discover.subtitle')}</Caption>
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
  const now = useNow()
  if (list.length === 0) return null
  return (
    <View className="mb-2">
      <SpotRail title={t('discover.this_weekend')}>
        {list.map((e) => (
          <EventMiniCard key={e.id} e={e} now={now} />
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

// Only the first screenful rises in, and each post only ever once: FlatList
// re-mounts cells as they scroll back into view and mounts new pages near the
// viewport, which used to replay a delayed fade on screen — cards popping in
// late, blank gaps on a fast scroll.
const animatedPosts = new Set<string>()
function feedEntering(id: string, index: number) {
  if (index >= 6 || animatedPosts.has(id)) return undefined
  animatedPosts.add(id)
  return FadeInDown.duration(280).delay(index * 60)
}

// Each post is a white card on the cream ground (founder's mock, Sept 2026 —
// replacing M9's flat hairline rows): who did it and when, the place with its
// photo and the friend's score, the note, a preview of the latest comment,
// then the action bar (cheers · comments · Quiero probar). A dish post leads
// with its photo instead. The whole card taps through to the place (or the
// dish); the avatar, the comment row and each action keep their own targets —
// nested plain Pressables, where RN gives the innermost one the touch.
//
// Wrapped in memo() (perf pass): paired with the hoisted `renderFeedItem`
// above, so a screen-level re-render (pull-to-refresh, fetchNextPage, a
// single CheersButton tap) doesn't force every mounted card to re-render.
const FeedCard = memo(function FeedCard({ item, index = 0 }: { item: FeedItem; index?: number }) {
  const t = useT()
  const router = useRouter()
  const firstName = (item.user.name || item.user.handle || 'm').split(' ')[0] ?? 'm'
  // Reporting the note (App Store 1.2). Two ways into the same sheet: the
  // "···" in the card header, because 1.2 wants reporting "clearly available"
  // and a long-press nobody can see isn't, and the long-press on the note
  // itself, kept because people already reach for it.
  const reportNote = useMutation({
    mutationFn: ({ reason, noteId }: { reason: string; noteId: string }) =>
      api.post('/moderation/reports', { targetType: 'vibe_note', targetId: noteId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })
  const noteId = item.noteId
  const onReportNote =
    item.note && noteId
      ? async () => {
          const reason = await pickReportReason('vibe_note')
          if (reason) reportNote.mutate({ reason, noteId })
        }
      : undefined
  const meta = [
    priceLabel(item.restaurant.priceTier),
    cuisineLabel(item.restaurant.cuisine),
    item.neighborhood,
  ]
    .filter(Boolean)
    .join(' · ')
  const isDish = Boolean(item.dishImage)
  const href: Href = isDish && item.dishId ? `/dish/${item.dishId}` : `/r/${item.restaurant.id}`
  const openComments = () => router.push(`/comentarios/${item.rankingId}`)
  const commentCount = item.commentCount ?? 0

  return (
    <Animated.View entering={feedEntering(item.rankingId, index)} className="mb-3">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(href)}
        className="rounded-card border border-line bg-surface p-4 active:opacity-90"
      >
        {/* Who + when */}
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push(`/u/${item.user.id}`)}
            className="active:opacity-70"
          >
            <Avatar
              name={item.user.name || item.user.handle || 'm'}
              src={item.user.image}
              size={40}
            />
          </Pressable>
          <View className="flex-1">
            <Text
              numberOfLines={1}
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
              {isDish ? t('discover.posted_dish') : t('discover.ranked_verb')}
            </Text>
            <Caption>{timeAgo(item.rankedAt)}</Caption>
          </View>
          {/* The house per-row menu ("···", as on a ranking card). A nested
              plain Pressable, so RN hands it the touch instead of the card's
              tap-through to the place. Only on posts that carry a note: a dish
              post's photo and caption are reportable on the dish page the card
              opens, and its author from their passport — the note was the one
              piece of UGC here with no visible path. */}
          {onReportNote ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('report.note_a11y')}
              onPress={onReportNote}
              hitSlop={8}
              className="-mr-1 h-11 w-8 items-center justify-center active:opacity-60"
            >
              <MoreIcon size={18} color="text-faint" />
            </Pressable>
          ) : null}
        </View>

        {isDish ? (
          <View className="mt-3 h-56 overflow-hidden rounded-sm bg-bg-sunk">
            <Image
              source={{ uri: cloudinaryUrl(item.dishImage, { w: 900, h: 700 }) ?? undefined }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={120}
            />
          </View>
        ) : null}

        {/* The place — photo, name, one line of meta, the friend's score */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/r/${item.restaurant.id}`)}
          className="mt-3 flex-row items-center gap-3 active:opacity-70"
        >
          <PlaceCover
            seed={item.restaurant.id}
            name={item.restaurant.name}
            coverImageId={item.restaurant.coverImageId}
            size={{ w: 160, h: 160 }}
            className="h-14 w-14 rounded-sm"
          />
          <View className="flex-1">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-subhead text-text"
            >
              {isDish && item.dishName
                ? `${item.dishName} · ${item.restaurant.name}`
                : item.restaurant.name}
            </Text>
            {meta ? (
              <Caption className="mt-[2px]" numberOfLines={1}>
                {meta}
              </Caption>
            ) : null}
          </View>
          {isDish ? (
            <ChevronIcon size={14} color="text-muted" />
          ) : (
            <ScoreBadge size="sm" score={item.score} attribution={{ kind: 'stated' }} />
          )}
        </Pressable>

        {item.note ? (
          <Text
            selectable
            numberOfLines={3}
            onLongPress={onReportNote}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-3 font-serif-italic text-serif-md text-text-2"
          >
            “{item.note}”
          </Text>
        ) : null}

        {/* Latest comment + "Ver los N comentarios" */}
        {item.lastComment ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('comments.open')}
            onPress={openComments}
            className="mt-3 active:opacity-70"
          >
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui text-label text-text-2"
            >
              <Text className="font-ui-semibold text-text">
                {(item.lastComment.user.name || item.lastComment.user.handle || '').split(' ')[0]}
              </Text>{' '}
              {item.lastComment.body}
            </Text>
            {commentCount > 1 ? (
              <Caption className="mt-1">{t('comments.view_all', { n: commentCount })}</Caption>
            ) : null}
          </Pressable>
        ) : null}

        {/* Action bar */}
        <View className="mt-3 flex-row items-center gap-4">
          <CheersButton
            rankingId={item.rankingId}
            count={item.cheersCount ?? 0}
            cheered={item.cheeredByMe ?? false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('comments.open')}
            onPress={openComments}
            hitSlop={{ top: 12, bottom: 12 }}
            className="min-w-[44px] flex-row items-center gap-1.5 active:opacity-70"
          >
            <CommentIcon size={20} color="text-muted" />
            {commentCount > 0 ? (
              <Text
                style={DATA_FIGURES}
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui-medium text-label text-text-muted"
              >
                {commentCount}
              </Text>
            ) : null}
          </Pressable>
          <View className="flex-1" />
          {isDish && item.dishId ? (
            <SaveButton
              target={{ kind: 'dish', id: item.dishId }}
              initial={item.dishSaved ?? false}
              name={item.dishName || item.restaurant.name}
              text={t('feed.want_to_try')}
            />
          ) : (
            <SaveButton
              target={{ kind: 'restaurant', id: item.restaurant.id }}
              initial={item.restaurantSaved ?? false}
              name={item.restaurant.name}
              text={t('feed.want_to_try')}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  )
})
