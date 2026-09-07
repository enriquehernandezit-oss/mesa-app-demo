# Mesa — what the app does today

**Status as of 2026-09-04.** This document describes the product *as built*, not as planned.
Where `docs/BUILD_PLAN.md`, `docs/APPSTORE.md` and `docs/SUBMISSION.md` disagree with this file,
this file is right — those three still describe the retired Vite/Capacitor stack.

At a glance: **23 screens · 57 API endpoints · 22 tables · 13 migrations · 199 commits.**
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
2. **How was it?** — three sentiment buckets (*Me encantó · Estuvo bien · No me gustó*), which
   narrow the comparison range to roughly a third of your list.
3. **Pairwise comparison** — photo-backed cards, "which do you prefer?", plus *Más o menos igual*
   for a tie. A binary insertion sort, so a 100-place list settles in ~7 taps.
4. **The reveal** — your score, derived from the final position (0–100 stored, shown 7.2–9.6).
   **The ranking is committed here**, not at the end, so an interrupted flow never loses it.
5. **The note step** — a one-line vibe note (140 chars), occasion tags (8 Spanish values), and
   *Qué pedir* (the dish worth ordering). Optionally chain straight into posting a photo.

The back gesture and drag-to-dismiss both step *backward* through the flow rather than throwing
away a half-finished ranking.

### Your list (`(tabs)/rankings.tsx`)
- **Mía** — your ordered passport, brass serif numerals, swipe-to-remove with undo.
- **Quiero probar** — saved places.
- **Sectores** — your rankings aggregated by neighbourhood, with a bar per barrio.
- **Sort** — one chip opening a native action sheet: *Mi orden · Puntuación · Recientes · Nombre*.
- **Filter** — four dimensions (sector, ocasión, precio, cocina) via active-filter chips plus a
  `Filtros (N)` panel. All client-side, over the whole list in memory.
- The "mine" tab is virtualized (`FlatList`); saved and barrios are not, deliberately — they're
  bounded.
- **Share your list** — a story card of your top 5 over the top spot's photo.

---

## 3. Discovery

| Screen | What it does |
|---|---|
| **Feed** (`discover.tsx`) | Friends' rankings and dish posts, newest first, infinite scroll + pull-to-refresh. Ranking cards carry the attributed score **and `#N en su lista`** — where the place sits in that friend's own ranking. Dish posts carry the photo. Cheers on any row. Featured-lists carousel on top. |
| **Explore** (`explore/index.tsx`) | Searches your circle's rankings — not the open internet. Native search bar in the nav bar. Filters: score/open-now/price, sector, cuisine. Also returns **members** and dish matches. Falls through to Google when Mesa has fewer than 3 hits. |
| **Trending rail** | "Sonando esta semana" — 14-day cheer velocity, in Explore's default browse state only. Shows **only a cheer count**, never a score. Self-hides under 4 qualifying spots. |
| **Restaurant profile** (`r/[restaurantId].tsx`) | The payoff surface: hero photo or tinted map, characteristics, the attributed score trio, occasion tags, popular dishes, friends who ranked it with their notes, similar-spots rail, list membership pills. Sticky condensed header on scroll. Save, share, rank. |
| **Map** (`map.tsx`) | Every spot at real coordinates; friend-ranked places lit brass. Degrades to a message without a Mapbox token. |
| **Place map** (`place-map.tsx`) | One place, full-screen, pannable, with directions handoff. |
| **Lists** (`lists/[slug].tsx`) | Editorial lists in curated order, each with the friend signal. |
| **Leaderboard** | City ranking by places ranked, all-time or monthly. |

**Directions** hand off to Apple Maps, Google Maps or Waze via a chooser that remembers your last
choice.

---

## 4. Dishes

Post a photo attached to one of your own rankings: pick or shoot the photo, choose a grain
treatment, name it, caption it, set visibility (friends or public), optionally mark the place as
want-to-try. Dish detail shows the photo, the caption, and the **place card as the anchor** —
carrying the poster's attributed score, because a dish is never free-floating.

You can **delete your own dish post**; anyone else's is reportable.

---

## 5. People

- **Follow / unfollow**, with follower and following counts.
- **A member's passport** (`u/[userId].tsx`) — their avatar, barrio, ranked list with notes,
  tags and *Pide:*, a **taste-match percentage** with the shared-spot count behind it
  (`+87% de gustos en común · sobre 12 spots en común`), and the same Seguidores / Siguiendo /
  Rankeados trio as your own profile.
- **Your profile** (`profile.tsx`) — avatar picker, the same stat trio, an editorial line drawn
  from your own data (*"Comes sobre todo italiana, casi siempre en Piantini."*), routes into your
  lists, and two stat cards (Rank en RD, racha).
- **Activity** — cheers, new followers, friends ranking a spot you saved, friends out-ranking you.
  Grouped by day, with a local read watermark that clears the bell badge.
- **Contact matching** — optional, just-in-time. Phone numbers are hashed before they leave the
  phone and the list is never stored.

---

## 6. Moderation and safety (App Store 1.2)

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

## 7. Growth

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

## 8. Account

| | |
|---|---|
| **Email + password** | Live. 8-char minimum, breach-checked against Have I Been Pwned, Spanish error copy. |
| **Sign in with Apple** | Built, env-gated — turns on with Apple credentials. |
| **Instagram OAuth** | Built server-side; no client UI. The Instagram handle is a display string only. |
| **Phone OTP** | Built, disabled (no SMS provider). |
| **Email verification** | Sent on signup, not a gate. Resend from Settings. |
| **Password reset** | Emailed link, opens the app via universal link. |
| **Sessions** | 30 days. Bearer tokens in the iOS Keychain, not cookies. Change password and "sign out other devices" both available. |
| **Account deletion** | In-app, cascading, irreversible. Requires your password, or a session younger than 24h. |
| **Data export** | Your rankings as JSON, via the share sheet. |

**Onboarding** is three steps — profile + neighbourhood + EULA, a starter pairwise ranking, then
finding friends. Nothing is gated behind invites, contacts, or a ranking count.

---

## 9. Design

Two first-class themes — **Afternoon** (light paper) and **Candlelit** (dark oxblood) — plus Auto,
which flips at 6pm regardless of the OS setting. Everything resolves through a semantic token
layer; no raw colour exists outside it.

The governing line is **content is Mesa, chrome is iOS**:
- *Content* — cards, rows, the type ramp, the stroke-icon language — is Mesa's.
- *Chrome* — the tab bar (a real `UITabBar` with SF Symbols, Liquid Glass, and minimize-on-scroll),
  large-title nav bars with blur scroll edges, action sheets, `Switch`, in-app Safari — is the
  system's, and is always told Mesa's *resolved* theme explicitly.

Typography: Cormorant Garamond (serif), Plus Jakarta Sans (UI), JetBrains Mono (metadata). Data
numerals use lining + tabular figures so scores sit on the baseline and columns align; prose keeps
Cormorant's oldstyle figures.

Other details: haptics taxonomy, skeleton loaders shaped like the content they replace, Dynamic
Type capped on the shared type primitives, 44pt touch targets, swipe-to-remove with undo.

---

## 10. Production infrastructure

**Wired:**
- **CI** — GitHub Actions on every push: typecheck (API, db, mobile), lint, tests, and an
  `expo export` bundle check that catches what `tsc` can't.
- **Analytics** — PostHog, 17 typed loop events, screen views, no PII by contract.
- **Crash reporting** — Sentry on both the app and the API.
- **Email** — Resend, for verification and password reset. Production refuses to boot without it.
- **Rate limiting** — Better Auth's limiter (DB-backed), a per-account sign-in throttle, and cost
  guards on the Google proxy and contact matching.
- **Security headers** — two CSP policies (a strict one for JSON, a scriptless one for `/p/*`),
  HSTS, `X-Frame-Options: DENY`.
- **Deploy** — Railway, migrations run automatically before each deploy.

**Env-gated, degrade gracefully:** Mapbox, Cloudinary, Google Places, Apple, Instagram, SMS,
PostHog, Sentry. Missing keys mean a missing feature, never a crash.

**Not built yet:** push notifications · signed Cloudinary uploads (images currently post as data
URLs through the API) · server-side caching · background jobs · route tests (there is exactly
**one** test file) · a web admin panel (the moderator screen is in-app by design).

---

## 11. Deliberately not built

Refusing these is a design position, not a backlog:

- **No stars, no global averages, no bare place ratings.**
- **No booking backend** — a phone number hands off to your phone; Mesa books nothing.
- **No DMs** — WhatsApp is the messaging layer in the DR; "send a spot" is a share card.
- **No ads, no sponsored placement, ever.**
- **No referral-locked features** — invites gate nothing.
- **No streak-restore purchases**; streaks are weekly and free.
- **Reservations, Tonight, group planning, events** — planned, not built. No schema exists.

One control still says "pronto": **Notifications**, which becomes real with push. Stealth mode and
DMs were removed rather than left as dated promises.

---

## 12. Stack

- **Runtime** Bun · **API** Hono · **DB** PostgreSQL + Drizzle · **Auth** Better Auth
- **App** Expo SDK 57 / React Native 0.86, Expo Router, NativeWind, TanStack Query
- **Images** Cloudinary · **Maps** Mapbox · **Hosting** Railway · **Builds** EAS

The monorepo exists for one reason: the Drizzle schema and its inferred types live in
`packages/db` and are imported by the API. `apps/mobile` is **deliberately not** a workspace
member — Metro needs a flat `node_modules` — so it keeps a hand-maintained copy of the API
response types in `src/lib/types.ts`. Keep them in sync when the schema changes; CI compiles both,
but nothing proves the mirror still matches the server.

---

## 13. What's blocking launch

| Blocker | Needs |
|---|---|
| First device build | Apple Developer approval (enrolled, pending) |
| Push notifications | Apple approval, then build |
| Signed image uploads | Cloudinary API key + secret |
| Analytics actually reporting | PostHog key, Sentry DSNs |
| Legal pages | Founder + counsel review of the drafted copy |
| App Store listing | Screenshots (needs a build), description, privacy label |
