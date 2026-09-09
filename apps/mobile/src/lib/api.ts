// Thin typed fetch wrapper for Mesa's own API routes (everything that isn't
// Better Auth). Native has no trusted cross-origin cookie, so this sends ONLY
// the Bearer token — the auth path the server's bearer() plugin already speaks.
// Throws ApiError on non-2xx so TanStack Query surfaces failures; a 401/403
// reports the lost session once, in the single place every call passes through.
import { apiBaseOrigin } from './auth-client'
import { getToken, setToken } from './auth-token'
import { reportAuthLost } from './authLost'
import { captureError } from './errors'

// Same normalized origin auth-client.ts builds Better Auth's baseURL from —
// one place strips the trailing slash, so data calls and auth calls can never
// disagree about it.
const baseURL = apiBaseOrigin

// The API origin, also where the public share pages (/p/*) live — used to build
// the shareable link that rides along with a share card.
export const apiOrigin = baseURL

// Requests with no response within this long are treated as failed rather than
// left spinning forever — the fallback a flaky mobile network needs and a wall
// socket never does.
const REQUEST_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`)
  }
}

// AbortSignal.timeout is available in Hermes for the SDK 57 runtime this app
// ships on; if a future engine swap ever drops it, fall back to a manual
// controller so a request still can't hang forever.
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, headers, ...rest } = init ?? {}
  const token = getToken()
  const res = await fetch(`${baseURL}${path}`, {
    // A default, not a forced value: ...rest below can still override it if a
    // caller ever needs its own signal (none do today).
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...rest,
  }).catch((err) => {
    // A timed-out/aborted request is a known, named failure mode — surface it
    // as one rather than letting a raw DOMException read as "the server broke".
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ApiError(0, 'timeout')
    }
    // Anything else: the phone lost signal, or the API is unreachable. Worth
    // knowing about in aggregate — a spike here is an outage, not a user error.
    captureError(err, 'api.network')
    throw err
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    const code = body.error ?? 'request_failed'
    // 401 means Better Auth found no session, so any token we hold is dead.
    // 403 account_suspended is the ban gate — a technically-valid session, so it
    // needs its own signal to tell "signed out" from "ejected".
    if (res.status === 401) reportAuthLost('unauthorized')
    else if (res.status === 403 && code === 'account_suspended') {
      reportAuthLost('account_suspended')
    }
    const err = new ApiError(res.status, code)
    // Only server faults. A 404 on a deleted dish or a 403 on a blocked profile
    // is the system working — reporting those would bury the real breakages.
    if (res.status >= 500) captureError(err, `api.5xx${path.split('?')[0]}`)
    throw err
  }
  // Better Auth rotates the session token on refresh; auth-client.ts's own
  // fetchOptions.onSuccess captures it for auth calls, but that leaves every
  // OTHER request — the other 40-odd endpoints, all routed through here —
  // never seeing the rotation. Same capture, same place every call passes.
  const rotated = res.headers.get('set-auth-token')
  if (rotated) setToken(rotated)
  try {
    return (await res.json()) as T
  } catch (err) {
    // A 2xx with an unparseable body (an edge/proxy error page, an empty
    // response) — surfaced as ApiError so `err instanceof ApiError` callers
    // catch it too, instead of a raw SyntaxError slipping past them.
    captureError(err, `api.invalid_response${path.split('?')[0]}`)
    throw new ApiError(res.status, 'invalid_response')
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  // Optional body: account deletion carries proof of identity (a password).
  del: <T>(path: string, json?: unknown) => request<T>(path, { method: 'DELETE', json }),
}
