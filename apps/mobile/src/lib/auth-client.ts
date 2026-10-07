import { useQuery } from '@tanstack/react-query'
import { emailOTPClient, genericOAuthClient, phoneNumberClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { track } from '@/lib/analytics'

import { clearToken, getToken, setToken } from './auth-token'
import { clearAuthLost } from './authLost'
import { clearFeedSeen } from './feedSeen'
import { setFriendsOnlyScores } from './prefs'
import { unregisterPush } from './push'
import { queryClient } from './query'

// Better Auth client, pointed at the Hono API. Mirrors the server's providers
// (apps/api/src/auth.ts): email+password (built in) with its 6-digit confirmation code (emailOTP),
// phone OTP, Apple (social), Instagram (generic OAuth). Whether the social ones complete depends on the
// server having their secrets; email/password works in every build.
//
// EXPO_PUBLIC_API_URL is the API's absolute public URL; Better Auth mounts at
// `/api/auth/*`, appended here. No window.location/relative resolution — this is
// native, the URL is always absolute. Exported (trailing slash stripped) so
// lib/api.ts builds its own requests against the exact same origin — an
// EXPO_PUBLIC_API_URL with a trailing slash used to break every data call
// (`//me`) while auth kept working, since only this file normalized it.
export const apiBaseOrigin = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)
const baseURL = `${apiBaseOrigin}/api/auth`

export const authClient = createAuthClient({
  baseURL,
  plugins: [phoneNumberClient(), genericOAuthClient(), emailOTPClient()],
  fetchOptions: {
    // Bearer only — never the iOS cookie jar. Better Auth defaults to
    // `credentials: 'include'`, and RN's fetch then lets NSURLSession store
    // the session cookie from sign-in and replay it on every request. That
    // silently broke sign-out: the replayed cookie (with no Origin header)
    // made POST /sign-out fail Better Auth's CSRF check, so the server
    // session survived, and the very next get-session authenticated through
    // the leftover cookie — straight back into the app.
    credentials: 'omit',
    // Attach the stored token to every auth request, and capture a fresh one
    // whenever the server issues it. This is the whole auth mechanism on native
    // (no cookie): the token lives in the Keychain via auth-token.ts.
    auth: { type: 'Bearer', token: () => getToken() },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get('set-auth-token')
      if (token) {
        setToken(token)
        // A new session ends the "your session was lost" state. Without this, signing back in
        // after any 401 left the route guards redirecting to /sign-in until the app was restarted.
        clearAuthLost()
      }
    },
  },
})

// Signing out is local-first: the device forgets the session at once, so the
// tap always works, even offline. The server calls then run with the token
// captured beforehand, bounded so a slow network can't hold the screen.
// `local` skips the server calls: after the server has itself ended the session (account deletion)
// there is nothing to unregister, and the call would 401 and report a lost session for nothing.
export async function signOut(options?: { local?: boolean }): Promise<void> {
  const token = getToken()
  const server = options?.local
    ? Promise.resolve()
    : unregisterPush()
        .catch(() => {})
        .then(() =>
          authClient.signOut({ fetchOptions: { auth: { type: 'Bearer', token: () => token } } }),
        )
        .catch(() => {})
  await Promise.race([server, new Promise((resolve) => setTimeout(resolve, 2500))])
  track('signed_out')
  // Drop the token, then the cache, and pin the session to "signed out" so
  // every route guard flips immediately instead of waiting on a refetch.
  clearToken()
  // What the last person left on this phone: where they stopped reading the Feed, their
  // "friends' scores only" switch.
  void clearFeedSeen()
  setFriendsOnlyScores(false)
  queryClient.clear()
  queryClient.setQueryData(['session'], null)
}

// Session state via a cached TanStack Query rather than Better Auth's reactive
// useSession — same reason as the web app: under React 19 that hook's snapshot
// never settles and re-fetches in a loop. One cached fetch; sign-in/out
// invalidates ['session'].
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => (await authClient.getSession()).data,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
