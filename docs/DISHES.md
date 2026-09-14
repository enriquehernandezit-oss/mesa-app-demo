# Mesa — Dishes, as built today

Written as a self-contained briefing for designing a new dish-related algorithm
elsewhere (a different Claude session with no repo access). Send this file
alongside `docs/FEATURES.md` (what the whole app does) and, if the algorithm's
design needs to respect build discipline, `CLAUDE.md` (hard rules, stack). This
file is the deep dive on the one part those two only mention in passing.

## 1. The core idea — a dish is evidence, not an object

A dish post is **a photo attached to one of your own rankings**. It cannot
exist independent of a ranking: you can only post a dish for a place you've
already ranked (`rank_it_first` is a real 400 error the API returns
otherwise). This mirrors Mesa's whole worldview — **a score is always
attributed to a person** — extended to dishes: a dish is always attributed to
*whoever ranked that place*, never a bare "the branzino here is good."

There is currently **no dish-level ranking, scoring, search result, or
cross-restaurant discovery surface**. A dish's name is free text a poster
typed (`"Branzino a la sal"`); it is not a canonical, deduplicated entity.
Two different posters at the same restaurant can name visibly the same plate
two different ways, and nothing today reconciles that. This is almost
certainly the gap a "dishes algorithm" is meant to close — canonicalizing dish
names, ranking/recommending them, or surfacing a "best dish at this place"
signal — so treat every fact below as the *current* ceiling, not a
constraint to preserve.

## 2. Schema (`packages/db/src/schema/`)

### `dishes` (`content.ts`)

```ts
export const dishes = pgTable(
  'dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    rankingId: uuid('ranking_id').notNull().references(() => rankings.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Normalized for search — a generated column, not an expression index.
    nameKey: text('name_key').generatedAlwaysAs((): SQL => sql`mesa_norm(${sql.identifier('name')})`),
    caption: text('caption'),
    imageId: text('image_id').notNull(),
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
production; it is decorative, not a data signal.

### `rankings.favoriteDish` and `rankings.tags` (`ranking.ts`)

```ts
export const rankings = pgTable('rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),   // dense 1..n, the pairwise ordering
  score: doublePrecision('score').notNull(), // derived 0–100 from position
  tags: text('tags').array(),                // e.g. "date night", "terraza"
  favoriteDish: text('favorite_dish'),        // free-text "what to order" — NOT the same table as dishes
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('rankings_user_restaurant_uq').on(t.userId, t.restaurantId), // one ranking per user per place
  index('rankings_user_position_idx').on(t.userId, t.position),
  index('rankings_restaurant_idx').on(t.restaurantId),
])
```

**Important distinction a dish algorithm needs to know:** `rankings.favoriteDish`
is a separate, lighter-weight concept from a `dishes` row — a one-line
free-text answer to "what should someone order here," entered on *every*
ranking whether or not a photo was attached. A `dishes` row only exists when
the person also posted a photo. When a rank flow ends with a photo, the API
call (`alsoFavorite: true`) copies the dish's `name` into
`rankings.favoriteDish` so the two stay in sync for that one ranking — but
there is no foreign key between them, and a `favoriteDish` string never
becomes a `dishes` row on its own. **Any canonicalization/algorithm work
should decide explicitly whether it unifies these two text sources or treats
them separately** — today nothing does.

Scores are stored 0–100 (int-ish `doublePrecision`), shown to users divided by
10 with one decimal (`displayScore()` in `apps/mobile/src/lib/display.ts`).
**Mesa never shows a bare rating for a place or a dish** — every number on
screen is attributed to a specific person (see `docs/FEATURES.md` §1's "a
score is always attributed to a person" rule). A dish algorithm that produces
something like "this dish scores 8.7" must still answer *whose* 8.7 it is, or
reframe it as a count/signal (e.g. "4 amigos lo pidieron") rather than an
implied global rating.

## 3. API (`apps/api/src/routes/dishes.ts`, mounted at `/dishes`)

| Method + path | Purpose |
|---|---|
| `POST /dishes` | Create a dish post. Body: `{ restaurantId, name (≤60), caption? (≤140), image (data: or https: URL, ≤700KB), grain, visibility, alsoFavorite? }`. Requires an existing ranking for that restaurant by the caller (`400 rank_it_first` otherwise). |
| `GET /dishes/restaurant/:id` | Popular dishes at a place — up to 12, newest first, visible ones only (mine, `visibility: 'public'`, or posted by someone I follow), block-filtered symmetrically, soft-removed excluded. One query, filter is in the `WHERE` (a prior bug filtered visibility in JS *after* `.limit(12)`, which under-returned whenever a blocked poster occupied a top slot — now fixed). |
| `GET /dishes/:id` | One dish + its linked ranking's score + the linked restaurant's characteristics + `posterIsMe`. Same visibility rule as above, checked explicitly (not just via the list query). Malformed ids are rejected as `404` before they'd otherwise reach Postgres as an invalid UUID cast. |
| `DELETE /dishes/:id` | Soft-remove — only the poster's own dish (`404` otherwise, not `403`, so you can't probe whether a dish id exists). |

No `PATCH` — a dish's caption/name/grain cannot be edited after posting, only
deleted.

**Search touchpoint** (`apps/api/src/routes/restaurants.ts`): Explore's search
matches a restaurant if the query fuzzy-matches (trigram, via `dishes.nameKey`)
a dish posted there — "branzino" can surface a restaurant because someone
posted a branzino dish, not because the restaurant itself is named that. This
returns the **restaurant** as a hit, never a dish-level result. There is no
"search all dishes across the city" surface today.

## 4. Mobile surfaces

| Screen | What it does |
|---|---|
| `apps/mobile/src/app/dish/index.tsx` | Standalone dish composer (`presentation: 'modal'`), 2 steps: pick/shoot a photo + choose a grain treatment, then name + caption + visibility. Gated on having already ranked the place — reached from the restaurant profile's "+ Agregar un plato" only when `canAdd` (a ranking exists). |
| `apps/mobile/src/app/dish/[dishId].tsx` | Read-only dish detail: hero photo, caption, the linked ranking as an attributed place card (poster's score, via `ScoreBadge attribution={{kind:'stated'}}`), delete (own) / report (others'). |
| `apps/mobile/src/app/rank.tsx`'s `NoteStep` | The primary dish-creation path in practice — *inside* the rank flow, not the standalone composer above. After the score reveals, the note step has a "Qué pedir" field (free text → `rankings.favoriteDish`) with an optional "attach a photo" chain (`dishImage`/`dishGrain` state) that, on "Guardar nota," fires both `POST /rankings` (with `favoriteDish`) and `POST /dishes` (with `alsoFavorite: true`) in one tap — see `rank.tsx`'s `save` mutation. |
| Restaurant profile (`r/[restaurantId].tsx`)'s `PopularDishes` | A horizontal photo rail of up to 12 dishes at that place, hitting `GET /dishes/restaurant/:id`; tapping a card opens `dish/[dishId].tsx`. |
| Discover feed (`(tabs)/discover.tsx`)'s `FeedCard` (dish-photo variant) | When a feed item has `dishImage`, the card is photo-led: the dish photo, poster attribution, `#N en su lista` (the ranking's position). Links to `/dish/:id` when `dishId` exists, else falls back to the restaurant. |

## 5. What does NOT exist yet (the actual gap to design against)

- No canonical/deduplicated dish entity — `dishes.name` and
  `rankings.favoriteDish` are both free text, unreconciled across posters.
- No dish-level score, ranking, or "best dish" aggregate anywhere.
- No dish search results screen (dish names only ever surface a *restaurant*
  hit in Explore).
- No recommendation engine of any kind, for dishes or otherwise (see
  `docs/ROADMAP.md`'s Pillar 1 for where "taste graph recs" sits on the
  product roadmap — post-launch, not built).
- No signed Cloudinary uploads — every dish image today is a client-resized
  data URL round-tripped through Postgres as text. An algorithm that assumes
  async image processing (embeddings from a photo, OCR on a menu, etc.) needs
  that pipeline built first; it is explicitly listed as not-yet-built in
  `docs/FEATURES.md` §10.
- No dish categorization/cuisine-of-dish tagging beyond the restaurant's own
  `cuisine` field and the free-text name.

## 6. Constraints that apply to whatever gets built here

From `CLAUDE.md` (send it too if the algorithm needs to know build discipline,
not just product shape): Bun only, TypeScript strict with no `any`, Drizzle
relational queries/joins (never a loop of queries — N+1 is a hard no),
connection pooling already centralized in `packages/db`, TanStack Query owns
client-side caching, Biome not ESLint, "essential complexity only" (no
speculative abstraction), one milestone at a time with a stop for review
between them, and — the one most likely to matter for a *dishes* feature
specifically — **no stars, no bare/global ratings, ever.** Any scoring the new
algorithm introduces has to either be attributed to specific people (the
existing pattern) or reframed as a count/signal, never an implied objective
rating. Copy is Spanish-first, informal *tú* (see `docs/DESIGN.md`'s
"Language & voice" section).
