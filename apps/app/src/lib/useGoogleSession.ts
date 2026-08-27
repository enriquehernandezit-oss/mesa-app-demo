import { useState } from 'react'

// A Places Autocomplete "session" token (M9) — shared between the searches in
// one lookup and the eventual Details call that follows a tap. When the same
// token appears on both, Google bills the autocomplete requests in that
// session at zero once the Details call lands; omitting it still works, it's
// purely a cost optimization. Reset after a successful create so the next
// search starts a fresh (freshly-billable) session rather than reusing one
// that already terminated.
export function useGoogleSession() {
  const [token, setToken] = useState(() => crypto.randomUUID())
  return { token, reset: () => setToken(crypto.randomUUID()) }
}
