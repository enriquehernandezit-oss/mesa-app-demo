// What to do when the server says this session is no longer good.
//
// Nothing used to handle that. A dead session produced 401s on every query and
// the app just sat there re-rendering failures, with the stale token still in
// storage — the ONLY thing that ever removed it was an explicit sign-out. A
// suspended account was worse: requireAuth 403s every route including /me, so
// the top-level gate never got a profile and the app hung on the splash screen
// forever, saying nothing.
//
// A module-level store, like components/ui/toast-store: lib/api.ts can report
// from a plain fetch path with no provider, no context, and — importantly — no
// import of the query client or the router, which would be a cycle.
import { useSyncExternalStore } from 'react'
import { clearToken } from './auth-token'
import { queryClient } from './query'

export type AuthLostReason = 'unauthorized' | 'account_suspended'

let reason: AuthLostReason | null = null
const listeners = new Set<() => void>()

export function reportAuthLost(next: AuthLostReason): void {
  // A screen fires several queries at once, so one dead session arrives as a
  // burst of identical failures. Only act on the first.
  if (reason === next) return
  reason = next
  // Drop the bearer token immediately — it is known-bad, and leaving it means
  // the next request re-authenticates with a credential the server rejects.
  clearToken()
  // Deferred: this can be reached from inside a query's error path, and
  // clearing the cache mid-render would tear down the tree that is rendering.
  queueMicrotask(() => queryClient.clear())
  for (const l of listeners) l()
}

// Called when the user acts on the message (e.g. taps back into sign-in), so a
// later genuine session loss can report again.
export function clearAuthLost(): void {
  if (reason === null) return
  reason = null
  for (const l of listeners) l()
}

export function useAuthLost(): AuthLostReason | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => reason,
  )
}
