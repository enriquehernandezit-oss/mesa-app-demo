# Mesa — how to keep restaurant facts complete and honest

A living runbook, not a one-time plan. Use it whenever you want to know how complete the
catalog is, fill what is missing from Google, or clear the invented phone numbers and
websites the seed left on real restaurants. The mobile app needs **no code changes** for
any of this: every screen already hides a button whose field is empty.

## What a place carries, and where each fact comes from

| fact                                                 | source                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| address, locality, phone, website, price tier, hours | **Google Places** (Place Details), on import and on the 30-day refresh          |
| cuisine                                              | the Top 100 sheet, else Google's place type mapped to Mesa's vocabulary         |
| name, cover photo                                    | Mesa's own — never overwritten by any script here                               |
| map pin and neighborhood                             | **Google**, for any place it confirms (`places:enrich`); seed pins were far off |
| menu                                                 | **you** — `docs/MENUS.md`. Google has none to give (see below)                  |
| tags ("date night", "terraza"…)                      | **members only**, via the rank flow. Deliberately not taken from Google         |
| scores                                               | members only. A place never gets a bare rating of its own (`docs/FEATURES.md`)  |

## What Google does not give us, so nobody re-litigates it

- **No menu.** A read of Café SBG with every field requested (`X-Goog-FieldMask: *`)
  returned 66 fields and none was a menu — no link, no dishes, no menu photos. The menu
  Google _Search_ shows for it is "Provided by PedidosYa", a delivery partner's feed, plus
  photos people uploaded. Neither is exposed by the Places API.
- **No amenity tags on purpose.** The API returns outdoor seating, live music, dog-friendly
  and more, but in a sample of well-known places most flags were "yes" for every one, and
  "serves cocktails" is not "great cocktails". Tags are the members' own words.
- **No rating, reviews or photos.** Mesa's rule is that a score always belongs to a person;
  Google's 4.5★ would break it. Photos and reviews also can't be stored.
- **No peso price range.** Present on roughly one place in five, so the `$`–`$$$$` tier is
  used alone.

## Google's caching rule

Only the `place_id` may be stored indefinitely. Everything else copied from a Place Details
response has to be refreshed within 30 days, so:

- opening a profile whose data is older than 30 days refreshes it in the background
  (`refreshFromGoogle`, `apps/api/src/routes/restaurants.ts`);
- **that refresh overwrites unconditionally, including with `null`** when Google no longer
  has a value. That is the compliant behavior, but it means a value Google never had (a
  price tier the seed set by hand, say) can disappear the first time a stale profile is
  opened;
- `places:enrich` keeps its raw-response cache for at most 30 days for the same reason.

Every profile with a `google_place_id` shows **Powered by Google**, since its facts are
Google's.

## The three commands

```bash
# 1. How complete is it? Read-only, no Google calls, safe against production.
DATABASE_URL="<url>" bun run places:audit

# 2. What would filling it change? Calls Google, writes nothing to the database.
GOOGLE_PLACES_API_KEY=... DATABASE_URL="<url>" bun run places:enrich --dry-run

# 3. Apply it. Idempotent — a second run reports no change.
GOOGLE_PLACES_API_KEY=... DATABASE_URL="<url>" bun run places:enrich
```

`places:enrich` also takes `--only=<id or part of a name>`, `--limit=N`, and `--refresh`
(ignore the response cache). Run from `apps/api`.

### What the enrich rule does — Google is the source of truth, with one safeguard

The safeguard: **a hit is only believed if Google itself says it is somewhere you eat or
drink** (any of its place types — `restaurant`, `bar`, `steak_house`, `bakery`… — not just the
primary one). A name match alone is not enough: searching for "Cantábrico" returned a
condominium, "El Agave" a liquor store, "La Alpargatería" a shoe shop, "Marocha" a hair salon.

- **Empty fields are filled; a field that already has a value is never overwritten.** name
  and the cover photo are never touched.
- An **invented contact** — the seed's placeholder phone (`+1809555XXXX`) or guessed
  homepage (`https://<name>.do`) — is replaced with Google's real value, or cleared when
  Google has none. A fake is worse than nothing. The definition lives in
  `apps/api/src/lib/placeContacts.ts` and is shared with `catalog:clean` and the audit.
- **The map pin follows Google.** The seed's hand-placed pins were often far off (up to
  5.6 km), which sends "Cómo llegar" to the wrong place. A pin more than 50 m from Google's
  moves to it, and the **neighborhood is re-resolved** the way the importer does for a new
  place. (Catalog places were imported from Google, so their pins already match.)
- **A place Google reports permanently closed is closed** — the same call the 30-day refresh
  already makes. Nothing is deleted; `restaurant:close "<name>" --reopen` undoes it.
- A place with no `google_place_id` is found by name (Text Search) and must be inside Santo
  Domingo, agree on the name, and be an eating place. **Distance from Mesa's old pin is not
  a test** — the pin is what is being corrected. A miss is **reported, never guessed**.

### Reading the dry run

Read the lists at the bottom before running for real. Each change also says whether the place
was matched by name, and how far its pin moves.

| list                                         | what it means                                                                                                                                                                                                               | what to do                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Google found no restaurant by that name**  | The hit failed a test, and the line shows what Google returned: `name_mismatch` (a different business), `not_food` (a shop or condo), `out_of_bounds` (another city — Segundo Muelle's only Google entry is in Panama City) | Untouched. Google has no such place under that name; it may be renamed or not real. Leave or fix by hand. |
| **Google id already belongs to another row** | Google's answer is a place Mesa already has under another row — a **duplicate** (a seed row and its real catalog twin)                                                                                                      | Untouched. Merge them with `places:merge` (below).                                                        |
| **Google says this is not a restaurant**     | A row already carrying a Google id whose Google type is a shop, not somewhere to eat — usually a wrong import by name (a bookstore, a liquor store)                                                                         | Untouched. If it does not belong, `places:remove` deletes it (below).                                     |

### After enrich: clear what it couldn't fix

Places that were unmatched or duplicated still carry the seed's invented contacts.
The run ends by counting them. Once you've reviewed the lists:

```bash
DATABASE_URL="<url>" bun run catalog:clean --dry-run   # then without --dry-run
```

That nulls exactly the invented phones and homepages and nothing else. Then run
`places:audit` again.

### What will still be empty

`places:enrich` can only fill what Google has. Some gaps are Google's, and only you can
close them: a place with no price level, no website (it may only have Instagram), or no
phone stays empty. `places:audit` shows how many.

## Merging duplicates

The same restaurant often exists twice — a seed row and its real catalog twin, or two spellings.
`places:merge` folds them into the one worth keeping. **Never bare-`DELETE` the twin you don't
want:** thirteen tables point at a restaurant, so deleting one would cascade away members'
rankings and leave a hole in their ranked lists (positions are dense 1..n and scores derive from
position), and it would destroy the menu, Google id and real pin that usually sit on the _other_
twin.

```bash
DATABASE_URL="<url>" bun run places:merge "<name>" ["<name>" …] [--rename "<name>"] --dry-run
DATABASE_URL="<url>" bun run places:merge "<name>" ["<name>" …] [--rename "<name>"]
```

Name the rows of **one** duplicate group. A name that matches two rows ("Laurel", once as the
seed row and once as the catalog row) contributes both.

**Which row is kept:** the one with the most reviews (rankings), then the one with a photo, then
the oldest. If it lacks the photo it takes it from the row being dropped. **What comes across**,
so nothing of the dropped row is lost:

| what                                                                      | how                                                                                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| members' rankings                                                         | carried over in the same slot; a member who ranked **both** keeps their better entry (with its dishes, cheers, comments), and their list is rewritten dense |
| vibe notes                                                                | a member with a note on both keeps the newer                                                                                                                |
| saves, collection entries, curated-list / dish-list entries, plan options | carried over; where both twins were in the same list the survivor keeps the better position and the list is renumbered                                      |
| dishes, events, notifications, plan votes, a plan's chosen place          | repointed                                                                                                                                                   |
| the menu                                                                  | moves if the survivor has none (a menu is owned whole by whatever wrote it)                                                                                 |
| Google id, real pin, neighborhood, address, contacts                      | taken from a Google-backed twin, the way `places:enrich` would; an invented phone/website is replaced, never handed on                                      |

`--dry-run` does the whole merge inside a transaction and **rolls it back**, so its counts are
exactly what the real run would do. The whole group is one transaction: it either all happens or
none of it does. It refuses on a name that matches nothing, on a single row, and on rows that
carry two _different_ Google ids (two Google places are not duplicates).

The seven duplicates Google confirmed (Ichiban and Shibuya are both Shibuya Ichiban):

```bash
bun run places:merge "Buche' Perico" "Buche Perico"
bun run places:merge "Ichiban" "Shibuya" "Shibuya Ichiban" --rename "Shibuya Ichiban"
bun run places:merge "Il Bacareto"
bun run places:merge "Laurel"
bun run places:merge "LILA - Modern Cuisine"
bun run places:merge "Restaurante Gijón" "Restaurante Gijon"
```

Run each with `--dry-run` first. Use the exact spelling; the script refuses a name it can't find.

## Removing a place

```bash
DATABASE_URL="<url>" bun run places:remove "<exact name>" --dry-run
DATABASE_URL="<url>" bun run places:remove "<exact name>"
```

Unlike `restaurant:close`, which only hides a place that closed, this **deletes** the row and
everything attached to it, and rewrites each affected member's list so it has no hole. It
matches the exact name and refuses unless exactly one live row has it. It also **refuses if any
member has ranked the place**, unless you pass `--force` — so a row that turns out to have
real reviews is not deleted by accident. Removing a row does not stop the Top 100 importer
re-adding it from the sheet, so drop its entry from `apps/api/data/top100.json` too (Mamey
Librería Café, rank 42, was removed that way).

## Cost

Place Details on the fields Mesa requests is billed on Google's **Enterprise** SKU, and
Google's plans include a monthly free allowance per SKU. A full backfill is one call per
place — a few hundred at most — plus one Text Search for each place with no id yet.
`--dry-run` prints the exact number of live calls before anything is billed, and a re-run
within 30 days is served from the cache. Confirm the allowance against your own billing
console before a production run.

## Shipping order

This is API and database only: push → Railway runs `db:migrate` before the deploy →
`curl /health` → then, against production with the production `DATABASE_URL` (never from a
session that isn't yours), in this order:

1. `places:audit` — the starting picture.
2. `places:merge` — each duplicate group, `--dry-run` first. Merging first means the
   enrichment below has no duplicates to trip over, and each survivor already carries its
   twin's Google facts and menu.
3. `places:remove` — anything that should not be in Mesa, `--dry-run` first.
4. `places:enrich --dry-run` → read the change list → `places:enrich`.
5. `catalog:clean --dry-run` → `catalog:clean` — clears the invented contacts left on places
   Google could not match.
6. `places:audit` — the finishing picture.

Every step that changes data has a `--dry-run` that rolls back, and every one is safe to
re-run.
