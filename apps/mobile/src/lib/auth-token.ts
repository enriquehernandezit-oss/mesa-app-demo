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

// Bumped by every setToken/clearToken. Lets the "read arrived late" path in
// initToken tell whether cached is still exactly what it left it as — if the
// user signed in or out while the slow read was still in flight, this has
// moved, and adopting the stale read would be wrong.
let generation = 0

// Awaited before the app renders (root layout). Until it resolves getToken()
// returns '', which reads as signed-out — so nothing may render before it does.
//
// The read races a 3s timeout so a stuck native bridge can't leave a
// permanently blank app; one extra sign-in screen is the cheaper failure. But
// racing it must not mean ABANDONING it: a Keychain read that's merely slow
// (e.g. first unlock after a reboot) used to resolve after the timeout into a
// cache nobody ever updated, so every request went out with no Authorization
// header, 401'd, and authLost.ts's handler DELETED the still-valid token in
// response — turning "the read was slow" into "you're signed out." The read
// keeps running in the background after the race and adopts its value if the
// generation hasn't moved (nothing has explicitly set/cleared the token since).
export async function initToken(): Promise<void> {
  const myGeneration = generation
  const read = SecureStore.getItemAsync(KEY)
    .then((v) => v ?? '')
    .catch(() => '')
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
  const raced = await Promise.race([read, timeout])
  if (raced !== null) {
    cached = raced
    return
  }
  // Timed out — don't block startup on it, but let it finish quietly.
  void read.then((v) => {
    if (generation === myGeneration) cached = v
  })
}

export function getToken(): string {
  return cached
}

export function setToken(token: string): void {
  cached = token
  generation++
  // Fire-and-forget: the cache is what readers use, and a failed write must
  // never reject into an auth flow.
  void SecureStore.setItemAsync(KEY, token).catch(() => {})
}

export function clearToken(): void {
  cached = ''
  generation++
  void SecureStore.deleteItemAsync(KEY).catch(() => {})
}
