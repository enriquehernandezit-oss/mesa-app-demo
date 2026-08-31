import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useProfile } from '../hooks/useProfile'
import { api } from '../lib/api'
import { shareProfile } from '../lib/shareProfile'
import type { ActivityItem } from '../lib/types'
import { Wordmark } from './ui'
import { SettingsIcon, ShareIcon } from './ui/icons'
import './topbar.css'

// Persistent app bar over the tab shell: small wordmark, leaderboard, and the
// notification bell. The unseen badge compares activity timestamps against a
// local watermark that the Activity screen advances when opened. On /profile it
// swaps to the profile variant (name + share + settings) per mock E1.
const SEEN_KEY = 'mesa-activity-seen'

export function activitySeenWatermark(): string {
  return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString()
}
export function markActivitySeen(): void {
  localStorage.setItem(SEEN_KEY, new Date().toISOString())
}

export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  if (pathname === '/profile') return <ProfileTopBar />
  return <DiscoverTopBar />
}

// Own-profile top bar (mock E1): the member's name left, share + settings right.
function ProfileTopBar() {
  const me = useProfile(true)
  const p = me.data?.profile
  return (
    <header className="topbar">
      <span className="topbar__title">{p?.name || 'Tú'}</span>
      <div className="topbar__actions">
        <button
          type="button"
          className="topbar__btn"
          aria-label="Compartir perfil"
          onClick={() => shareProfile(p?.handle)}
        >
          <ShareIcon size={19} />
        </button>
        <Link to="/settings" className="topbar__btn" aria-label="Ajustes">
          <SettingsIcon size={19} />
        </Link>
      </div>
    </header>
  )
}

function DiscoverTopBar() {
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
    staleTime: 60_000,
  })
  const watermark = activitySeenWatermark()
  const unseen = (activity.data?.activity ?? []).filter((a) => a.at > watermark).length

  return (
    <header className="topbar">
      <Wordmark size={22} />
      <div className="topbar__actions">
        <Link to="/leaderboard" className="topbar__btn" aria-label="Clasificación">
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            role="presentation"
          >
            <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
          </svg>
        </Link>
        <Link to="/activity" className="topbar__btn" aria-label="Actividad">
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            role="presentation"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
          </svg>
          {unseen > 0 && <span className="topbar__badge">{unseen > 9 ? '9+' : unseen}</span>}
        </Link>
      </div>
    </header>
  )
}
