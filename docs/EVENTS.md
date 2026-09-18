# Mesa — how to add and maintain events

A living runbook, not a one-time plan. Use this whenever a new curated event
needs to go on the calendar, or an existing one needs to come off it. Events
are **Mesa-curated, never member-created** — there's no in-app "create an
event" flow, by design (M21).

## Where it lives

`packages/db/src/schema/events.ts`, table `events`:

| column | meaning |
|---|---|
| `slug` | stable, unique, hand-picked (e.g. `pura-tasca-noche-de-jazz-2026-09-17`) — this is what the importer upserts by |
| `restaurantId` | FK to `restaurants`, required — every event happens at a real catalog venue |
| `title`, `description` | as written; `description` is optional |
| `startsAt`, `endsAt` | **timezone-aware** timestamps (`timestamp with time zone`) — a shared future instant every member's client renders, same reasoning as `plans.startsAt`. `endsAt` is optional. |
| `category` | free text, Mesa's own editorial label ("Música en vivo", "Happy hour", "Brunch") — not a closed taxonomy |
| `priceLabel` | free text ("Cover RD$500", "Gratis", "2x1 en cócteles") — `null` means unlisted, not free |
| `ticketUrl` | an external link, optional. A real-world ticket never needs Apple in-app purchase — this is a plain outbound link, not a purchase flow |
| `coverImageId` | Cloudinary public id, optional — falls back to the restaurant's own cover when null |
| `cancelledAt` | soft-cancel; see "taking an event down" below |

`event_rsvps` is a member's RSVP (`going` or `interested`), one row per
(event, user) — `PUT /events/:id/rsvp` upserts it, `DELETE` clears it
outright.

## The one rule that matters most

**Never delete an `events` row.** An RSVP, an Activity feed entry, or a
"Armar un plan" deep link from `app/eventos/[eventId].tsx` can all point at
one. Taking an event off the calendar — it got cancelled, or it was a mistake
— is always `UPDATE events SET cancelled_at = now() WHERE slug = '...'`, never
a `DELETE`. A cancelled event stops showing up in every browse list and
restaurant rail (`routes/events.ts` filters on `cancelledAt IS NULL`
everywhere) but stays reachable by anyone who already RSVP'd or has the link.

## Adding events

Use `apps/api/src/import-events.ts` — much simpler than the restaurant
importer since there's no geocoding, just an exact-name match against a
restaurant that already exists in the catalog.

1. Add entries to `apps/api/data/events.json` (`{ events: [{ slug,
   restaurantName, title, description, startsAt, endsAt, category,
   priceLabel, ticketUrl, coverImageId }] }`). `restaurantName` must match a
   `restaurants.name` **exactly** — the importer does a plain exact match, on
   purpose (a fuzzy match here could attach a real event to the wrong real
   place, silently). If the venue isn't in the catalog yet, add it first
   (see `docs/MENUS.md`'s sibling restaurant-import flow) — this importer
   never creates a restaurant.
2. Write `startsAt`/`endsAt` as ISO strings with an **explicit UTC-4 offset**
   (e.g. `"2026-09-17T20:30:00-04:00"`) — Santo Domingo has no DST, so this is
   exact, and it means the timestamp parses to the same real instant no
   matter what timezone the machine running the import happens to be in.
3. Always `--dry-run` first and read the printed match report — it tells you
   exactly which `restaurantName`s didn't resolve, before anything writes:
   ```
   DATABASE_URL="<url>" bun run src/import-events.ts --dry-run
   ```
4. Run locally first (`DATABASE_URL` pointed at local Postgres), verify with
   `curl .../events?when=upcoming` and a simulator spot-check on Explore's
   Eventos tab, **then** hand the production run to the founder as a
   separate step with the production `DATABASE_URL` — never run that write
   directly (`bun run import:events` from `apps/api`).
5. Re-running the importer later with updated fields for an existing `slug`
   is a normal update, not a special case — it upserts, matching the same
   "matched (update)" count the dry-run already showed you.

## Taking an event down (cancelling it)

Don't reach for the importer — cancelling is a one-line manual update once
you know the slug:

```sql
update events set cancelled_at = now() where slug = '<slug>';
```

Or add `cancelledAt` handling to a future `--cancel <slug>` importer flag if
this becomes routine enough to script. Un-cancelling (a mistaken cancel) is
the same statement with `cancelled_at = null`.

## After writing the rows

Nothing else to do. `GET /events`, `GET /events/restaurant/:id`, and
`GET /events/:id` all read live from the table — no cache to bust, no build
step. The next request just sees it.
