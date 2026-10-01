// Which database a script is about to touch, for the first line of its output. A script run in the
// wrong terminal — one still holding a production URL, or one with none exported that quietly
// falls back to the local .env — changes the wrong data, and nothing else on screen says which
// database it is. Never includes the credentials.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function databaseLabel(url: string | undefined): string {
  if (!url) return 'DATABASE_URL is not set'
  try {
    const u = new URL(url)
    const where = LOCAL_HOSTS.has(u.hostname) ? 'local' : 'REMOTE'
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname} (${where})`
  } catch {
    return 'an unreadable DATABASE_URL'
  }
}
