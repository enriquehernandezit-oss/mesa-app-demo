import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

// The target zones (reference/enum-like). A table, not a pgEnum, because
// restaurants and users FK to it and we want a display name alongside the slug.
// Seeded with the five neighborhoods from CLAUDE.md.
// Kept import-free so both auth and discovery modules can reference it without a
// circular dependency.
export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(), // piantini, naco, bella-vista, serralles, zona-colonial
  name: text('name').notNull(),
})
