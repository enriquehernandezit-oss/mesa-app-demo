import { track } from '@/lib/analytics'
import { useQuery } from '@tanstack/react-query'
import { genericOAuthClient, phoneNumberClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { clearToken, getToken, setToken } from './auth-token'
import { queryClient } from './query'

// Better Auth client, pointed at the Hono API. Mirrors the server's providers
// (apps/api/src/auth.ts): email+password (built in), phone OTP, Apple (social),
// Instagram (generic OAuth). Whether the social ones complete depends on the
// server having their secrets; email/password works in every build.
//
// EXPO_PUBLIC_API_URL is the API's absolute public URL; Better Auth mounts at
// `/api/auth/*`, appended here. No window.location/relative resolution — this is
// native, the URL is always absolute.
const origin = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const baseURL = `${origin}/api/auth`

export const authClient = createAuthClient({
  baseURL,
  plugins: [phoneNumberClient(), genericOAuthClient()],
  fetchOptions: {
    // Attach the stored token to every auth request, and capture a fresh one
    // whenever the server issues it. This is the whole auth mechanism on native
    // (no cookie): the token lives in the Keychain via auth-token.ts.
    auth: { type: 'Bearer', token: () => getToken() },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get('set-auth-token')
      if (token) setToken(token)
    },
  },
})

export const signOut = () =>
  authClient.signOut().finally(() => {
    track('signed_out')
    // Drop the local token regardless of the network result, so the app can't
    // reauthenticate with a stale token after sign-out — then clear the cache so
    // the ['session'] query re-resolves to null and the route guards send the
    // user back to sign-in (no hard reload exists on native).
    clearToken()
    queryClient.clear()
  })

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
