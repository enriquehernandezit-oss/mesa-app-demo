// @mesa/db — the single source of truth for the database.
//
//   - the pooled Postgres client (`db`, `pool`) configured ONCE in client.ts
//   - the Drizzle schema, imported by the API and (for types only) the app.
//     This is the "typed end to end" guarantee.
export { db, pool, type Db } from './client'
export * as schema from './schema'
// Pure name/distance matchers shared by the bulk importers (M5, M6) — see
// placeMatchPure.ts's own header for why these live outside any one importer.
export { haversineM, mesaNorm, trigramSimilarity } from './placeMatchPure'
