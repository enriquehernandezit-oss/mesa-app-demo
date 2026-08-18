// The Bearer session token, persisted so it survives reloads. Better Auth
// returns it in a `set-auth-token` response header on sign-in/verify; we store
// it and attach `Authorization: Bearer <token>` to every API call. This is the
// auth path that works where cross-site cookies are blocked (iOS Safari, the
// Capacitor native webview). localStorage is synchronous (the fetch token
// getter must be sync) and persists in both the browser and the WKWebView.
const KEY = 'mesa.session_token'

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Private mode / storage disabled — cookies still cover same-origin web.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // no-op
  }
}
