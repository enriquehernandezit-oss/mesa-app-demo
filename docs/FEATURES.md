# Mesa — what the app does today

**Status as of 2026-09-14.** This document describes the product _as built_, not as planned.
Where `docs/BUILD_PLAN.md`, `docs/APPSTORE.md` and `docs/SUBMISSION.md` disagree with this file,
this file is right — those three still describe the retired Vite/Capacitor stack.

At a glance: **27 screens · 64 API endpoints · 25 tables · 14 migrations.**
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

| Screen                                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feed** (`discover.tsx`)                       | Friends' rankings and dish posts, newest first, infinite scroll + pull-to-refresh. Flat, compact rows (M9) — no card box, just a hairline under the text column. Ranking rows carry the attributed score; no `#N en su lista`. Dish posts carry the photo. Cheers on any row. Featured-lists carousel on top.                                                                                                                                                                                                                                                       |
| **Explore** (`explore/index.tsx`)               | Searches your circle's rankings — not the open internet. Native search bar in the nav bar. Filters: score/open-now/price, sector, cuisine. Also returns **members** and dish matches. Falls through to Google when Mesa has fewer than 3 hits.                                                                                                                                                                                                                                                                                                                      |
| **Trending rail**                               | "Sonando esta semana" — 14-day cheer velocity, in Explore's default browse state only. Shows **only a cheer count**, never a score. Self-hides under 4 qualifying spots.                                                                                                                                                                                                                                                                                                                                                                                            |
| **Restaurant profile** (`r/[restaurantId].tsx`) | The payoff surface: hero photo or tinted map, characteristics, the attributed score trio, occasion tags, popular dishes, friends who ranked it with their notes, similar-spots rail, list membership pills. Sticky condensed header on scroll. Save, share, rank. Action row shows a **Menú** button when the place has one, next to Llamar/Sitio web/Cómo llegar — opens the full menu page (`menu/[restaurantId].tsx`: sticky section headers, a chip rail to jump between them). See `docs/MENUS.md` for how to add a menu to a place that doesn't have one yet. |
| **Map** (`map.tsx`)                             | Every spot at real coordinates; friend-ranked places lit brass. Degrades to a message without a Mapbox token.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Place map** (`place-map.tsx`)                 | One place, full-screen, pannable, with directions handoff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Lists** (`lists/[slug].tsx`)                  | Editorial lists in curated order, each with the friend signal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Leaderboard**                                 | City ranking by places ranked, all-time or monthly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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
taxonomy detail; dish-level ranking and cross-restaurant "best dish" lists are a later milestone,
not built yet.

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
- **Activity** — cheers, new followers, friends ranking a spot you saved, friends out-ranking you.
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
  `GET /social/mention-search?q=` serves the autocomplete: people you follow first, then everyone else
  by handle prefix (never you, a block, or a ban); with nothing typed, just who you follow.
  Grouped by day, with a local read watermark that clears the bell badge.

- **Contact matching** — optional, just-in-time. Phone numbers are hashed before they leave the
  phone and the list is never stored.

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

- **Report** a vibe note, a dish, or a member — reason picked from a native action sheet.
- **Block** a member — severs follow edges both ways and hides content symmetrically. Blocks are
  filtered on every read path, in **both** directions.
- **Delete your own** dish posts and vibe notes.
- **Moderator queue** (`moderation.tsx`) — moderator-only, gated server-side on every endpoint.
  Shows each open report **with the reported content attached** (the note text, the dish photo,
  the member), the reason, and how long it's been waiting. Actions: retirar / expulsar / descartar.
  Greys out reports whose content another moderator already handled.
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
- **Universal links** rewrite public paths to in-app screens, so a tap opens the app on the real
  screen rather than a web page.

---

## 9. Account

|                        |                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Email + password**   | Live. 8-char minimum, breach-checked against Have I Been Pwned, Spanish error copy.                                   |
| **Sign in with Apple** | Built, env-gated — turns on with Apple credentials.                                                                   |
| **Instagram OAuth**    | Built server-side; no client UI. The Instagram handle is a display string only.                                       |
| **Phone OTP**          | Built, disabled (no SMS provider).                                                                                    |
| **Email verification** | Sent on signup, not a gate. Resend from Settings.                                                                     |
| **Password reset**     | Emailed link, opens the app via universal link.                                                                       |
| **Sessions**           | 30 days. Bearer tokens in the iOS Keychain, not cookies. Change password and "sign out other devices" both available. |
| **Account deletion**   | In-app, cascading, irreversible. Requires your password, or a session younger than 24h.                               |
| **Data export**        | Your rankings as JSON, via the share sheet.                                                                           |

**Onboarding** is three steps — profile + neighbourhood + EULA, a starter pairwise ranking, then
finding friends. Nothing is gated behind invites, contacts, or a ranking count.

---

## 10. Design

Two first-class themes — **Afternoon** (light paper) and **Candlelit** (dark oxblood) — plus Auto,
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

Typography: Cormorant Garamond (serif) and Plus Jakarta Sans, the one UI family — it carries body,
metadata, eyebrows and pill labels (JetBrains Mono held the metadata voice until it was retired
2026-09-15). Data numerals use lining + tabular figures so scores sit on the baseline and columns
align; prose keeps Cormorant's oldstyle figures.

Other details: haptics taxonomy, skeleton loaders shaped like the content they replace, Dynamic
Type capped on the shared type primitives, 44pt touch targets, swipe-to-remove with undo.

---

## 11. Production infrastructure

**Wired:**

- **CI** — GitHub Actions on every push: typecheck (API, db, mobile), lint, tests, and an
  `expo export` bundle check that catches what `tsc` can't.
- **Analytics** — PostHog, 17 typed loop events, screen views, no PII by contract.
- **Crash reporting** — PostHog on both the app and the API.
- **Email** — Resend, for verification and password reset. Production refuses to boot without it.
- **Rate limiting** — Better Auth's limiter (DB-backed), a per-account sign-in throttle, and cost
  guards on the Google proxy and contact matching.
- **Security headers** — two CSP policies (a strict one for JSON, a scriptless one for `/p/*`),
  HSTS, `X-Frame-Options: DENY`.
- **Deploy** — Railway, migrations run automatically before each deploy.

**Env-gated, degrade gracefully:** Mapbox, R2, Google Places, Apple, Instagram, SMS,
PostHog. Missing keys mean a missing feature, never a crash.

**Not built yet:** server-side caching · background jobs · route tests (there is exactly
**one** test file) · a web admin panel (the moderator screen is in-app by design).

---

## 12. Deliberately not built

Refusing these is a design position, not a backlog:

- **No stars, no global averages, no bare place ratings.**
- **No booking backend** — a phone number hands off to your phone; Mesa books nothing.
- **No DMs** — WhatsApp is the messaging layer in the DR; "send a spot" is a share card.
- **No ads, no sponsored placement, ever.**
- **No referral-locked features** — invites gate nothing.
- **No streak-restore purchases**; streaks are weekly and free.
- **Reservations, Tonight, events** — planned, not built. No schema exists. (Group planning
  shipped as Planes — see §6.)

One control still says "pronto": **Notifications**, which becomes real with push. Stealth mode and
DMs were removed rather than left as dated promises.

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

| Blocker                      | Needs                                                          |
| ---------------------------- | -------------------------------------------------------------- |
| First device build           | Apple Developer approval (enrolled, pending)                   |
| Push notifications           | Apple approval, then build                                     |
| Signed image uploads         | ✅ shipped — needs R2 credentials in the founder's Railway env |
| Analytics actually reporting | PostHog key (mobile + Railway)                                 |
| Legal pages                  | Founder + counsel review of the drafted copy                   |
| App Store listing            | Screenshots (needs a build), description, privacy label        |
