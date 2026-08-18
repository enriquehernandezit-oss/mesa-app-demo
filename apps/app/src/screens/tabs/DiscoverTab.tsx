import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { PullToRefresh } from '../../components/PullToRefresh'
import { QuickActions } from '../../components/QuickActions'
import {
  Body,
  Button,
  ErrorState,
  Eyebrow,
  SectionHeader,
  SerifItalic,
  Skeleton,
  Title,
} from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { filterForGrain } from '../../lib/image'
import { cloudinaryUrl } from '../../lib/media'
import { timeAgo } from '../../lib/time'
import type { FeaturedList, FeedItem, SuggestedUser } from '../../lib/types'
import { CheersButton } from './CheersButton'
import './tabs.css'
import './feed.css'
import '../map/map.css'

// The discovery feed (Phase 6 mocks A1–A3): a quick-action rail, a featured-lists
// carousel, then the feed column. Ranking cards are compact paper cards; dish
// posts carry a warm-veiled photo. Reserve/Order are inert-by-design; Nearby → map.

interface FeedPage {
  feed: FeedItem[]
  nextCursor: string | null
}

export function DiscoverTab() {
  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      api.get<FeedPage>(`/feed${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  // Load older pages when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) {
        feed.fetchNextPage()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage])

  const items = feed.data?.pages.flatMap((p) => p.feed) ?? []

  return (
    <PullToRefresh onRefresh={() => feed.refetch()}>
      <div className="tab-header">
        <Eyebrow>Discover</Eyebrow>
        <Title>Where your friends eat</Title>
        <Link to="/explore" className="search-field search-field--link">
          Search a place, dish, or member…
        </Link>
      </div>
      <QuickActions />

      {feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <ErrorState>Couldn't load the feed. Try again in a moment.</ErrorState>
      ) : items.length > 0 ? (
        <>
          <ListsRail />
          <div className="feed">
            {items.map((item, i) => (
              <FeedCard key={item.rankingId} item={item} index={i} />
            ))}
          </div>
          <div ref={sentinel} style={{ height: 1 }} />
          {feed.isFetchingNextPage && (
            <Body style={{ textAlign: 'center', padding: 'var(--space-4)' }}>…</Body>
          )}
        </>
      ) : (
        <EmptyFeed />
      )}
    </PullToRefresh>
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
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
  const users = suggested.data?.users ?? []
  return (
    <div>
      <div className="empty-feed__card">
        <SerifItalic style={{ fontSize: '1.6rem' }}>Your table is set</SerifItalic>
        <Body>Follow a few friends — their rankings and vibe notes fill this feed.</Body>
      </div>
      {users.length > 0 && (
        <Eyebrow style={{ margin: 'var(--space-5) 0 var(--space-3)' }}>Start with these</Eyebrow>
      )}
      {users.map((u) => (
        <div key={u.id} className="empty-feed__row">
          <Link to="/u/$userId" params={{ userId: u.id }} className="empty-feed__who">
            <Avatar name={u.name || u.handle || 'm'} src={u.image} size={40} />
            <div style={{ minWidth: 0 }}>
              <div className="feed-who__name">{u.name || u.handle}</div>
              <div className="feed-who__meta">
                {[`${u.rankedCount ?? 0} ranked`, u.neighborhood].filter(Boolean).join(' · ')}
              </div>
            </div>
          </Link>
          <Button
            variant="secondary"
            style={{ width: 'auto', minHeight: 40, padding: '0 var(--space-4)' }}
            onClick={() => follow.mutate(u.id)}
            disabled={follow.isPending}
          >
            Follow
          </Button>
        </div>
      ))}
    </div>
  )
}

// Featured editorial lists — a carousel of light paper cards (mock A3): a warm-
// veiled photo on top, then the title + your progress in mono, on paper below.
function ListsRail() {
  const q = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get<{ lists: FeaturedList[] }>('/lists'),
    staleTime: 120_000,
  })
  const lists = q.data?.lists ?? []
  if (lists.length === 0) return null
  return (
    <section className="rail">
      <SectionHeader>Featured lists</SectionHeader>
      <div className="rail__scroll">
        {lists.map((l) => {
          const cover = cloudinaryUrl(l.coverImageId, { w: 320, h: 300 })
          return (
            <Link key={l.slug} to="/lists/$slug" params={{ slug: l.slug }} className="list-card">
              <div
                className="ph list-card__photo"
                style={cover ? { backgroundImage: `url(${cover})` } : undefined}
              />
              <div className="list-card__title">{l.title}</div>
              <div className="list-card__progress">
                {l.mine} of {l.total} ranked
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// The skeleton holds the SAME shapes as the loaded feed — the lists carousel and
// the ranking-card geometry — so nothing reflows when data arrives (mock A1).
function FeedSkeleton() {
  return (
    <div>
      <section className="rail">
        <Skeleton height={12} width={110} style={{ margin: 'var(--space-5) 0 var(--space-3)' }} />
        <div className="rail__scroll">
          {[0, 1, 2].map((i) => (
            <div key={i} className="list-card">
              <Skeleton height={104} width="100%" style={{ borderRadius: 'var(--radius-sm)' }} />
              <Skeleton height={13} width="80%" style={{ marginTop: 8 }} />
              <Skeleton height={10} width="55%" style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
      </section>
      <div className="feed">
        {[0, 1, 2].map((i) => (
          <div key={i} className="feed-card feed-card--rank">
            <div className="feed-rank-head">
              <div className="feed-who feed-who--tight">
                <Skeleton height={28} width={28} style={{ borderRadius: '50%' }} />
                <div className="feed-who__stack" style={{ flex: 1 }}>
                  <Skeleton height={12} width={130} />
                  <Skeleton height={9} width={44} style={{ marginTop: 5 }} />
                </div>
              </div>
              <Skeleton height={46} width={46} style={{ borderRadius: '50%' }} />
            </div>
            <Skeleton height={18} width="55%" style={{ marginTop: 10 }} />
            <Skeleton height={11} width="80%" style={{ marginTop: 8 }} />
            <Skeleton height={11} width="60%" style={{ marginTop: 5 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function FeedFooter({ item }: { item: FeedItem }) {
  return (
    <div className="feed-footer">
      <CheersButton
        rankingId={item.rankingId}
        count={item.cheersCount ?? 0}
        cheered={item.cheeredByMe ?? false}
      />
    </div>
  )
}

// Phase 6: two card types on paper. A dish post carries a warm-veiled photo; a
// ranking is a compact card with the characteristics block and an inline badged
// score circle (attributed to the friend — never the place's own rating).
function FeedCard({ item, index }: { item: FeedItem; index: number }) {
  const style = { animationDelay: `${Math.min(index, 5) * 60}ms` }
  const firstName = (item.user.name || item.user.handle || 'm').split(' ')[0] ?? 'm'
  const chars = (
    <Characteristics
      priceTier={item.restaurant.priceTier}
      cuisine={item.restaurant.cuisine}
      neighborhood={item.neighborhood}
      hours={item.restaurant.closesAt ? `till ${item.restaurant.closesAt}` : null}
    />
  )

  // Who-ranked/posted header: avatar + a stacked (name-line / mono timestamp).
  const who = (verb: string, avatarSize: number) => (
    <Link to="/u/$userId" params={{ userId: item.user.id }} className="feed-who feed-who--tight">
      <Avatar
        name={item.user.name || item.user.handle || 'm'}
        src={item.user.image}
        size={avatarSize}
      />
      <div className="feed-who__stack">
        <div className="feed-who__name">
          <strong>{firstName}</strong> {verb}
        </div>
        <span className="feed-time">{timeAgo(item.rankedAt)}</span>
      </div>
    </Link>
  )

  if (item.dishImage) {
    // The photo opens the dish's detail (C3) when we have its id, else the place.
    const photoInner = (
      <>
        <img
          src={item.dishImage}
          alt={item.dishName ?? item.restaurant.name}
          loading="lazy"
          style={{ filter: filterForGrain(item.dishGrain) }}
        />
        <span className="ph-tag">film · {item.dishGrain ?? 'candlelit'}</span>
      </>
    )
    return (
      <div className="feed-card" style={style}>
        {item.dishId ? (
          <Link to="/dish/$dishId" params={{ dishId: item.dishId }} className="ph feed-photo">
            {photoInner}
          </Link>
        ) : (
          <Link
            to="/r/$restaurantId"
            params={{ restaurantId: item.restaurant.id }}
            className="ph feed-photo"
          >
            {photoInner}
          </Link>
        )}
        <div className="feed-card__body">
          {who('posted a dish', 24)}
          <div className="feed-dish-name">{item.dishName || item.restaurant.name}</div>
          {chars}
          <FeedFooter item={item} />
        </div>
      </div>
    )
  }

  return (
    <div className="feed-card feed-card--rank" style={style}>
      <div className="feed-rank-head">
        {who('ranked a place', 28)}
        <ScoreBadge score={item.score} attribution={{ kind: 'user', label: firstName }} size="md" />
      </div>
      <Link
        to="/r/$restaurantId"
        params={{ restaurantId: item.restaurant.id }}
        className="feed-rank-body"
      >
        <div className="feed-rank-name">{item.restaurant.name}</div>
        {chars}
      </Link>
      {item.note && <div className="feed-note">“{item.note}”</div>}
      <FeedFooter item={item} />
    </div>
  )
}
