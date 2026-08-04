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
})

// The Drizzle client, schema-aware so relational queries (db.query.*) work and
// stay single-round-trip.
export const db = drizzle(pool, { schema })

export type Db = typeof db
