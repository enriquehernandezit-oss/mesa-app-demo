import { TabApp } from './app/router'
import { Splash } from './components/Splash'
import { useProfile } from './hooks/useProfile'
import { useSession } from './lib/auth-client'
import { AuthFlow } from './screens/AuthFlow'
import { Onboarding } from './screens/Onboarding'
import { ResetPassword } from './screens/auth/ResetPassword'
import { LegalPage } from './screens/legal/LegalPage'

// Legal pages must be reachable even signed-out (App Store 5.1), so they're
// resolved from the URL BEFORE the auth gate — a plain path check, since the
// router only mounts once a user is authed.
function legalDoc(): 'terms' | 'eula' | 'privacy' | null {
  const p = window.location.pathname
  if (p === '/terms') return 'terms'
  if (p === '/eula') return 'eula'
  if (p === '/privacy') return 'privacy'
  return null
}

// Top-level gate. Auth state and profile state are both async, so rather than
// fight the router with redirects we resolve them here and hand off to exactly
// one of: a legal page, the auth flow, onboarding, or the tab shell.
//
//   /terms|/eula|/privacy  -> LegalPage (any auth state)
//   no session             -> AuthFlow (Instagram / Apple / phone)
//   session, not onboarded -> Onboarding (rank + friends, cold-start fix)
//   session, onboarded     -> TabApp (Discover / Rankings / Tonight / Profile)
export function App() {
  const doc = legalDoc()
  const isReset = window.location.pathname === '/reset-password'
  const { data: session, isPending: sessionLoading } = useSession()
  const authed = Boolean(session?.user)
  const { data: me, isPending: profileLoading } = useProfile(authed)

  if (doc) return <LegalPage doc={doc} />
  // Password-reset link — signed-out, resolved by path before the auth gate.
  if (isReset) return <ResetPassword />
  if (sessionLoading) return <Splash />
  if (!authed) return <AuthFlow />
  // Authed but the profile hasn't resolved yet.
  if (profileLoading || !me) return <Splash />
  if (!me.onboardingComplete) return <Onboarding />
  return <TabApp />
}
