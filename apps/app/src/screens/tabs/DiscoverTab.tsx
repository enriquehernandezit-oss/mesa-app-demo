import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { PullToRefresh } from '../../components/PullToRefresh'
import { Body, ErrorState, Eyebrow, SerifItalic, Skeleton, Title } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { api } from '../../lib/api'
import { cloudinaryUrl } from '../../lib/media'
import { timeAgo } from '../../lib/time'
import type { FeedItem } from '../../lib/types'
import { CheersButton } from './CheersButton'
import './tabs.css'
import './feed.css'

// The discovery feed (M4, redesigned in the viral pass): photo-forward cards,
// infinite scroll (cursor pagination), pull-to-refresh, timestamps, cheers.
// Search sits above the feed — the only way to find a spot by name.

interface FeedPage {
  feed: FeedItem[]
  nextCursor: string | null
}

export function DiscoverTab() {
  const [query, setQuery] = useState('')
  const searching = query.trim().length >= 2

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
        <input
          className="search-field"
          type="search"
          placeholder="Search spots, cuisines, neighborhoods…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {searching ? (
        <SearchResults query={query.trim()} />
      ) : feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <ErrorState>Couldn't load the feed. Try again in a moment.</ErrorState>
      ) : items.length > 0 ? (
        <>
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
        <div className="tab-empty">
          <SerifItalic style={{ fontSize: '1.25rem' }}>Follow a few people.</SerifItalic>
          <Body>Their rankings and vibe notes fill this feed.</Body>
        </div>
      )}
    </PullToRefresh>
  )
}

interface SearchHit {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: string | null
}

function SearchResults({ query }: { query: string }) {
  const q = useQuery({
    queryKey: ['search', query],
    queryFn: () =>
      api.get<{ restaurants: SearchHit[] }>(`/restaurants?q=${encodeURIComponent(query)}`),
  })
  if (q.isPending) return <Body>Searching…</Body>
  const results = q.data?.restaurants ?? []
  if (results.length === 0) {
    return (
      <div className="tab-empty">
        <SerifItalic style={{ fontSize: '1.15rem' }}>Nothing matches "{query}".</SerifItalic>
      </div>
    )
  }
  return (
    <div className="search-results">
      {results.map((r) => {
        const cover = cloudinaryUrl(r.coverImageId, { w: 200, h: 200 })
        return (
          <Link
            key={r.id}
            to="/r/$restaurantId"
            params={{ restaurantId: r.id }}
            className="search-row"
          >
            {cover ? (
              <img className="search-thumb" src={cover} alt="" />
            ) : (
              <div className="search-thumb" />
            )}
            <div className="ranking-main">
              <div className="ranking-name" style={{ fontSize: '1.25rem' }}>
                {r.name}
              </div>
              <div className="ranking-meta">
                {[r.cuisine, r.neighborhood].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="link-action">→</span>
          </Link>
        )
      })}
    </div>
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
  const cover = cloudinaryUrl(item.restaurant.coverImageId, { w: 800, h: 534 })
  return (
    <div className="feed-card" style={{ animationDelay: `${Math.min(index, 5) * 60}ms` }}>
      <Link to="/u/$userId" params={{ userId: item.user.id }} className="feed-who">
        <Avatar name={item.user.name || item.user.handle || 'm'} src={item.user.image} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="feed-who__name">
            {item.user.name || item.user.handle} <span className="feed-verb">ranked</span>
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
          <img src={cover} alt={item.restaurant.name} loading="lazy" />
        ) : (
          item.restaurant.name
        )}
        <div className="feed-caption">
          <span className="feed-name">{item.restaurant.name}</span>
          <span className="feed-score">{Math.round(item.score)}</span>
        </div>
      </Link>

      <div className="feed-body">
        <div className="feed-body__row">
          <div className="feed-meta">
            {[item.restaurant.cuisine, item.neighborhood].filter(Boolean).join(' · ')}
          </div>
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
