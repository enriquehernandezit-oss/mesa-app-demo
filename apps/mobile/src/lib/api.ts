// Thin typed fetch wrapper for Mesa's own API routes (everything that isn't
// Better Auth). Native has no trusted cross-origin cookie, so this sends ONLY
// the Bearer token — the auth path the server's bearer() plugin already speaks.
// Throws ApiError on non-2xx so TanStack Query surfaces failures; a 401/403
// reports the lost session once, in the single place every call passes through.
import { getToken } from './auth-token'
import { reportAuthLost } from './authLost'
import { captureError } from './errors'

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

// The API origin, also where the public share pages (/p/*) live — used to build
// the shareable link that rides along with a share card.
export const apiOrigin = baseURL

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`)
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, headers, ...rest } = init ?? {}
  const token = getToken()
  const res = await fetch(`${baseURL}${path}`, {
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...rest,
  }).catch((err) => {
    // The phone lost signal, or the API is unreachable. Worth knowing about in
    // aggregate — a spike here is an outage, not a user error.
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
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  // Optional body: account deletion carries proof of identity (a password).
  del: <T>(path: string, json?: unknown) => request<T>(path, { method: 'DELETE', json }),
}
