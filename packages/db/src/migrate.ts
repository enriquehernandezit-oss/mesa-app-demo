import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './client'

// Applies generated migrations from ./drizzle against the pooled client.
// Run with: bun run --env-file=.env src/migrate.ts  (or `bun db:migrate`).
await migrate(db, { migrationsFolder: `${import.meta.dir}/../drizzle` })
await pool.end()
console.log('migrations applied')
