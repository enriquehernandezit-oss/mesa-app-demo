# Mesa — how to add a restaurant's menu

A living runbook, not a one-time plan. Use this whenever a restaurant that
doesn't have a menu today gets one — a new batch from a spreadsheet, or a
single place someone hands you a menu for. The mobile app needs **no code
changes** for this: the "Menu" button and the menu page key off whether
`menu_items` rows exist for that restaurant, so writing correct rows is the
entire job.

## Where it lives

`packages/db/src/schema/menu.ts`, table `menu_items`:

| column | meaning |
|---|---|
| `restaurantId` | FK to `restaurants`, cascade delete |
| `section` | e.g. "Appetizers" — section order is each section's first-appearance order, not alphabetical |
| `name`, `description` | as supplied; never translated, shown exactly as given |
| `priceCents` | integer — `Math.round(price * 100)`, never a float. Stored but **not displayed** (founder decision: prices drift too fast to keep accurate, a stale price reads worse than no price) — still worth capturing honestly in case that changes |
| `currency` | `DOP` or `USD`, per item — a single menu can mix currencies (e.g. a US-priced import item next to DOP-priced local dishes) |
| `sourceRef` | free text or a URL; **never rendered as a link** in the app |
| `verifiedAt` | the real date the menu was checked — drives the "Menú verificado · {date}" caption. Leave `null` if you don't actually know |
| `position` | sequential per restaurant, preserving section order then item order within it |

`GET /restaurants/:id` reports `hasMenu` (`menu_items` count > 0 for that id,
via `menu_items_restaurant_idx`) — that's the only thing gating the Menu
button. `GET /restaurants/:id/menu` returns the grouped sections the menu
page renders. Both are already built; nothing there needs to change.

## The one rule that matters most

**`menu_items` for a restaurant is owned completely by whatever wrote it.** A
menu update is always *delete every existing row for that `restaurant_id`,
then insert the fresh set* — never an append. Appending duplicates every item
that didn't change. This is why `import-top100.ts`'s menu-write step does
exactly that per restaurant, every run.

## Two ways to add menu data

### A. A batch (a new spreadsheet of restaurants + menus, like the Top 100)

Use `apps/api/src/import-top100.ts` as the template — it's the fullest worked
example (geocoding, catalog matching, and the menu write together). For a new
batch:

1. Normalize the source into a JSON extract shaped like
   `apps/api/data/top100.json` (`{ restaurants: [...], menus: { [name]: [...] } }`).
   Do this once, offline, and commit the JSON — it becomes the reviewable
   source of truth, since the original spreadsheet usually isn't committed.
2. Adapt the script's geocode/match/insert flow to the new source (or write a
   smaller one that skips geocoding if the restaurants already exist and you
   just know their ids).
3. Always `--dry-run` first and read the printed counts — matched/new/closed,
   name-only-match candidates, menu coverage — before any real write. Review
   anything flagged as low-confidence or a name-only match by hand; don't
   trust an automated match blindly (see `findCatalogMatch` / `nameOnlyUniqueMatch`
   in that file for what "confident" means here).
4. Run locally first (`DATABASE_URL` pointed at local Postgres), verify with
   `curl .../restaurants/:id/menu` and a simulator spot-check, **then** hand
   the production run to the founder as a separate step with the production
   `DATABASE_URL` — never run that write directly.

### B. A single restaurant (someone hands you one menu)

Don't reach for the whole importer — it's overkill for one place whose id you
already know. Just:

```sql
delete from menu_items where restaurant_id = '<id>';
-- then insert the fresh rows, position 0..n in section-then-item order
```

or a tiny one-off script that does the same delete-then-insert. Follow the
same column rules above (`priceCents` rounding, per-item `currency`, honest
`verifiedAt`). Re-run the same delete-then-insert whenever that restaurant's
menu changes later.

## After writing the rows

Nothing else to do. The next time `GET /restaurants/:id` is called, `hasMenu`
flips true, the Menu button appears in the action row next to Llamar/Sitio
web/Cómo llegar, and `/menu/[restaurantId]` renders the sections. Confirm with
a curl check and a quick look in the simulator (both themes) before calling it
done.
