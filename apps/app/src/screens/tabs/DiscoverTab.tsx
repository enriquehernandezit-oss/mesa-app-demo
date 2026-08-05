import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Body, ErrorState, Eyebrow, SerifItalic, Skeleton, Title } from '../../components/ui'
import { api } from '../../lib/api'
import type { FeedItem } from '../../lib/types'
import './tabs.css'
import './feed.css'

// The discovery feed (M4) — the payoff of the loop. What the people you follow
// ranked, and why. Cached by TanStack Query; a block/unfollow elsewhere
// invalidates ['feed'] so it stays honest.
export function DiscoverTab() {
  const feed = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.get<{ feed: FeedItem[] }>('/feed'),
  })

  return (
    <div>
      <div className="tab-header">
        <Eyebrow>Discover</Eyebrow>
        <Title>Where your friends eat</Title>
      </div>

      {feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <ErrorState>Couldn't load the feed. Try again in a moment.</ErrorState>
      ) : feed.data && feed.data.feed.length > 0 ? (
        <div className="feed">
          {feed.data.feed.map((item) => (
            <FeedCard key={item.rankingId} item={item} />
          ))}
        </div>
      ) : (
        <div className="tab-empty">
          <SerifItalic style={{ fontSize: '1.25rem' }}>Follow a few people.</SerifItalic>
          <Body>Their rankings and vibe notes fill this feed.</Body>
        </div>
      )}
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="feed">
      {[0, 1, 2].map((i) => (
        <div key={i} className="feed-card">
          <div className="feed-who">
            <Skeleton height={34} width={34} style={{ borderRadius: '50%' }} />
            <Skeleton height={14} width={140} />
          </div>
          <Skeleton height={28} width="70%" />
          <Skeleton height={12} width="45%" />
        </div>
      ))}
    </div>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  const initial = (item.user.name || item.user.handle || 'm').trim().charAt(0).toLowerCase()
  return (
    <div className="feed-card">
      <Link to="/u/$userId" params={{ userId: item.user.id }} className="feed-who">
        <div className="feed-avatar">{initial}</div>
        <div>
          <div className="feed-who__name">
            {item.user.name || item.user.handle} <span className="feed-verb">ranked</span>
          </div>
          {item.user.handle && <div className="feed-who__meta">@{item.user.handle}</div>}
        </div>
      </Link>

      <Link
        to="/r/$restaurantId"
        params={{ restaurantId: item.restaurant.id }}
        className="feed-place"
      >
        <span className="feed-place__name">{item.restaurant.name}</span>
        <span className="feed-place__score">{Math.round(item.score)}</span>
      </Link>
      <div className="feed-meta">
        {[item.restaurant.cuisine, item.neighborhood].filter(Boolean).join(' · ')}
      </div>

      {item.note && <div className="feed-note">“{item.note}”</div>}
    </div>
  )
}
