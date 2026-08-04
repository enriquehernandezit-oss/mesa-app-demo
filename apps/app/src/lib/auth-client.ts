import { genericOAuthClient, phoneNumberClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Better Auth client, pointed at the Hono API. The three providers here mirror
// exactly what the server wires (apps/api/src/auth.ts):
//   - phone (OTP) — always available; in dev the code prints to the API console
//   - Apple    — social provider (App Store 4.8 counterpart to Instagram)
//   - Instagram — generic OAuth (Meta's sanctioned endpoints, App Store 4.5)
// The client declares all three; whether Apple/Instagram actually complete
// depends on the server having their secrets set.
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const authClient = createAuthClient({
  baseURL,
  plugins: [phoneNumberClient(), genericOAuthClient()],
})

export const { useSession, signOut } = authClient
