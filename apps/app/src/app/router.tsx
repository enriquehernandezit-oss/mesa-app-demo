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
import { ProfileTab } from '../screens/tabs/ProfileTab'
import { RankingsTab } from '../screens/tabs/RankingsTab'
import { DiscoverTab, TonightTab } from '../screens/tabs/placeholders'
import { UserRankings } from '../screens/user/UserRankings'
import '../screens/tabs/tabs.css'

// Reached only once a user is authed AND onboarded (App gates that), so these
// routes never worry about auth. The four tabs live under a pathless layout that
// renders the tab bar; focused flows (rank-a-place, another user's profile) are
// top-level routes WITHOUT the tab bar.

const TABS = [
  { to: '/discover', label: 'Discover' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/tonight', label: 'Tonight' },
  { to: '/profile', label: 'Profile' },
] as const

function TabBar() {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <Link key={t.to} to={t.to} className="tab-link">
          <span className="tab-link__dot" />
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  tabsLayout.addChildren([discoverRoute, rankingsRoute, tonightRoute, profileRoute]),
  rankRoute,
  userRoute,
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
