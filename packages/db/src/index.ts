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
// The one ranking-score formula — see score.ts's header for why this used to
// have a silent second copy.
export { scoreFor } from './score'
// The closed dish-category taxonomy + keyword guesser (M11) — shared by the
// API's validation/GET /categories/backfill and, as a mirrored matcher only
// (Metro can't import this workspace), apps/mobile/src/lib/dishCategories.ts.
export {
  DISH_CATEGORIES,
  DISH_GROUPS,
  type DishCategory,
  type DishGroup,
  guessDishCategory,
} from './dishCategories'
