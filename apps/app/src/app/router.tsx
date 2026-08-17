import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { TopBar } from '../components/TopBar'
import { ActivityScreen } from '../screens/activity/ActivityScreen'
import { DishCompose } from '../screens/dish/DishCompose'
import { ExploreScreen } from '../screens/explore/ExploreScreen'
import { LeaderboardScreen } from '../screens/leaderboard/LeaderboardScreen'
import { ListScreen } from '../screens/list/ListScreen'
import { MapScreen } from '../screens/map/MapScreen'
import { RankAPlace } from '../screens/rank/RankAPlace'
import { RestaurantProfile } from '../screens/restaurant/RestaurantProfile'
import { SettingsScreen } from '../screens/settings/SettingsScreen'
import { DiscoverTab } from '../screens/tabs/DiscoverTab'
import { ProfileTab } from '../screens/tabs/ProfileTab'
import { RankingsTab } from '../screens/tabs/RankingsTab'
import { TonightTab } from '../screens/tabs/placeholders'
import { UserRankings } from '../screens/user/UserRankings'
import '../screens/tabs/tabs.css'

// Reached only once a user is authed AND onboarded (App gates that), so these
// routes never worry about auth. The four tabs live under a pathless layout that
// renders the tab bar; focused flows (rank-a-place, another user's profile) are
// top-level routes WITHOUT the tab bar.

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      role="presentation"
    >
      <path d={d} />
    </svg>
  )
}

// Minimal line icons, brass when active (per the 18-screen design): hatched
// plate / bulleted list / half-moon / person. A center "+" FAB (rank a place)
// sits between the two pairs — the 5-slot bar.
const TABS = [
  {
    to: '/discover',
    label: 'Feed',
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 4.4v15.2M12 3.1v17.8M15 4.4v15.2',
  },
  { to: '/rankings', label: 'Rankings', d: 'M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01' },
  { to: '/tonight', label: 'Tonight', d: 'M12 3a9 9 0 1 0 0 18V3Z' },
  {
    to: '/profile',
    label: 'You',
    d: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  },
] as const

function TabLink({ to, label, d }: (typeof TABS)[number]) {
  return (
    <Link to={to} className="tab-link">
      <Icon d={d} />
      {label}
    </Link>
  )
}

function TabBar() {
  return (
    <nav className="tab-bar">
      <TabLink {...TABS[0]} />
      <TabLink {...TABS[1]} />
      <Link to="/rank" className="tab-fab" aria-label="Rank a place">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
          role="presentation"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      <TabLink {...TABS[2]} />
      <TabLink {...TABS[3]} />
    </nav>
  )
}

function TabsLayout() {
  return (
    <div className="tab-shell">
      <TopBar />
      <div className="tab-body">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}

const rootRoute = createRootRoute({ component: Outlet })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/discover' })
  },
})

// Pathless layout: everything under it gets the tab bar.
const tabsLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: 'tabs',
  component: TabsLayout,
})
const discoverRoute = createRoute({
  getParentRoute: () => tabsLayout,
  path: '/discover',
  component: DiscoverTab,
})
const rankingsRoute = createRoute({
  getParentRoute: () => tabsLayout,
  path: '/rankings',
  validateSearch: (s: Record<string, unknown>): { tab?: 'saved' | 'barrios' } =>
    s.tab === 'saved' || s.tab === 'barrios' ? { tab: s.tab } : {},
  component: RankingsTab,
})
const tonightRoute = createRoute({
  getParentRoute: () => tabsLayout,
  path: '/tonight',
  component: TonightTab,
})
const profileRoute = createRoute({
  getParentRoute: () => tabsLayout,
  path: '/profile',
  component: ProfileTab,
})

// Full-screen flows, no tab bar.
const rankRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rank',
  validateSearch: (s: Record<string, unknown>): { restaurant?: string } =>
    typeof s.restaurant === 'string' ? { restaurant: s.restaurant } : {},
  component: RankAPlace,
})
const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$userId',
  component: UserRankings,
})
const restaurantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/r/$restaurantId',
  component: RestaurantProfile,
})
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  component: ActivityScreen,
})
const leaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/leaderboard',
  component: LeaderboardScreen,
})
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/map',
  component: MapScreen,
})
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsScreen,
})
const exploreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore',
  component: ExploreScreen,
})
const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$slug',
  component: ListScreen,
})
const dishRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dish',
  validateSearch: (s: Record<string, unknown>): { restaurant: string } => ({
    restaurant: typeof s.restaurant === 'string' ? s.restaurant : '',
  }),
  component: DishCompose,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  tabsLayout.addChildren([discoverRoute, rankingsRoute, tonightRoute, profileRoute]),
  rankRoute,
  userRoute,
  restaurantRoute,
  activityRoute,
  leaderboardRoute,
  mapRoute,
  settingsRoute,
  exploreRoute,
  listRoute,
  dishRoute,
])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function TabApp() {
  return <RouterProvider router={router} />
}
