# Mesa — Dishes, as built today

Written as a self-contained briefing for designing a new dish-related algorithm
elsewhere (a different Claude session with no repo access). Send this file
alongside `docs/FEATURES.md` (what the whole app does) and, if the algorithm's
design needs to respect build discipline, `CLAUDE.md` (hard rules, stack). This
file is the deep dive on the one part those two only mention in passing.

## 1. The core idea — a dish is evidence, not an object

A dish post is **attached to one of your own rankings** — a name, a required
category, and _optionally_ a photo. It cannot exist independent of a ranking:
you can only log a dish for a place you've already ranked (`rank_it_first` is
a real 400 error the API returns otherwise). This mirrors Mesa's whole
worldview — **a score is always attributed to a person** — extended to
dishes: a dish is always attributed to _whoever ranked that place_, never a
bare "the branzino here is good."

**`rankings.favoriteDish` is now fully derived from `dishes` — it is not an
independent free-text field.** As of the "Dish entity foundation" milestone,
every rank flow's "Qué pedir" step selects or creates real `dishes` rows (with
a category and an optional 3-way sentiment: `loved | fine | disliked`,
matching Mesa's place-sentiment wording); the first selected dish's name is
copied into `favoriteDish` via `alsoFavorite: true` on `POST /dishes`, and
`DELETE /dishes/:id` clears `favoriteDish` back to null if it matches the
deleted dish. There is no longer a way to write `favoriteDish` directly — it
was removed from `POST /rankings`'s body entirely.

Each dish is categorized from a **closed, 65-category taxonomy** (see §2) —
a keyword-guess pre-selects one, the member can always correct it. This is
one axis of dedup (a "carbonara" and a "spaghetti carbonara" both guess
`pasta`), but it is not full canonicalization: a dish's `name` is still free
text within its category, and two posters can still name the same plate two
different ways inside the same category. `nameKey` (a generated,
normalized column) is what any matching/aggregation is keyed on today — see
`GET /dishes/restaurant/:id/names` in §3.

There is currently **no dish-level ranking, dish score, or cross-restaurant
discovery surface** — logging a dish multiple times across restaurants
doesn't yet do anything with that fact. That is the explicitly-scoped _next_
milestone (personal "tu mejor carbonara" lists via pairwise comparison once a
member has logged the same dish 3+ times) — see §5.

## 2. Schema (`packages/db/src/schema/`)

### `dishes` (`content.ts`)

```ts
export const dishCategories = pgTable('dish_categories', {
  id: text('id').primaryKey(), // slug, e.g. "pasta", "ceviche", "otro"
  group: text('group').notNull(), // one of 15 cuisine/course groups, e.g. "italiano"
  nameEs: text('name_es').notNull(), // fallback label if an i18n key is missing client-side
  sortOrder: integer('sort_order').notNull(),
  active: boolean('active').notNull().default(true),
})

export const dishes = pgTable(
  'dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rankingId: uuid('ranking_id')
      .notNull()
      .references(() => rankings.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Normalized for search — a generated column, not an expression index.
    nameKey: text('name_key').generatedAlwaysAs(
      (): SQL => sql`mesa_norm(${sql.identifier('name')})`,
    ),
    caption: text('caption'),
    imageId: text('image_id'), // nullable — a dish can be logged with no photo (M11)
    categoryId: text('category_id').references(() => dishCategories.id), // nullable until 0016
    sentiment: text('sentiment'), // loved | fine | disliked, nullable
    grain: text('grain').notNull().default('none'), // candlelit | daylight | none
    visibility: text('visibility').notNull().default('friends'), // friends | public
    removedAt: timestamp('removed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('dishes_restaurant_idx').on(t.restaurantId, t.createdAt),
    index('dishes_user_idx').on(t.userId, t.createdAt),
    index('dishes_ranking_idx').on(t.rankingId),
    index('dishes_name_key_trgm_idx').using('gin', sql`${t.nameKey} gin_trgm_ops`),
  ],
)
```

`restaurantId` is deliberately denormalized (also reachable via
`rankingId → rankings.restaurantId`) because "popular dishes at this place" is
the hot read path and this makes it one indexed query instead of a join.
`imageId` is a **client-resized data URL today** (no Cloudinary signed uploads
wired yet — see §7); in production this same field would hold a Cloudinary
public id. `removedAt` is soft-delete, required for UGC moderation (App Store
1.2) — a removed dish is retained for audit but filtered out of every read.
`grain` is a capture-time film-treatment choice the poster makes (`candlelit`
= warm/oxblood tint, `daylight` = neutral, `none`), a Cloudinary transform in
production; it is decorative, not a data signal — and meaningless (and
un-set) when there is no photo.

`dishCategories` is a small, migration-seeded, closed list (65 rows, 15
groups — Dominicano, Español, Mediterráneo, Italiano, Francés, Americano,
Mexicano y Latino, Asiático, Del mar, Carnes, Entradas/verde/sopas, Desayuno y
pan, Dulce, Bebidas, Otro). `guessDishCategory(name)`
(`packages/db/src/dishCategories.ts`, mirrored client-side in
`apps/mobile/src/lib/dishCategories.ts` since Metro can't import the
workspace) does whole-word/phrase matching against each category's keyword
list on `mesa_norm(name)`; **the longest matching keyword wins**, ties break
on lower `sortOrder`, no match falls to `otro`. Every dish gets a guessed
category at write time (the picker pre-selects it; the member can always
correct it before saving) — `categoryId` is nullable in the schema only
because the backfill for pre-existing rows runs as a separate script after
the migration lands (`bun run backfill:dishes`, see `docs/DEPLOY.md`); the API
always writes one on every new row, and a later migration (0016) tightens the
column to `NOT NULL` once a production backfill report confirms zero
stragglers.

### `rankings.favoriteDish` and `rankings.tags` (`ranking.ts`)

```ts
export const rankings = pgTable(
  'rankings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(), // dense 1..n, the pairwise ordering
    score: doublePrecision('score').notNull(), // derived 0–100 from position
    tags: text('tags').array(), // e.g. "date night", "terraza"
    favoriteDish: text('favorite_dish'), // derived — see below, never written directly
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('rankings_user_restaurant_uq').on(t.userId, t.restaurantId), // one ranking per user per place
    index('rankings_user_position_idx').on(t.userId, t.position),
    index('rankings_restaurant_idx').on(t.restaurantId),
  ],
)
```

`favoriteDish` is unified with `dishes` now, not a separate text source (this
used to be the opposite — see the file history if you need the old
free-text-only design). `POST /rankings` no longer accepts a `favoriteDish`
field at all; it is set exclusively via `POST /dishes {..., alsoFavorite:
true}` (copies that dish's `name`) and cleared via `DELETE /dishes/:id` when
the deleted dish's name matches. A ranking can still have a null
`favoriteDish` — the "Qué pedir" step is always skippable.

Scores are stored 0–100 (int-ish `doublePrecision`), shown to users divided by
10 with one decimal (`displayScore()` in `apps/mobile/src/lib/display.ts`).
**Mesa never shows a bare rating for a place or a dish** — every number on
screen is attributed to a specific person (see `docs/FEATURES.md` §1's "a
score is always attributed to a person" rule). A dish algorithm that produces
something like "this dish scores 8.7" must still answer _whose_ 8.7 it is, or
reframe it as a count/signal (e.g. "4 amigos lo pidieron") rather than an
implied global rating.

## 3. API (`apps/api/src/routes/dishes.ts`, mounted at `/dishes`)

| Method + path                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /dishes/categories`           | The closed taxonomy: `{ groups: [{id, nameEs}], categories: [{id, group, nameEs, sortOrder, keywords}] }`. `Cache-Control: private, max-age=60`; the client also holds it in TanStack with a 60-minute `staleTime` since it's a migration-seeded list that rarely changes.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GET /dishes/restaurant/:id/names` | Aggregated dish names at a place, for the rank flow's chip search: `{ names: [{nameKey, label, count, categoryId}] }`, top 20 by count, grouped on `nameKey` (`mode()` picks the most-common surface form of the name and category). No poster identity, no visibility filter — this is a pure aggregate, by design. 60s cache.                                                                                                                                                                                                                                                                                                                                                    |
| `POST /dishes`                     | Create (or upsert) a dish. Body: `{ restaurantId, name (≤60), categoryId (required, validated against active categories → 400 unknown_category), sentiment? ('loved'\|'fine'\|'disliked'), caption? (≤140), image? (data: or https: URL, ≤700KB), grain, visibility, alsoFavorite? }`. **`image` is optional** — a photo-less post upserts on `(rankingId, nameKey, imageId IS NULL, removedAt IS NULL)` instead of always inserting, so retrying a failed sequential post (see §4) never duplicates. Requires an existing ranking for that restaurant by the caller (`400 rank_it_first` otherwise). `alsoFavorite: true` copies this dish's `name` into `rankings.favoriteDish`. |
| `GET /dishes/restaurant/:id`       | Popular dishes at a place — up to 12, newest first, **photo-led only** (`imageId is not null`), visible ones only (mine, `visibility: 'public'`, or posted by someone I follow), block-filtered symmetrically, soft-removed excluded. One query, filter is in the `WHERE` (a prior bug filtered visibility in JS _after_ `.limit(12)`, which under-returned whenever a blocked poster occupied a top slot — now fixed).                                                                                                                                                                                                                                                            |
| `GET /dishes/:id`                  | One dish + its linked ranking's score + the linked restaurant's characteristics + `posterIsMe`. Same visibility rule as above, checked explicitly (not just via the list query). Malformed ids are rejected as `404` before they'd otherwise reach Postgres as an invalid UUID cast.                                                                                                                                                                                                                                                                                                                                                                                               |
| `DELETE /dishes/:id`               | Soft-remove — only the poster's own dish (`404` otherwise, not `403`, so you can't probe whether a dish id exists). Also clears `rankings.favoriteDish` back to null if it matched the deleted dish's name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

No `PATCH` — a dish's caption/name/grain/category cannot be edited after
posting, only deleted (except the category, correctable inline before save on
the client, and re-set via a fresh upsert while a photo-less row is still
being assembled in the same rank flow).

Hono registers `/categories` and `/restaurant/:id/names` **before** the
generic `/:id` route — route order matters here, or `/:id`'s uuid-format
guard would 404 them.

**Search touchpoint** (`apps/api/src/routes/restaurants.ts`): Explore's search
matches a restaurant if the query fuzzy-matches (trigram, via `dishes.nameKey`)
a dish posted there — "branzino" can surface a restaurant because someone
posted a branzino dish, not because the restaurant itself is named that. This
returns the **restaurant** as a hit, never a dish-level result. There is no
"search all dishes across the city" surface today.

## 4. Mobile surfaces

| Screen                                                                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/app/dish/index.tsx`                                    | Standalone dish composer (`presentation: 'modal'`), **name-first**: a name field, then a required category (`DishCategoryPicker`, pre-selected from `guessDishCategory(name)` until the member picks one), then an _optional_ photo + grain treatment, then caption + visibility. `canPost` only needs a name and a category — never gated on a photo. Gated on having already ranked the place — reached from the restaurant profile's "+ Agregar un plato" only when `canAdd` (a ranking exists).                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `apps/mobile/src/app/dish/[dishId].tsx`                                 | Read-only dish detail: hero photo when `imageId` is set, else a plain name-led header (no hero, no grain pill — grain is meaningless without a photo); caption; a category caption under the name; the linked ranking as an attributed place card (poster's score, via `ScoreBadge attribution={{kind:'stated'}}`); delete (own) / report (others').                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apps/mobile/src/app/rank.tsx`'s `NoteStep`                             | The primary dish-creation path in practice — _inside_ the rank flow, not the standalone composer above. After the score reveals, the "Qué pedir" step is a debounced chip search over `GET /dishes/restaurant/:id/names` (existing names as tap-to-select chips, a "+ Agregar" chip for a new name, up to 3 selected); each selected dish gets an inline category (pre-guessed, correctable via `DishCategoryPicker`, auto-expanded when the guess is `otro`) and an optional 3-chip sentiment (`loved`/`fine`/`disliked`, same wording as place sentiment). The optional photo block attaches only to the _first_ selected dish. "Guardar nota" fires one `POST /rankings` (no `favoriteDish` in the body) followed by a sequential `POST /dishes` per selected dish — the first with `alsoFavorite: true` and the photo (if any) — see `rank.tsx`'s `save` mutation. Skipping the step (nothing selected) leaves `favoriteDish` null. |
| Restaurant profile (`r/[restaurantId].tsx`)'s `PopularDishes`           | A horizontal photo rail of up to 12 **photo-led** dishes at that place, hitting `GET /dishes/restaurant/:id`; tapping a card opens `dish/[dishId].tsx`. A photo-less dish never appears here — the endpoint filters it out server-side.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Discover feed (`(tabs)/discover.tsx`)'s `FeedCard` (dish-photo variant) | When a feed item has `dishImage`, the card is photo-led: the dish photo, poster attribution, `#N en su lista` (the ranking's position). Links to `/dish/:id` when `dishId` exists, else falls back to the restaurant. A photo-less dish never produces this card — `feed.ts`'s `latestDish` subquery requires `imageId is not null`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 5. What does NOT exist yet (the actual gap to design against)

- **No dish-level ranking, dish score, or cross-restaurant "best dish"
  surface** — this is the explicitly-scoped _next_ milestone. Every logged
  dish now carries `userId`, `restaurantId`, `categoryId`, `nameKey`, and
  `sentiment`, which is exactly the shape a "you've had _carbonara_ at 3
  places — ¿las rankeas?" nudge needs (a grouped query on `(userId,
nameKey)` with `count >= 3`, surfaced right after the Nth log), plus a
  passive "tus platos" surface. Cross-venue comparison would be scoped to a
  category, never to `otro`.
- **`nameKey` collisions across languages/spellings still aren't
  reconciled** — "pulpo" and "octopus," or two spellings of the same plate,
  stay separate entities. The category taxonomy (§2) narrows this somewhat
  (both would at least land in `mariscos`) but doesn't solve it; full
  canonicalization/dedupe tooling is out of scope for the foundation
  milestone and explicitly deferred to whichever milestone builds the
  cross-restaurant surfaces above.
- No dish search results screen (dish names only ever surface a _restaurant_
  hit in Explore).
- No recommendation engine of any kind, for dishes or otherwise (see
  `docs/ROADMAP.md`'s Pillar 1 for where "taste graph recs" sits on the
  product roadmap — post-launch, not built).
- No signed Cloudinary uploads — every dish image today is a client-resized
  data URL round-tripped through Postgres as text. An algorithm that assumes
  async image processing (embeddings from a photo, OCR on a menu, etc.) needs
  that pipeline built first; it is explicitly listed as not-yet-built in
  `docs/FEATURES.md` §10.

## 6. Constraints that apply to whatever gets built here

From `CLAUDE.md` (send it too if the algorithm needs to know build discipline,
not just product shape): Bun only, TypeScript strict with no `any`, Drizzle
relational queries/joins (never a loop of queries — N+1 is a hard no),
connection pooling already centralized in `packages/db`, TanStack Query owns
client-side caching, Biome not ESLint, "essential complexity only" (no
speculative abstraction), one milestone at a time with a stop for review
between them, and — the one most likely to matter for a _dishes_ feature
specifically — **no stars, no bare/global ratings, ever.** Any scoring the new
algorithm introduces has to either be attributed to specific people (the
existing pattern) or reframed as a count/signal, never an implied objective
rating. Copy is Spanish-first, informal _tú_ (see `docs/DESIGN.md`'s
"Language & voice" section).
