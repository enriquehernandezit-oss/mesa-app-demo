import { useState } from 'react'

// A Places Autocomplete "session" token (M9) — shared between the searches in
// one lookup and the Details call that follows a tap, so Google bills the
// session's autocomplete requests at zero. Omitting it still works; it's purely
// a cost optimization. Ported from apps/app/src/lib/useGoogleSession.ts, which
// used crypto.randomUUID() — not guaranteed on RN/Hermes, so this falls back to
// a non-crypto generator (this token is a billing-session id, not a secret).
function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function useGoogleSession() {
  const [token, setToken] = useState(uuid)
  return { token, reset: () => setToken(uuid()) }
}
