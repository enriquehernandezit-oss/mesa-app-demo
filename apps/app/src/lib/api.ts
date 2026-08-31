// Thin typed fetch wrapper for Mesa's own API routes (everything that isn't
// Better Auth). Sends the session cookie (credentials: 'include') AND the
// Bearer token when we have one — authed routes resolve the current user via
// Better Auth's getSession, which accepts either. The Bearer path is what keeps
// auth working where cross-site cookies are blocked (iOS Safari, native shell).
// Throws ApiError on non-2xx so TanStack Query surfaces failures.
import { getToken } from './auth-token'
import { reportAuthLost } from './authLost'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// The API origin, also where the public share pages (/p/*) are served. Used to
// build the shareable link that rides along with a share card.
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
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...rest,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    const code = body.error ?? 'request_failed'
    // One place to notice the session is gone, since every Mesa API call goes
    // through here. 401 means Better Auth found no session, so any token we
    // still hold is dead. 403 account_suspended is the ban gate in
    // middleware/session.ts — the session is technically valid, which is why it
    // needs its own signal: without it the app can't tell "signed out" from
    // "ejected", and the user is owed the difference.
    if (res.status === 401) reportAuthLost('unauthorized')
    else if (res.status === 403 && code === 'account_suspended') {
      reportAuthLost('account_suspended')
    }
    throw new ApiError(res.status, code)
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
