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

Google lets you keep only the `place_id` indefinitely. For everything else copied from a Place
Details response its policy allows no long-term storage (the older Maps terms allow only temporary
caching, up to 30 days, for performance). Mesa keeps those facts anyway — see "If you ever sell
data" below — and refreshes them after 30 days:

- opening a profile whose data is older than 30 days refreshes it in the background
  (`refreshFromGoogle`, `apps/api/src/routes/restaurants.ts`);
- **that refresh overwrites unconditionally, including with `null`** when Google no longer
  has a value. That keeps the stored copy honest, but it means a value Google never had (a
  price tier the seed set by hand, say) can disappear the first time a stale profile is
  opened;
- `places:enrich` keeps its raw-response cache for at most 30 days for the same reason.

Every profile with a `google_place_id` shows **Powered by Google**, since its facts are
Google's.

## If you ever sell data

Read this before building any data product. It records the reasoning from 2026-10-01 so it doesn't
have to be re-derived. It is **not legal advice**: have a lawyer check Google's current terms and
write the member-facing wording.

### 1. Google's facts are never part of what you sell

On any row with a `google_place_id`, these columns hold Google-derived content: `address`,
`locality`, `phone`, `website`, `price_tier`, `closes_at`, `cuisine` (mapped from Google's place
types), `lat` / `lng`, and a `neighborhood_id` resolved from Google's address. For catalog places the
`name` is Google's own spelling too. Google's Places policy exempts only the `place_id` from its
storage limits, and the older Maps terms also forbid building a business-listings database from the
content or passing it to third parties. (The current full terms would not load when this was
written — have a lawyer read them.)

So: **never export those columns, and never put them in a report, dataset or API you offer.** A report
about a restaurant's _own_ performance — numbers Mesa generated — is a different thing from handing
out Google's content. Comparisons against peers should be aggregate numbers ("the average for
Italian places in Piantini"), not a list of other venues' Google details.

Mesa already keeps these facts in its own database (the app needs them for filters, directions and its
pages) and refreshes them after 30 days — a common stance and a known trade-off, not strict
compliance. It matters more once there is a business built on top.

### 2. What you can build on is Mesa's own activity

Rankings, saves, cheers, dishes, lists and event RSVPs are the asset. This is why merging duplicates
matters: one row per venue means the counts are right.

### 3. Your own promises have to change first

The Privacy Policy says "No vendemos tus datos, no los alquilamos y no los cambiamos por publicidad";
the Terms say members' rankings, notes, photos, comments and lists are not sold or licensed to third
parties; the App Store questionnaire says no tracking (`docs/SUBMISSION.md`). Selling anything derived
from members needs:

- new wording, and **fresh consent** — the cheapest time to get it is while there are few members;
- an updated App Privacy label, and Apple's rules on sharing personal data (guideline 5.1.2);
- Dominican law: Ley 172-13 requires free, express, informed consent — with prior notice of the
  purpose and the recipients — before personal data goes to third parties.

Design for it from the start: **aggregates only**, a **minimum group size** before any number is shown,
**no private accounts**, no banned, blocked or deleted members, and account deletion honoured. Never
individual-level data.

### 4. Remove the fake members first

The seed created about 40 fake members with about 500 rankings. In the local database they hold 77% of
all rankings, and they inflate the numbers members see today. There is no "demo" flag on members. The
safe tell is a member with **none** of the ways a real person signs in: no sign-in account, no email, no
phone number and no session. (The seed marks its members as having accepted the EULA, so that doesn't
separate them.) Count them — this only reads:

```sql
select count(*) from "user" u
where not exists (select 1 from account a where a.user_id = u.id)
  and coalesce(u.email, '') = ''
  and u.phone_number is null
  and not exists (select 1 from session s where s.user_id = u.id);
```

Look at who it lists before deleting anyone. Remove the fake _members_ — not the demo restaurants:
`restaurants.is_demo` also decides which places the onboarding picker offers, and the merged places now
carry real members' rankings.

### 5. The long-term fix for the Google part

The original catalog plan (`docs/LOCATION_CATALOG_PLAN.md`) made Foursquare OS Places (Apache-2.0,
permanently storable) the system of record, with Google only as a live gap-filler — for exactly this
reason. If a data business becomes real, move the facts back to open-licensed data
(`packages/db/src/import-foursquare.ts` still exists) or owner-supplied data (a "claim your
restaurant" flow), and keep Google for live lookups by `place_id`.

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

The duplicates Google confirmed (2026-09-30) are built in, so one command does them all — and
**skips any that are not in the database you point it at**, which matters because production is
not a copy of your local data (see below):

```bash
DATABASE_URL="<url>" bun run places:merge-known --dry-run
DATABASE_URL="<url>" bun run places:merge-known
```

Its list is in `apps/api/src/places-merge-known.ts`: Buche' Perico, Ichiban + Shibuya + Shibuya
Ichiban (both seed rows are Google's "Shibuya Ichiban", so the kept row is renamed to it),
Il Bacareto, Laurel, LILA - Modern Cuisine, Restaurante Gijón. Each group is its own
transaction, so one that is missing is skipped and the rest go on; anything _wrong_ (two
different Google ids in one group) stops the run with the earlier groups already merged. For a
duplicate that is not on the list, use `places:merge` with its names, `--dry-run` first.

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

Place Details on the fields Mesa requests is billed on Google's **Enterprise** SKU, and Google's
plans include a monthly free allowance per SKU. A full backfill is one call per place, plus one
Text Search for each place with no id yet — a couple of hundred for a catalog this size.

**The `--dry-run` is what calls Google** — it needs the answers to plan from — and it caches them
for 30 days, so the real run right after makes no further calls. `places:enrich` prints how many
calls it is about to make before it makes any, and **refuses more than 400 without `--all`**, so
a database far larger than you expected can't quietly spend. Run `places:audit` first: its total
is the number of calls. Confirm the free allowance against your own billing console before a
large run.

## Running it in production

**Production is not a copy of your local database.** They share a _structure_ (the same
migrations), but not their _data_. Your local database is a sandbox on your Mac — the seed, the
Top-100 import, and whatever has been tested against it — and the merges, backfill and deletes done
there did **not** happen in production; commits carry code, not data. Production holds your real
members and what has been run against it. The seed grew from 35 to 49 restaurants on 2026-08-20
(Ichiban, Shibuya, Il Bacareto, LILA and Restaurante Gijón were added that day), so a production
database that was seeded earlier and never re-seeded doesn't have them, and the catalog twins only
exist there if the Top-100 import was run against it. **Never copy a local database over
production** — it would erase real members and their rankings. That is why every step below has a
`--dry-run` that rolls back, why `places:merge-known` skips what isn't there, and why the first steps
only _read_.

Nothing here runs inside Railway. The scripts run **on your Mac** and connect to the production
database over its public address; there is nothing to deploy and no restart afterwards, because the
API reads the database live.

### One-time set-up (each time you open a terminal for this)

1. **Get the production database address.** Railway dashboard → project **mesa** → the
   **Postgres** service → **Connect** tab → **Public Network** → copy the connection URL (a
   `postgresql://…proxy.rlwy.net:<port>/railway` address). Use the Connect tab, not the API
   service's Variables — there the value is a `${{Postgres.…}}` template that isn't usable. Copy the
   _public_ one: the private one ends in `railway.internal` and only works inside Railway.
2. **Point a terminal at it, from `apps/api`.** Copy the URL, then:

   ```bash
   cd /Users/enriquehernandez/Desktop/mesa-app-demo/apps/api
   export DATABASE_URL="$(pbpaste)"
   ```

   An exported `DATABASE_URL` overrides the local one in `apps/api/.env`. Every script prints its
   target first — `Database: <host>:<port>/<name> (REMOTE)` for production, `(local)` for your Mac.
   **Check that line before you go on.** If it says `railway.internal`, or shows `${{`, you copied
   the private or template address — go back to the Connect tab and take the Public Network one.

3. **For the enrich step only**, the Google key (the same one as in `apps/api/.env`): copy it, then
   `export GOOGLE_PLACES_API_KEY="$(pbpaste)"`.

### The steps

**Phase 1 — read only. Nothing changes.**

1. **Back up first.** A merge or delete can't be undone except by restoring:
   `pg_dump "$DATABASE_URL" --format=custom --file="$HOME/mesa-before-places-$(date +%F).dump"`,
   then check the file exists and isn't empty (`ls -lh ~/mesa-before-places-*.dump`).
2. `bun run places:audit` — the starting picture, and how many places there are (this is also how
   many Google calls the enrich step will make).
3. `bun run places:merge-known --dry-run` — which of the known duplicate groups exist here, with
   each row's neighborhood, address, reviews and menu. A group that isn't here says _skipped_.
4. `bun run places:remove "Mamey Librería Caribeña" --dry-run` — if the row isn't here it says so;
   if members have ranked it, it refuses.
5. `bun run places:enrich --dry-run` — the change list: pins that move, neighborhoods that change,
   places Google says have closed, and the lists that need a human. This is the step that calls Google.

Read all of it before Phase 2. If anything surprises you — a merge plan whose rows don't look like
one place, a `Database:` line that isn't production, a much larger place count than expected —
**stop**.

**Phase 2 — changes data.** In this order, each one only after its dry run looked right:

6. `bun run places:merge-known`
7. `bun run places:remove "Mamey Librería Caribeña"`
8. `bun run places:enrich`
9. `bun run places:audit` (and `bun run catalog:clean --dry-run`, then `bun run catalog:clean`, to
   clear the invented phone numbers left on places Google couldn't match)
10. `bun run places:audit` once more — the finishing picture.

Every step that changes data is safe to run again.

**When you're done, close that terminal tab** (or `unset DATABASE_URL GOOGLE_PLACES_API_KEY`). A
terminal still holding the production address is dangerous — `bun run db:seed`, for one,
**truncates every table**.
