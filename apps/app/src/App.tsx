import { TabApp } from './app/router'
import { Splash } from './components/Splash'
import { useProfile } from './hooks/useProfile'
import { useSession } from './lib/auth-client'
import { AuthFlow } from './screens/AuthFlow'
import { Onboarding } from './screens/Onboarding'

// Top-level gate. Auth state and profile state are both async, so rather than
// fight the router with redirects we resolve them here and hand off to exactly
// one of: the auth flow, onboarding, or the tab shell. Each of those owns its
// own navigation.
//
//   no session            -> AuthFlow (Instagram / Apple / phone)
//   session, not onboarded -> Onboarding (rank + friends, cold-start fix)
//   session, onboarded     -> TabApp (Discover / Rankings / Tonight / Profile)
export function App() {
  const { data: session, isPending: sessionLoading } = useSession()
  const authed = Boolean(session?.user)
  const { data: me, isPending: profileLoading } = useProfile(authed)

  if (sessionLoading) return <Splash />
  if (!authed) return <AuthFlow />
  // Authed but the profile hasn't resolved yet.
  if (profileLoading || !me) return <Splash />
  if (!me.onboardingComplete) return <Onboarding />
  return <TabApp />
}
