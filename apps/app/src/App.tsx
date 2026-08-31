import { TabApp } from './app/router'
import { Splash } from './components/Splash'
import { ErrorState } from './components/ui'
import { useProfile } from './hooks/useProfile'
import { useSession } from './lib/auth-client'
import { useAuthLost } from './lib/authLost'
import { AuthFlow } from './screens/AuthFlow'
import { Onboarding } from './screens/Onboarding'
import { ResetPassword } from './screens/auth/ResetPassword'
import { VerifyEmail } from './screens/auth/VerifyEmail'
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
  const isVerify = window.location.pathname === '/verify-email'
  const { data: session, isPending: sessionLoading } = useSession()
  const authed = Boolean(session?.user)
  const { data: me, isPending: profileLoading, refetch: refetchMe } = useProfile(authed)
  const authLost = useAuthLost()

  if (doc) return <LegalPage doc={doc} />
  // Links from email — resolved by path before the auth gate, because both are
  // routinely opened on a different device from the one that signed up, where
  // there is no session at all.
  if (isReset) return <ResetPassword />
  if (isVerify) return <VerifyEmail />
  // An ejected account keeps a technically-valid session, so this can't be left
  // to the checks below: requireAuth 403s every route including /me, which used
  // to strand the user on the splash screen with no explanation. Decided here,
  // ahead of session state, so there is no way to loop back into the app.
  if (authLost === 'account_suspended') return <AuthFlow suspended />
  if (sessionLoading) return <Splash />
  if (!authed) return <AuthFlow />
  if (profileLoading) return <Splash />
  // The profile call failed (offline, a cold-start blip, a 500). Previously
  // this fell into the same branch as "still loading" and hung forever; it is a
  // real error state and needs a way out.
  if (!me) {
    return (
      <div className="screen screen--center">
        <ErrorState onRetry={() => refetchMe()}>No pudimos cargar tu perfil.</ErrorState>
      </div>
    )
  }
  if (!me.onboardingComplete) return <Onboarding />
  return <TabApp />
}
