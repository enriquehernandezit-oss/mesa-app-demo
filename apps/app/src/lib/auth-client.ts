import { useQuery } from '@tanstack/react-query'
import { genericOAuthClient, phoneNumberClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { clearToken, getToken, setToken } from './auth-token'

// Better Auth client, pointed at the Hono API. Auth methods mirror what the
// server wires (apps/api/src/auth.ts):
//   - email + password — first-party (signUp.email / signIn.email, built in — no plugin)
//   - phone (OTP)      — always available; in dev the code prints to the API console
//   - Apple            — social provider (App Store 4.8 counterpart to Instagram)
//   - Instagram        — generic OAuth (Meta's sanctioned endpoints, App Store 4.5)
// Whether Apple/Instagram actually complete depends on the server having their
// secrets set; email/password and phone work in every build.
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const authClient = createAuthClient({
  baseURL,
  plugins: [phoneNumberClient(), genericOAuthClient()],
  fetchOptions: {
    // Attach the stored Bearer token to every auth request, and capture a fresh
    // one whenever the server issues it (sign-in, phone verify, refresh). This
    // is what makes auth work when the cross-site session cookie is blocked
    // (iOS Safari, the Capacitor native webview).
    auth: { type: 'Bearer', token: () => getToken() },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get('set-auth-token')
      if (token) setToken(token)
    },
  },
})

export const signOut = () =>
  authClient.signOut().finally(() => {
    // Drop the local token regardless of the network result so the app can't
    // reauthenticate with a stale Bearer token after sign-out.
    clearToken()
  })

// Session state via a cached TanStack Query instead of Better Auth's reactive
// useSession: under React 19 that hook's external-store snapshot never settles
// and re-fetches /get-session in a tight loop (constant re-renders were also
// eating first taps). One cached fetch; sign-in/out invalidates ['session'].
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => (await authClient.getSession()).data,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
