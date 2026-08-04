// Thin typed fetch wrapper for Mesa's own API routes (everything that isn't
// Better Auth). Always sends the session cookie (credentials: 'include') so
// authed routes resolve the current user. Throws ApiError on non-2xx so
// TanStack Query surfaces failures through its error channel.
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

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
  const res = await fetch(`${baseURL}${path}`, {
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...rest,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? 'request_failed')
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
