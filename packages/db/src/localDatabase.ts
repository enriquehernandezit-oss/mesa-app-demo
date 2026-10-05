// Which database a script is about to touch, and a refusal for the scripts that must never touch a
// remote one. A script run in the wrong terminal — one still holding a production URL, or one with
// none exported that quietly falls back to the local .env — changes the wrong data, and nothing else
// on screen says which database it is.
//
// Pure (no pool): imported through the "@mesa/db/localDatabase" subpath so a test or a script that has
// no DATABASE_URL can still use it. Never includes the credentials.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

export function databaseLabel(url: string | undefined): string {
  if (!url) return 'DATABASE_URL is not set'
  try {
    const u = new URL(url)
    const where = isLocalDatabase(url) ? 'local' : 'REMOTE'
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname} (${where})`
  } catch {
    return 'an unreadable DATABASE_URL'
  }
}

// First line of a script's output: the database it is about to change.
export function announceDatabase(): void {
  console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
}

// For the scripts that wipe or fabricate data (the world seed truncates users and places; the demo
// account has a published password). There is no override: a remote database is never the place for
// them, and a typo in the URL is exactly how one would end up there.
export function refuseRemoteDatabase(script: string): void {
  const url = process.env.DATABASE_URL
  if (isLocalDatabase(url)) return
  throw new Error(
    `${script} only runs against a local database, and DATABASE_URL points at ${databaseLabel(url)}. ` +
      'Unset DATABASE_URL (the local .env is used) or point it at localhost.',
  )
}
