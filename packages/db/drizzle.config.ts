import { defineConfig } from 'drizzle-kit'

// drizzle-kit reads DATABASE_URL from the environment (loaded via `bun --env-file`
// or the shell). Migrations are generated from the schema and written to
// ./drizzle, then applied by src/migrate.ts against the pooled client.
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set — see .env.example')

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
