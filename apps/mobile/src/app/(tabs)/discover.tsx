import { CheersButton } from '@/components/CheersButton'
import { RANK_FAB_CLEARANCE } from '@/components/RankFab'
import { TopBar } from '@/components/TopBar'
import {
  Body,
  Button,
  Caption,
  ErrorState,
  Eyebrow,
  SerifItalic,
  Skeleton,
  Title,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Characteristics, ScoreBadge, SpotCard, SpotRail } from '@/components/ui/patterns'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { cuisineLabel, priceLabel } from '@/lib/display'
import { cloudinaryUrl } from '@/lib/media'
import { timeAgo } from '@/lib/time'
import type { FeaturedList, FeedItem, SuggestedUser } from '@/lib/types'
import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { type Href, Link, useRouter } from 'expo-router'
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
  const accent = useColor('accent')
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

  return (
    <View className="flex-1 bg-bg">
      <TopBar variant="discover" />
      {feed.isPending ? (
        <ScrollView contentContainerClassName="pb-8">
          <FeedHeader />
          <FeedSkeleton />
        </ScrollView>
      ) : feed.isError ? (
        <ScrollView contentContainerClassName="pb-8">
          <FeedHeader />
          <ErrorState onRetry={() => feed.refetch()}>No se pudo cargar el feed.</ErrorState>
        </ScrollView>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerClassName="pb-8"
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching}
              onRefresh={() => feed.refetch()}
              tintColor={accent}
            />
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
            </>
          }
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: RANK_FAB_CLEARANCE }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching}
              onRefresh={() => feed.refetch()}
              tintColor={accent}
            />
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

// The tab-header — eyebrow + title + a search field that links to Explore.
// No horizontal padding of its own: the parent FlatList's contentContainer
// already applies px-5, and this used to add a SECOND px-5 on top of it —
// the header sat ~24pt further right than "Listas destacadas" and the
// carousel just below it, with no shared left edge on the page.
function FeedHeader() {
  const router = useRouter()
  return (
    <View className="pt-2 pb-1">
      <Eyebrow>Descubre</Eyebrow>
      <Title className="mb-3">Donde comen tus amigos</Title>
      <Pressable
        accessibilityRole="search"
        onPress={() => router.push('/explore')}
        className="min-h-[44px] justify-center rounded border border-line bg-surface px-4 active:opacity-80"
      >
        <Text className="font-ui text-body text-text-muted">Busca un spot, plato o miembro…</Text>
      </Pressable>
    </View>
  )
}

// Empty feed — the invite card + a few people to follow so the feed fills.
function EmptyFeed() {
  const queryClient = useQueryClient()
  const suggested = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })
  const follow = useMutation({
    mutationFn: (userId: string) => api.post('/social/follow', { userId }),
    onSuccess: () => {
      track('follow_added', { from: 'empty_feed' })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
  const users = suggested.data?.users ?? []
  return (
    <View className="px-5">
      <View className="items-center gap-2 rounded border border-line bg-surface p-6">
        <SerifItalic className="text-title">Tu mesa está lista</SerifItalic>
        <Body className="text-center">
          Sigue a algunos amigos — sus rankings y notas de vibe llenan este feed.
        </Body>
      </View>
      {users.length > 0 && <Eyebrow className="mb-3 mt-5">Empieza con estos</Eyebrow>}
      {users.map((u) => (
        <View key={u.id} className="flex-row items-center gap-3 border-line border-b py-3">
          <Link href={`/u/${u.id}`} asChild>
            <Pressable className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80">
              <Avatar name={u.name || u.handle || 'm'} src={u.image} size={40} />
              <View className="min-w-0 flex-1">
                <Text className="font-ui-medium text-body text-text" numberOfLines={1}>
                  {u.name || u.handle}
                </Text>
                <Caption numberOfLines={1}>
                  {[`${u.rankedCount ?? 0} rankeados`, u.neighborhood].filter(Boolean).join(' · ')}
                </Caption>
              </View>
            </Pressable>
          </Link>
          <Button
            variant="secondary"
            className="w-auto min-h-[40px] px-4"
            onPress={() => follow.mutate(u.id)}
            disabled={follow.isPending}
          >
            Seguir
          </Button>
        </View>
      ))}
    </View>
  )
}

// Featured editorial lists — a carousel of light paper cards (mock A3).
function ListsRail() {
  const q = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get<{ lists: FeaturedList[] }>('/lists'),
    staleTime: 120_000,
  })
  const lists = q.data?.lists ?? []
  if (lists.length === 0) return null
  return (
    <View className="mb-2">
      <SpotRail title="Listas destacadas">
        {lists.map((l) => (
          <SpotCard
            key={l.slug}
            variant="wide"
            href={`/lists/${l.slug}`}
            seed={l.slug}
            name={l.title}
            coverImageId={l.coverImageId}
            caption={
              <Caption className="font-mono text-micro" numberOfLines={1}>
                {l.mine} de {l.total} rankeados
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
    <View className="px-5">
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
      {[0, 1, 2].map((i) => (
        <View key={i} className="mb-3 rounded border border-line bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <Skeleton height={28} width={28} />
            <View className="flex-1">
              <Skeleton height={12} width={130} />
              <Skeleton height={9} width={44} className="mt-1" />
            </View>
            <Skeleton height={46} width={46} />
          </View>
          <Skeleton height={18} width="55%" className="mt-3" />
          <Skeleton height={11} width="80%" className="mt-2" />
        </View>
      ))}
    </View>
  )
}

// Phase 6: two card types on paper. A dish post carries a photo; a ranking is a
// compact card with the characteristics block and an inline badged score circle
// (attributed to the friend — never the place's own rating). The film-grain
// treatment on dish photos lands with the image work in N6.
function FeedCard({ item, index = 0 }: { item: FeedItem; index?: number }) {
  const router = useRouter()
  const firstName = (item.user.name || item.user.handle || 'm').split(' ')[0] ?? 'm'
  const chars = (
    <Characteristics
      priceTier={item.restaurant.priceTier}
      cuisine={item.restaurant.cuisine}
      neighborhood={item.neighborhood}
      hours={item.restaurant.closesAt ? `hasta ${item.restaurant.closesAt}` : null}
    />
  )
  // One line, for the plain (no-photo) card below — price|cuisine and
  // neighborhood/hours collapsed into a single row instead of Characteristics'
  // usual two, and truncated rather than ever wrapping to a third.
  const priceCuisine = [
    priceLabel(item.restaurant.priceTier),
    cuisineLabel(item.restaurant.cuisine),
  ]
    .filter(Boolean)
    .join(' | ')
  const place = [
    item.neighborhood,
    item.restaurant.closesAt ? `hasta ${item.restaurant.closesAt}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const oneLineMeta = [priceCuisine, place].filter(Boolean).join(' · ')

  const who = (verb: string, avatarSize: number) => (
    <Link href={`/u/${item.user.id}`} asChild>
      <Pressable className="flex-row items-center gap-2 active:opacity-80">
        <Avatar
          name={item.user.name || item.user.handle || 'm'}
          src={item.user.image}
          size={avatarSize}
        />
        <View>
          <Text className="font-ui text-body text-text">
            <Text className="font-ui-semibold">{firstName}</Text> {verb}
          </Text>
          <Caption className="font-mono text-micro">{timeAgo(item.rankedAt)}</Caption>
        </View>
      </Pressable>
    </Link>
  )

  if (item.dishImage) {
    const href: Href = item.dishId ? `/dish/${item.dishId}` : `/r/${item.restaurant.id}`
    return (
      <Animated.View
        entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 60)}
        className="mb-3 overflow-hidden rounded border border-line bg-surface"
      >
        <Link href={href} asChild>
          <Pressable className="active:opacity-90">
            <View className="h-44">
              <Image
                source={{ uri: cloudinaryUrl(item.dishImage, { w: 800, h: 600 }) ?? undefined }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
              <View
                className="absolute right-3 rounded-pill bg-surface px-2 py-1"
                style={{ bottom: 10 }}
              >
                <Caption className="font-mono text-micro">film</Caption>
              </View>
            </View>
          </Pressable>
        </Link>
        <View className="p-4">
          {who('publicó un plato', 24)}
          <Text className="mt-2 font-serif text-serif-md text-text">
            {item.dishName || item.restaurant.name}
          </Text>
          {chars}
          <Caption className="mt-1 font-mono text-micro">#{item.position} en su lista</Caption>
          <CheersButton
            rankingId={item.rankingId}
            count={item.cheersCount ?? 0}
            cheered={item.cheeredByMe ?? false}
          />
        </View>
      </Animated.View>
    )
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 60)}
      className="mb-3 rounded border border-line bg-surface p-3"
    >
      <View className="flex-row items-center">
        {/* Avatar is its own small tap target; the person's name and the
            restaurant name are separate onPress spans inside ONE Text — RN's
            supported way to linkify part of a sentence. No Pressable nested
            inside another Pressable (that's a gesture-conflict bug — the
            outer one wins and the inner tap target silently stops working). */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/u/${item.user.id}`)}
          className="active:opacity-70"
        >
          <Avatar
            name={item.user.name || item.user.handle || 'm'}
            src={item.user.image}
            size={28}
          />
        </Pressable>
        <View className="ml-2 flex-1">
          {/* The restaurant name rides in the sentence itself, not its own
              heading line — an activity-feed line, not a headline plus a
              caption plus a caption. Saved the single biggest chunk of this
              card's old height. */}
          <Text className="font-ui text-body text-text">
            <Text
              className="font-ui-semibold"
              onPress={() => router.push(`/u/${item.user.id}`)}
              suppressHighlighting
            >
              {firstName}
            </Text>{' '}
            rankeó{' '}
            <Text
              className="font-serif text-serif-sm text-text"
              onPress={() => router.push(`/r/${item.restaurant.id}`)}
              suppressHighlighting
            >
              {item.restaurant.name}
            </Text>
          </Text>
          <Caption className="font-mono text-micro">{timeAgo(item.rankedAt)}</Caption>
        </View>
      </View>
      {oneLineMeta ? (
        <Caption className="mt-1 text-text-2" numberOfLines={1}>
          {oneLineMeta}
        </Caption>
      ) : null}
      {item.note ? (
        <Text
          selectable
          numberOfLines={2}
          className="mt-1 font-serif-italic text-serif-sm text-text-2"
        >
          “{item.note}”
        </Text>
      ) : null}
      {/* Footer: cheers on the left (its own established position across the
          app), the score badge in the bottom-right corner — the card's final
          tally, read last. Dropped the "#N" that used to ride beside it: bare
          digits plus a small #1 is exactly what reads as a page number
          instead of a rating; the badge alone is the point. */}
      <View className="mt-1 flex-row items-center justify-between">
        <CheersButton
          rankingId={item.rankingId}
          count={item.cheersCount ?? 0}
          cheered={item.cheeredByMe ?? false}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/r/${item.restaurant.id}`)}
          className="active:opacity-70"
        >
          <ScoreBadge size="sm" score={item.score} attribution={{ kind: 'stated' }} />
        </Pressable>
      </View>
    </Animated.View>
  )
}
