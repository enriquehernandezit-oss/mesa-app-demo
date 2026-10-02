import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

// THE connection pool — configured once, here, and nowhere else. Every consumer
// (API, seed, migrate) imports `db` from this module; no one constructs their
// own Pool or client. This is the single place pooling is tuned.
//
// node-postgres pools by default: it hands out and reuses a bounded set of
// connections instead of opening one per query. `max` caps concurrent
// connections so we never exhaust Postgres' limit under load.

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set — see .env.example')
  }
  return url
}

export const pool = new Pool({
  connectionString: requireDatabaseUrl(),
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // TCP keep-alive: a connection that sits idle between requests is probed, so a proxy or the network
  // between the API and Postgres does not silently drop it and leave the next request waiting on a dead
  // socket.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
})

// An IDLE connection can still die (Postgres restarts, the network resets it). node-postgres reports that as
// an 'error' event on the pool, and an event with no listener is an uncaught exception — it would take the
// whole API process down, and every request in flight with it. The pool already throws the dead client away
// and opens a fresh one for the next query, so the right response is to note it and carry on.
pool.on('error', (err) => {
  console.error('postgres: idle connection error (the pool replaces it)', err.message)
})

// The Drizzle client, schema-aware so relational queries (db.query.*) work and
// stay single-round-trip.
export const db = drizzle(pool, { schema })

export type Db = typeof db
