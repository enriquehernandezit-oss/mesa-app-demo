import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { RankAPlace } from '../screens/rank/RankAPlace'
import { RestaurantProfile } from '../screens/restaurant/RestaurantProfile'
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

// Minimal line icons, brass when active: compass / laurel list / martini / person.
const TABS = [
  {
    to: '/discover',
    label: 'Discover',
    d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  },
  { to: '/rankings', label: 'Rankings', d: 'M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01' },
  { to: '/tonight', label: 'Tonight', d: 'M5 3h14l-7 8v7m0 0H8m4 0h4M5 3l7 8M19 3l-7 8' },
  {
    to: '/profile',
    label: 'Profile',
    d: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  },
] as const

function TabBar() {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <Link key={t.to} to={t.to} className="tab-link">
          <Icon d={t.d} />
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

function TabsLayout() {
  return (
    <div className="tab-shell">
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  tabsLayout.addChildren([discoverRoute, rankingsRoute, tonightRoute, profileRoute]),
  rankRoute,
  userRoute,
  restaurantRoute,
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
