import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { PullToRefresh } from '../../components/PullToRefresh'
import {
  Body,
  Button,
  ErrorState,
  Eyebrow,
  SerifItalic,
  Skeleton,
  Title,
} from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics } from '../../components/ui/patterns'
import { api } from '../../lib/api'
import { displayScore } from '../../lib/display'
import { filterForGrain } from '../../lib/image'
import { cloudinaryUrl } from '../../lib/media'
import { timeAgo } from '../../lib/time'
import type { FeaturedList, FeedItem, RailSpot, SuggestedUser } from '../../lib/types'
import { CheersButton } from './CheersButton'
import './tabs.css'
import './feed.css'
import '../map/map.css'

// The discovery feed (M4, redesigned in the viral pass): photo-forward cards,
// infinite scroll (cursor pagination), pull-to-refresh, timestamps, cheers.
// Search sits above the feed — the only way to find a spot by name.

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
        <Link to="/map" className="map-pill">
          🗺 Ver en el mapa
        </Link>
      </div>

      {feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <ErrorState>Couldn't load the feed. Try again in a moment.</ErrorState>
      ) : items.length > 0 ? (
        <>
          <ListsRail />
          <SpotRail title="Trending esta semana" endpoint="/restaurants/trending" kind="cheers" />
          <div className="feed">
            {items.slice(0, 2).map((item, i) => (
              <FeedCard key={item.rankingId} item={item} index={i} />
            ))}
          </div>
          <SpotRail title="Para ti" endpoint="/feed/recs" kind="avg" />
          <div className="feed" style={{ marginTop: 'var(--space-5)' }}>
            {items.slice(2).map((item, i) => (
              <FeedCard key={item.rankingId} item={item} index={i + 2} />
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
                {[u.handle ? `@${u.handle}` : null, u.neighborhood].filter(Boolean).join(' · ')}
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

// Horizontal rail of spot cards — Trending (by cheers) and For-you (by friends'
// average). The chrome that makes Discover feel like an app, not a list.
function SpotRail({
  title,
  endpoint,
  kind,
}: {
  title: string
  endpoint: string
  kind: 'cheers' | 'avg'
}) {
  const q = useQuery({
    queryKey: ['rail', endpoint],
    queryFn: () => api.get<{ restaurants?: RailSpot[]; recs?: RailSpot[] }>(endpoint),
    staleTime: 120_000,
  })
  const spots = q.data?.restaurants ?? q.data?.recs ?? []
  if (spots.length < 3) return null
  return (
    <section className="rail">
      <div className="rail__head">
        <span className="rail__title">{title}</span>
      </div>
      <div className="rail__scroll">
        {spots.map((s) => {
          const cover = cloudinaryUrl(s.coverImageId, { w: 320, h: 400 })
          return (
            <Link
              key={s.id}
              to="/r/$restaurantId"
              params={{ restaurantId: s.id }}
              className="rail-card"
              style={cover ? { backgroundImage: `url(${cover})` } : undefined}
            >
              <span className="rail-card__badge">
                {kind === 'cheers'
                  ? `🥂 ${s.cheerCount}`
                  : s.friendAvg
                    ? displayScore(s.friendAvg)
                    : ''}
              </span>
              <span className="rail-card__name">{s.name}</span>
              <span className="rail-card__meta">
                {[s.cuisine, s.neighborhood].filter(Boolean).join(' · ')}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// Featured editorial lists — a carousel with your own progress through each.
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
      <div className="rail__head">
        <span className="rail__title">Featured lists</span>
      </div>
      <div className="rail__scroll">
        {lists.map((l) => {
          const cover = cloudinaryUrl(l.coverImageId, { w: 320, h: 400 })
          return (
            <Link
              key={l.slug}
              to="/lists/$slug"
              params={{ slug: l.slug }}
              className="rail-card"
              style={cover ? { backgroundImage: `url(${cover})` } : undefined}
            >
              <span className="rail-card__badge">
                {l.mine} of {l.total}
              </span>
              <span className="rail-card__name">{l.title}</span>
              <span className="rail-card__meta">{l.subtitle}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function FeedSkeleton() {
  return (
    <div className="feed">
      {[0, 1, 2].map((i) => (
        <div key={i} className="feed-card">
          <div className="feed-who">
            <Skeleton height={32} width={32} style={{ borderRadius: '50%' }} />
            <Skeleton height={14} width={140} />
          </div>
          <Skeleton height={220} width="100%" style={{ borderRadius: 0 }} />
          <div className="feed-body">
            <Skeleton height={12} width="45%" />
          </div>
        </div>
      ))}
    </div>
  )
}

function FeedCard({ item, index }: { item: FeedItem; index: number }) {
  // A dish photo, when present, is the card's image (with its grain treatment);
  // otherwise the restaurant cover.
  const cover = item.dishImage ?? cloudinaryUrl(item.restaurant.coverImageId, { w: 800, h: 534 })
  return (
    <div className="feed-card" style={{ animationDelay: `${Math.min(index, 5) * 60}ms` }}>
      <Link to="/u/$userId" params={{ userId: item.user.id }} className="feed-who">
        <Avatar name={item.user.name || item.user.handle || 'm'} src={item.user.image} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="feed-who__name">
            {item.user.name || item.user.handle}{' '}
            <span className="feed-verb">{item.dishImage ? 'posted a dish' : 'ranked'}</span>
          </div>
          {item.user.handle && <div className="feed-who__meta">@{item.user.handle}</div>}
        </div>
        <span className="feed-time">{timeAgo(item.rankedAt)}</span>
      </Link>

      <Link
        to="/r/$restaurantId"
        params={{ restaurantId: item.restaurant.id }}
        className={`feed-cover${cover ? '' : ' feed-cover--empty'}`}
      >
        {cover ? (
          <img
            src={cover}
            alt={item.dishName ?? item.restaurant.name}
            loading="lazy"
            style={item.dishImage ? { filter: filterForGrain(item.dishGrain) } : undefined}
          />
        ) : (
          item.restaurant.name
        )}
        {item.dishName && <span className="feed-dish-tag">🍽 {item.dishName}</span>}
        <div className="feed-caption">
          <span className="feed-name">{item.restaurant.name}</span>
          <span className="feed-score">{displayScore(item.score)}</span>
        </div>
      </Link>

      <div className="feed-body">
        <div className="feed-body__row">
          <Characteristics
            priceTier={item.restaurant.priceTier}
            cuisine={item.restaurant.cuisine}
            neighborhood={item.neighborhood}
          />
          <CheersButton
            rankingId={item.rankingId}
            count={item.cheersCount ?? 0}
            cheered={item.cheeredByMe ?? false}
          />
        </div>
        {item.note && <div className="feed-note">“{item.note}”</div>}
      </div>
    </div>
  )
}
