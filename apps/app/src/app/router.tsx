import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { ProfileTab } from '../screens/tabs/ProfileTab'
import { DiscoverTab, RankingsTab, TonightTab } from '../screens/tabs/placeholders'
import '../screens/tabs/tabs.css'

// The tab shell. Reached only once a user is authed AND onboarded (App gates
// that), so these routes never worry about auth. TanStack Router owns
// navigation between the four tabs; auth/onboarding live outside the router as
// their own flows.

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

function Shell() {
  return (
    <div className="tab-shell">
      <div className="tab-body">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}

const rootRoute = createRootRoute({ component: Shell })

// Land on Discover.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/discover' })
  },
})

// Literal path strings (not a helper) so TanStack Router infers each route's
// path type and the tab <Link to> values stay type-checked.
const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discover',
  component: DiscoverTab,
})
const rankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rankings',
  component: RankingsTab,
})
const tonightRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tonight',
  component: TonightTab,
})
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfileTab,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  discoverRoute,
  rankingsRoute,
  tonightRoute,
  profileRoute,
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
