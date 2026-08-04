import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Mirrors the pre-launch quiz's waitlist so quiz-takers are already known when
// they open the app (zero visual/identity seam — DESIGN.md). The quiz's exact
// columns aren't in this repo, so this is a minimal superset: a contact and the
// quiz result. Widen to match the real export when it lands.
export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  phone: text('phone'),
  instagramHandle: text('instagram_handle'),
  quizResult: text('quiz_result'), // e.g. the "¿Qué tipo de foodie eres?" outcome
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
