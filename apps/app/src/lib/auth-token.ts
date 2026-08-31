// The Bearer session token, persisted so it survives reloads. Better Auth
// returns it in a `set-auth-token` response header on sign-in/verify; we store
// it and attach `Authorization: Bearer <token>` to every API call. This is the
// auth path that works where cross-site cookies are blocked (iOS Safari, the
// Capacitor native webview).
//
// Stored through Capacitor Preferences rather than localStorage directly. On
// web that IS localStorage (with a CapacitorStorage. prefix), so nothing
// changes there. On native it is UserDefaults, which matters for one specific
// reason: it is not reachable from JavaScript running in the webview, so an XSS
// in the native shell can no longer read the session token out of storage.
// Until now the CSP's connect-src was the only thing standing between an
// injected script and the token.
//
// Being honest about the limit: UserDefaults is not the Keychain. It is not
// encrypted at rest beyond the device's own protection and is no harder to pull
// off a jailbroken device than localStorage was. Real Keychain storage needs a
// community plugin — a new dependency for a marginal gain against a threat
// model that already assumes the device is compromised. Not worth it here.
//
// Preferences is async and Better Auth's token getter is synchronous
// (auth-client.ts) — as is lib/api.ts's request(). So the value is mirrored in
// a module-level cache that initToken() fills once, before the first render
// (main.tsx). getToken() stays sync and never has to await.
import { Preferences } from '@capacitor/preferences'

const KEY = 'mesa.session_token'

let cached = ''

// Awaited in main.tsx before the app renders. Until it resolves getToken()
// returns '', which would look like a signed-out user — so nothing may render
// before it completes.
export async function initToken(): Promise<void> {
  try {
    // Bounded. Nothing renders until this settles, so a native bridge that
    // never answers would leave a permanently blank app — much worse than the
    // timeout's cost, which is one extra sign-in. On web this is a localStorage
    // read and on iOS a UserDefaults read, so the timer should never fire; it
    // exists because the native path cannot be exercised from here (the ios/
    // project is generated on demand — see docs/NATIVE.md).
    const read = Preferences.get({ key: KEY }).then((r) => r.value ?? '')
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
    const value = await Promise.race([read, timeout])
    if (value === null) {
      console.error('[auth] token storage did not respond in 3s — starting signed out')
    }
    cached = value ?? ''
  } catch {
    cached = ''
  }
  if (cached) return

  // One-time migration. Sessions written before this change live under the bare
  // localStorage key, while Preferences reads a prefixed one — without this
  // every already-signed-in member would be silently logged out by a deploy.
  try {
    const legacy = localStorage.getItem(KEY)
    if (!legacy) return
    cached = legacy
    await Preferences.set({ key: KEY, value: legacy })
    localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable (private mode, quota). The in-memory value still
    // carries this session; it just won't survive a reload.
  }
}

export function getToken(): string {
  return cached
}

export function setToken(token: string): void {
  cached = token
  // Fire-and-forget: the cache is what every reader actually uses, and a failed
  // write must never reject into an auth flow. On web the underlying
  // localStorage write happens synchronously anyway.
  void Preferences.set({ key: KEY, value: token }).catch(() => {})
}

export function clearToken(): void {
  cached = ''
  void Preferences.remove({ key: KEY }).catch(() => {})
}
