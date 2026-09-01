import * as SecureStore from 'expo-secure-store'

// The Bearer session token. Better Auth returns it in a `set-auth-token` header
// on sign-in/verify; we store it and attach `Authorization: Bearer <token>` to
// every request (auth-client.ts + api.ts). This is the auth path the server's
// bearer() plugin speaks — no cookies on native.
//
// Stored in the iOS Keychain / Android Keystore via expo-secure-store, which is
// encrypted at rest and unreachable from JS — so this is strictly stronger than
// the web app's localStorage. SecureStore is async while Better Auth's token
// getter and api.ts's request() are synchronous, so the value is mirrored in a
// module-level cache that initToken() fills once before the first render.
const KEY = 'mesa.session_token'

let cached = ''

// Awaited before the app renders (root layout). Until it resolves getToken()
// returns '', which reads as signed-out — so nothing may render before it does.
export async function initToken(): Promise<void> {
  try {
    // Bounded: nothing renders until this settles, so a stuck native bridge
    // would otherwise leave a permanently blank app. One extra sign-in is the
    // cheaper failure.
    const read = SecureStore.getItemAsync(KEY).then((v) => v ?? '')
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
    cached = (await Promise.race([read, timeout])) ?? ''
  } catch {
    cached = ''
  }
}

export function getToken(): string {
  return cached
}

export function setToken(token: string): void {
  cached = token
  // Fire-and-forget: the cache is what readers use, and a failed write must
  // never reject into an auth flow.
  void SecureStore.setItemAsync(KEY, token).catch(() => {})
}

export function clearToken(): void {
  cached = ''
  void SecureStore.deleteItemAsync(KEY).catch(() => {})
}
