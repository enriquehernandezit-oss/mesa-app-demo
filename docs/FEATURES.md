# Mesa — what the app does today

**Status as of 2026-10-05.** This document describes the product _as built_, not as planned.
Where `docs/BUILD_PLAN.md` disagrees with this file, this file is right — that plan is the
original build order for the retired Vite/Capacitor app, kept as history.

At a glance: **51 screens · 167 API endpoints (27 route files) · 45 tables · 38 migrations.**
iOS-only, Spanish-only, no web app (the sole web surface is the API's server-rendered `/p/*`
share pages).

---

## 1. What Mesa is

A social restaurant and nightlife discovery app for Santo Domingo. The premise: **you rank the
places you've been, and you see where your friends rank theirs.** Vibe-check notes, never star
ratings.

One rule governs the whole product: **a score is always attributed to a person.** A place never
gets a bare rating of its own. Every number on screen belongs to someone — you, a named friend,
or "4 amigos" — and anything that would show a place's own average is either absent or explicitly
labelled as your circle's.

---

## 2. The core loop

**Rank a place → see where your friends ranked theirs.** Everything else exists to serve this.

### Ranking a place (`rank.tsx`, a modal)

1. **Find the spot** — searches your already-ranked places and the catalog together. If Mesa
   doesn't have it, a Google Places typeahead offers online matches, and picking one creates a
   full profile. You can also add a place by hand.
2. **How was it?** — three sentiment buckets (_Me encantó · Estuvo bien · No me gustó_), which
   narrow the comparison range to roughly a third of your list.
3. **Pairwise comparison** — photo-backed cards, "which do you prefer?", plus _Más o menos igual_
   for a tie. A binary insertion sort, so a 100-place list settles in ~7 taps.
4. **The reveal** — your score, derived from the final position (0–100 stored, shown 7.2–9.6).
   **The ranking is committed here**, not at the end, so an interrupted flow never loses it.
5. **The note step** — a one-line vibe note (140 chars), occasion tags (8 Spanish values) and **"What stood out?"** highlights (Cócteles, Comedor privado, Terraza, Carta de vinos, Música en vivo, Buen servicio — member-only vibe tags, the same `rankings.tags` column; at most 6 tags in all; a tag shows on a place once 2+ people pick it; Explore's **Destaca por** filter reads them), and
   _Qué pedir_: a chip search over dishes already logged at the place (or "+ Agregar" a new one),
   up to 3, each with a category (auto-guessed, correctable) and an optional sentiment
   (_Me encantó · Estuvo bien · No me convenció_). Optionally attach a photo to the first one.

The back gesture and drag-to-dismiss both step _backward_ through the flow rather than throwing
away a half-finished ranking.

Ranking-list integrity (dense 1..n positions, one score formula, no lost-update races) is
verified with `bun run rankings:check` (read-only) and repaired with `bun run rankings:renormalize`
(`apps/api/src/check-rankings.ts` / `renormalize-rankings.ts`).

### Your list (`(tabs)/rankings.tsx`)

- **Mía** — your ordered passport, brass serif numerals, swipe-to-remove with undo.
- **Quiero probar** — saved places.
- **Sectores** — your rankings aggregated by neighbourhood, with a bar per barrio.
- **Sort** — one chip opening a native action sheet: _Mi orden · Puntuación · Recientes · Nombre_.
- **Filter** — four dimensions (sector, ocasión, precio, cocina) via active-filter chips plus a
  `Filtros (N)` panel. All client-side, over the whole list in memory.
- The "mine" tab is virtualized (`FlatList`); saved and barrios are not, deliberately — they're
  bounded.
- **Share your list** — a story card of your top 5 over the top spot's photo.

---

## 3. Discovery

| Screen                                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Feed** (`discover.tsx`)                       | Friends' rankings and dish posts, newest first, infinite scroll + pull-to-refresh. Flat, compact rows (M9) — no card box, just a hairline under the text column. Ranking rows carry the attributed score; no `#N en su lista`. Dish posts carry the photo. Cheers on any row. Featured-lists carousel on top.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Explore** (`explore/index.tsx`)               | Searches your circle's rankings — not the open internet. A search field under the title. Filters: score, price, sector, cuisine, occasion, highlight. Each place carries Google's weekly hours (`restaurants.opening_hours`, and `open_minutes` for querying), so `open=1` means open at this minute in Santo Domingo. Santo Domingo has 21 sectors, and places are filed by the sector name Google gives them (with aliases: Google's "Ensanche Naco" is Naco); `bun run places:refile` re-files existing places without new Google calls. Explore has **Cerca** (asks for location while using the app, shows places within 3 km, rounds the position to ~100 m, never stores it), **Abierto ahora**, and sorts by Score, Distance (with Cerca on) or Name; rows show distance and Abierto/Cerrado, and the place page says "Abierto · cierra 12 AM" or "Cerrado · abre 10 AM". Also returns **members** and dish matches. Falls through to Google when Mesa has fewer than 3 hits.                  |
| **Trending rail**                               | "Sonando esta semana" — 14-day cheer velocity, in Explore's default browse state only. Shows **only a cheer count**, never a score. Self-hides under 4 qualifying spots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Restaurant profile** (`r/[restaurantId].tsx`) | The payoff surface: a **tinted map** — a place has no profile picture of its own (migration 0044 cleared them all), only a name card; the first screen shows up to four of the members' dish photos as thumbnails in a glass row ("Dish photos" opens all of them); on a place you have ranked that has none, the same row invites you to add the first one; members' dish photos are public (anyone signed in sees them, a private account's too) and live on the place's page, characteristics, the attributed score trio, occasion tags, popular dishes, friends who ranked it with their notes, similar-spots rail, list membership pills. Sticky condensed header on scroll. Save, share, rank. Action row shows a **Menú** button when the place has one, next to Llamar/Sitio web/Cómo llegar — opens the full menu page (`menu/[restaurantId].tsx`: sticky section headers, a chip rail to jump between them). See `docs/MENUS.md` for how to add a menu to a place that doesn't have one yet. |
| **Map** (`map.tsx`)                             | Every spot at real coordinates; friend-ranked places lit brass. Degrades to a message without a Mapbox token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Place map** (`place-map.tsx`)                 | One place, full-screen, pannable, with directions handoff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Lists** (`lists/[slug].tsx`)                  | Editorial lists in curated order, each with the friend signal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Leaderboard**                                 | Ranking by places ranked, all-time or this month (the Santo Domingo calendar month), for the city, your friends, or one **sector** (the people whose home sector it is — Piantini, Naco; starts at yours, a searchable picker changes it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Directions** hand off to Apple Maps, Google Maps or Waze via a chooser that remembers your last
choice.

---

## 4. Dishes

Log a dish attached to one of your own rankings — a name and a **required category** from a
closed, cuisine-complete 65-category taxonomy (keyword-guessed, correctable in a searchable
picker); a photo is **optional**. With a photo, also choose a grain treatment and caption. Dish
detail shows the photo (or, photo-less, a plain name-led header) and the **place card as the
anchor** — carrying the poster's attributed score, because a dish is never free-floating.

The first dish logged on a ranking becomes that ranking's "Qué pedir" pick automatically — there
is no separate free-text field for it anymore. See `docs/DISHES.md` for the full schema, API and
taxonomy detail. **Dish lists** (`dish-lists/`) rank the same dish across places — "best tostones" —
and have their own public page.

You can **delete your own dish post**; anyone else's is reportable.

---

## 5. People

- **Follow / unfollow**, with follower and following counts.
- **A member's passport** (`u/[userId].tsx`) — their avatar, barrio, ranked list with notes,
  tags and _Pide:_, a **taste-match percentage** with the shared-spot count behind it
  (`+87% de gustos en común · sobre 12 spots en común`), and the same Seguidores / Siguiendo /
  Rankeados trio as your own profile.
- **Your profile** (`profile.tsx`) — avatar picker, the same stat trio, an editorial line drawn
  from your own data (_"Comes sobre todo italiana, casi siempre en Piantini."_), routes into your
  lists, and two stat cards (Rank en RD, racha).
- **Activity** — cheers, new followers, friends ranking a spot you saved, friends out-ranking you. **Sending**: from a place's or an event's share button, "Send in Mesa" picks from your followers (the people a plan can invite); each gets it in their bell and as a push that opens it, once however many times it is sent, within a daily limit (`POST /restaurants/:id/share`, `POST /events/:id/share`).
  Two friend signals. **A place your friends love**: 3 or more of the people you follow gave it 8.0+ in
  the last 30 days — said once per place, with different words if you have been, and at most one such
  push a day (the rest wait in the inbox). **A taste match**: two people who **follow each other** cross
  **90%** — each is told about the other, once; a one-way follow never triggers it, and 90 needs a long
  shared history (8+ places in the same order). Both always land in the inbox; the push needs the
  `friends` switch like any other, with no quiet hours. Friends ranking a place you have _not_ saved is
  deliberately not announced. Before the first deploy, run `bun run --filter @mesa/api taste:backfill`
  once on production so existing matches are recorded silently instead of announced.

  **@-mentions** (API; the app's `@` autocomplete and tappable handles come next): a handle in a
  ranking note, a comment, or a new dish's caption tells that person — once per place it was said, so
  editing a note tells only the newly added names. Up to 5 names per text; case-insensitive, a trailing
  dot or comma is not part of the handle, and an `@` inside a word (an email) is not a mention. Never the
  author, a banned member, anyone blocked either way, or — for a private account's own notes and
  captions, or comments under its rankings — anyone who is not the owner or one of their approved
  followers. A comment's ranking owner gets the comment, not a second "mentioned you". It rides the
  `social` switch. There is no mentions table: the text plus the inbox row is the record.
  **Tagging in the app** works like Instagram's: type `@` and the start of a name or @handle in a comment,
  a ranking note (in the rank flow or edited from Your list) or a dish caption, and the people you might
  mean appear under the field (above it, for comments) — tap one and it becomes `@handle `, or keep typing
  the whole handle. `GET /social/mention-search?q=` serves it: a handle prefix finds anyone; the start of any
  word of a **name** (accents ignored: "lucia" finds "Lucía") finds only people you follow or who follow you.
  Ordered: people you follow, then your followers, then the rest; never you, a block, or a ban. With nothing
  typed after the `@`, just who you follow. Tagged handles in shown notes, comments and captions are tappable
  (they open that member's profile); a mention lands in Activity under Rankings, quoting the text.
  Grouped by day, with a local read watermark that clears the bell badge.

- **Contact matching** — optional, just-in-time. The numbers are sent over TLS and hashed **on the
  server** with a secret key (HMAC, `PHONE_MATCH_SECRET`), matched in the same request and never
  stored. There is a daily budget per member. Being findable by your own number is a separate opt-in
  (`PHONE_OPT_IN`), off until a number can be verified by SMS.
- **Mutual connections** — a suggestion or a profile shows which of your people (anyone you follow or
  who follows you) also follow that person, with a Mutual tab for the full list. Private accounts you
  don't follow, banned members and blocks never count.

---

## 6. Planes (group dinners)

Arm a group dinner and invite the people you follow — the one workflow in the app that isn't a
solo action.

- **Create** (`plans/new.tsx`, a modal) — pick 1–3 candidate spots (1 = a fixed venue, 2–3 = a
  vote), a day/time via chip pickers (no native date-picker dependency), and invitees from your own
  followers. Up to 50 invitees, up to 90 days out.
- **Invite = your followers, only.** Nobody else can be added — a decision made up front, so the
  invite picker (`components/FollowerPicker.tsx`) is just a filtered `GET /social/followers`.
- **RSVP** — Voy / Tal vez / No puedo. **Voting** — when there's more than one candidate spot, each
  invitee votes for one; the host confirms a winner once the votes are in.
- **Delivery** — in-app (the Planes tab section, plus the Activity bell/badge) **and** a
  WhatsApp-first share link, matching how invites and share cards already work.
- **Public page** (`/p/plan/:id`) — server-rendered, shows the spot (or the open vote) and the
  date; deliberately carries **no guest list**.
- Reached from Profile's "Planes" row (with a pending-invite count) and from Activity's plan rows.

---

## 7. Moderation and safety (App Store 1.2)

Complete, both directions:

- **Report** a vibe note, a dish, a comment, a member, a plan's note or a place — reason picked from a sheet. One open report per thing per reporter, and 30 a day.
- **Block** a member — severs follow edges both ways and hides content symmetrically. Blocks are
  filtered on every read path, in **both** directions.
- **Delete your own** dish posts and vibe notes.
- **Moderator queue** (`moderation.tsx`) — moderator-only, gated server-side on every endpoint.
  Shows each open report **with the reported content attached** (the note text, the dish photo,
  the member), the reason, and how long it's been waiting. Actions: retirar / expulsar / descartar.
  Greys out reports whose content another moderator already handled. The queue pages (50 at a
  time, with the total) and opens fresh each time. A new report **emails the moderators** (once per
  half hour of activity, not once per report). Moderators can also clear a plan's note and remove a
  place from Mesa (soft: the row and its history stay). Collection and list names are not
  reportable: other members cannot see them in the app, and the public share pages carry no report
  link until there is a support address to put there.
- **Ejected accounts** are rejected everywhere by the auth gate and their content vanishes from
  all reads.
- The moderator flag is set **directly in the database** — nothing in the product can grant it.

---

## 8. Growth

- **Invite links** — one permanent code per member, **unlimited**, gating nothing. The link opens
  a personalised public page (`/p/i/CODE`) showing who invited you and their top 3. Attribution is
  recorded once per member, enforced by database constraints; self-invites are refused by a CHECK.
  Settings shows how many people actually joined — and only once that number is non-zero.
- **Share cards** — story-sized cards rendered off-screen and handed to the share sheet, for your
  list and for a place. Invites share **WhatsApp-first**, since that's where Santo Domingo plans
  dinner.
- **Public share pages** (`/p/u/:handle`, `/p/spot/:id`, `/p/i/:code`) — server-rendered, zero
  JavaScript, with Open Graph meta so links unfurl properly in WhatsApp and iMessage.
- **App links** rewrite public paths (`/p/spot`, `/p/u`, `/p/plan`, `/p/list`, `/p/collection`,
  `/p/dish-list`, invites and the two auth links) to in-app screens, so a tap opens the app on the real
  screen rather than a web page. Two things must exist first, and neither does yet: a **domain**, and
  the Apple team id (`APPLE_TEAM_ID`) so the API can serve `/.well-known/apple-app-site-association`;
  the build also needs `APP_LINK_DOMAIN`. Until then the `mesa://` form works, and a link tapped on a
  phone opens Safari. An invite link records the invite only when it opens the app — there is no
  deferred attribution for someone who installs afterwards.

---

## 9. Account

|                         |                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Email + password**    | Live. 8-char minimum, breach-checked against Have I Been Pwned, Spanish error copy.                                                                                                                                                                                                                                      |
| **Sign in with Apple**  | Built, env-gated — turns on with Apple credentials.                                                                                                                                                                                                                                                                      |
| **Sign in with Google** | Built, env-gated — the native button, verified against the Web and iOS client ids.                                                                                                                                                                                                                                       |
| **Instagram**           | No sign-in. The Instagram handle is a display string only; the server-side OAuth plugin has no app UI.                                                                                                                                                                                                                   |
| **Phone OTP**           | Built, off outside development — there is no SMS sender in the code, whatever `SMS_PROVIDER_API_KEY` says.                                                                                                                                                                                                               |
| **Email verification**  | Sent on signup, not a gate. Resend from Settings.                                                                                                                                                                                                                                                                        |
| **Password reset**      | Emailed link, opens the app via universal link.                                                                                                                                                                                                                                                                          |
| **Sessions**            | 30 days. Bearer tokens in the iOS Keychain, not cookies. Change password and "sign out other devices" both available.                                                                                                                                                                                                    |
| **Account deletion**    | In-app, cascading, irreversible. Requires your password (guesses are throttled); a Google or phone account, a session younger than 24h; an Apple account confirms with a fresh Apple sheet, and the server then revokes Mesa on the member's Apple ID. Erases your photos from storage and the rows keyed by your email. |
| **Terms**               | Accepted in onboarding and enforced on the server: posting, commenting and following need it.                                                                                                                                                                                                                            |
| **Data export**         | Your rankings as JSON, via the share sheet.                                                                                                                                                                                                                                                                              |

**Onboarding** is three steps — profile + neighbourhood (pick from a searchable list, or tap "Usar mi ubicación" and Mesa suggests the nearest sector, which you can change; farther than 3 km from every sector it says so instead of guessing; or "Otro" and type where you live, which the profile shows in place of a sector) + EULA, a starter list (the 20 most popular places; pick the 1–5 you like most — one is saved as it is, two or more are put in order by pairwise comparisons), then
finding friends. Nothing is gated behind invites, contacts, or a ranking count.

---

## 10. Design

Two first-class themes — **Day** (cream) and **Night** (black with a bit of burgundy) — plus Auto,
which flips at 6pm regardless of the OS setting. Everything resolves through a semantic token
layer; no raw colour exists outside it.

The governing line is **content is Mesa, chrome is iOS**:

- _Content_ — cards, rows, the type ramp, the stroke-icon language — is Mesa's.
- _Chrome_ — large-title nav bars with blur scroll edges, action sheets, `Switch`, in-app Safari
  — is the system's, and is always told Mesa's _resolved_ theme explicitly. The tab bar is the one
  deliberate exception: a real `UITabBar` (SF Symbols, Liquid Glass, minimize-on-scroll) was tried
  first, but it has no way to render one tab's icon larger than its siblings and its scroll-edge
  transparency stayed visible against real content — so the shipped bar (`components/MesaTabBar.tsx`)
  is Mesa-drawn, tokened chrome instead of the native component, sized and opaque on purpose.

Typography: Instrument Serif (upright, never italic) for display and the iOS system font for
everything else. The wordmark is the lowercase `mesa`; the capital-M icon lives on the home screen
only. Data numerals use tabular figures so scores sit on the baseline and columns align.

Other details: haptics taxonomy, skeleton loaders shaped like the content they replace, Dynamic
Type capped (1.35×) on every piece of text except fixed-size art (the share card, avatars, map pins), every tappable control reaches 44pt (small ones through hit slop), swipe-to-remove with undo.

---

## 11. Production infrastructure

**Wired:**

- **CI** — GitHub Actions on every push: typecheck (API, db, mobile), lint, format, the tests —
  the database-backed route tests run against a throwaway Postgres with the real migrations — and an
  `expo export` bundle check that catches what `tsc` can't.
- **Analytics** — PostHog, 17 typed loop events, screen views, no PII by contract.
- **Crash reporting** — PostHog on both the app and the API.
- **Email** — Resend, for verification and password reset. Production refuses to boot without it.
- **Rate limiting** — Better Auth's limiter (DB-backed), a per-account sign-in throttle (a valid
  reset link lifts it), and durable daily budgets on contact matching (5000), photo uploads (60) and
  new plans (10). A plan holds at most 50 invitees, and comment, mention and plan-invite pushes are
  limited to one an hour per sender and recipient. An upload's file size is not capped (the signed
  URL cannot carry a size range). The Google proxy has no spending cap yet.
- **Security headers** — two CSP policies (a strict one for JSON, a scriptless one for `/p/*`),
  HSTS, `X-Frame-Options: DENY`.
- **Deploy** — Railway, migrations run automatically before each deploy.

**Env-gated, degrade gracefully:** Mapbox, R2, Google Places, Apple, Google sign-in, PostHog. Missing
keys mean a missing feature, never a crash. (Phone sign-in is off outside development, and the
Instagram server plugin has no app UI, whatever keys are set.)

**Tests:** 46 API test files, 5 database, 25 mobile — pure logic, the route handlers against a real
Postgres, and the screens' helper libraries. There are no screen or component render tests.

**Not built yet:** server-side caching · a web admin panel (the moderator screen is in-app by
design). Background work is a single in-process sweep for reminders and push (`lib/pushSweep.ts`).

---

## 12. Deliberately not built

Refusing these is a design position, not a backlog:

- **No stars, no global averages, no bare place ratings.**
- **No booking backend** — a phone number hands off to your phone; Mesa books nothing.
- **No DMs** — WhatsApp is the messaging layer in the DR; "send a spot" is a share card.
- **No ads, no sponsored placement, ever.**
- **No referral-locked features** — invites gate nothing.
- **No streak-restore purchases**; streaks are weekly and free.
- **Reservations** — planned, not built. (Group planning shipped as Planes — see §6. Tonight
  and events shipped: see `docs/EVENTS.md`; the Feed's Events pill shows friends' plans, Explore → Events the
  catalogue.)

Stealth mode and DMs were removed rather than left as dated promises.

---

## 13. Stack

- **Runtime** Bun · **API** Hono · **DB** PostgreSQL + Drizzle · **Auth** Better Auth
- **App** Expo SDK 57 / React Native 0.86, Expo Router, NativeWind, TanStack Query
- **Images** Cloudflare R2 · **Maps** Mapbox · **Hosting** Railway · **Builds** EAS

The monorepo exists for one reason: the Drizzle schema and its inferred types live in
`packages/db` and are imported by the API. `apps/mobile` is **deliberately not** a workspace
member — Metro needs a flat `node_modules` — so it keeps a hand-maintained copy of the API
response types in `src/lib/types.ts`. Keep them in sync when the schema changes; CI compiles both,
but nothing proves the mirror still matches the server.

---

## 14. What's blocking launch

| Blocker                            | Needs                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                             | Buying one — then `PUBLIC_WEB_URL`, `APP_LINK_DOMAIN` and `APPLE_TEAM_ID` (app links), the support email on the legal pages, and the App Store listing's URLs |
| Apple token revocation             | Built; needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` on Railway                                                                                  |
| Phone sign-in / findable-by-number | An SMS sender and a verification step; both stay off until then                                                                                               |
| Analytics actually reporting       | PostHog key (mobile + Railway)                                                                                                                                |
| Legal pages                        | Founder + counsel review of the drafted copy                                                                                                                  |
| App Store listing                  | Screenshots, description, privacy label, and the app name ("Mesa" is taken)                                                                                   |
| Push on a real device              | A check on a TestFlight build — the code and the Expo token are in place                                                                                      |

The first device build is done (TestFlight since 2026-09-23); updates since then ship over the air.
