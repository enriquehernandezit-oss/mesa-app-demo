# Mesa — The Plan to Overtake Beli and Become a Worldwide Social-Dining Network

> Status: strategy + product + engineering roadmap. Nothing here is built yet unless
> it says "DONE". This is the document to argue with before we write more code.

---

## 0. The one-paragraph thesis

Beli won by turning restaurant-tracking into a **game with a leaderboard**. But Beli
is still fundamentally a *utility* — a smarter list. The thing that becomes
"the next Instagram" is not a better list; it is a **taste identity network**:
your profile *is* your palate, your content is where/what you eat, and the feed is
social proof you can't get anywhere else. Mesa's wedge to get there is a real
**aesthetic** (editorial, oxblood, film-photo — a look people *want* to post) plus a
**hyper-local beachhead** (Santo Domingo, then LatAm) where Beli is weak. We win the
city on utility + social, then expand city-by-city, then layer content + creators to
graduate from "Beli competitor" into "Instagram for going out."

Three things have to be true, in order:
1. **Utility parity** with Beli so nobody has a reason to keep both. *(mostly DONE)*
2. **A share loop** strong enough that Mesa spreads without ad spend. *(started)*
3. **A content + identity layer** that makes Mesa a place you *scroll*, not just log.
   *(this is the leap Beli hasn't made — our real opportunity)*

---

## 1. Why this is winnable (honest competitive read)

**Beli's strengths** (respect them): the pairwise 0–10 ranking is genuinely great;
recs sharpen with use; leaderboards/streaks drive habit; strong NYC/US-campus network
effects; clean utility.

**Beli's soft spots** (our openings):
- **Look is utilitarian.** It's a productivity app aesthetic. People screenshot their
  lists but the app itself isn't *beautiful*. Mesa's editorial look is a real moat for
  a category where the product is aspiration.
- **Thin content.** No real photo/video culture, no stories, no creators, no "scroll for
  fun." It's a logging tool you open with intent, not a feed you kill time in. That caps
  DAU and session length — the exact metrics that make something "the next Instagram."
- **US-centric, English-first.** LatAm is wide open. Santo Domingo has the density
  (Piantini/Naco/Zona) and the going-out culture, and nobody owns it.
- **Weak local depth.** Beli is a mile wide. A city-first product can be far deeper:
  real reservation handoffs, neighborhood guides, nightlife, local creators.

**Our unfair advantages:** the fixed brand (already shared with the pre-launch quiz →
zero seam from acquisition to app), the pairwise engine already built, Spanish-native,
and a founder in-market.

---

## 2. Positioning

**Mesa = "Tu paladar, tu gente, tu ciudad."** (Your taste, your people, your city.)

- Not Yelp (strangers, stars, reviews). **No stars, ever.**
- Not Google Maps (transactional).
- Not Beli (a better list) — Mesa is *where your taste lives and is seen*.
- Closest spiritual sibling: Letterboxd for restaurants — identity + taste + a feed
  people love, with a beautiful editorial skin.

Everything downstream (features, UI, growth) should ladder to that line.

---

## 3. The growth engine — three loops, instrumented

Virality isn't a feature, it's a loop with a measured coefficient. We build and
instrument three, in priority order.

### Loop A — The Share Loop (acquisition) — *highest priority*
Create something beautiful → post to IG Story → viewers tap through → new user.
- **Artifacts:** "My Top 5 in Piantini" card *(DONE)*, single-spot card *(DONE)*,
  next: **year-in-review / "Mesa Wrapped"**, **"we match 92%" cards**, **monthly
  neighborhood report**, **a spot's "friends' average" card the restaurant itself
  reposts.**
- **The tap-through must land on a real deep link** → a public web preview of that
  card/profile with an "open in Mesa" CTA. *(NOT built — critical: today share cards
  point nowhere.)*
- **Metric:** invites sent per active user (k-factor). Target k > 0.5 before spend.

### Loop B — The Social Loop (retention)
Follow people → their rankings fill your feed → you rank back → they see it → repeat.
- Already have: feed, follow, cheers, activity. *(DONE)*
- Missing: **push notifications** ("Nati ranked a spot you saved"), **contact/IG
  friend-finding at scale**, **DMs / "send a spot to a friend"**, **group plans**
  ("you both saved Vela — go?").
- **Metric:** D7/D30 retention; % of users following ≥5 people (activation threshold).

### Loop C — The Local Utility Loop (frequency)
Rank a place → get sharper recs → reserve/go → rank the next one.
- Have: pairwise, recs, trending, reserve handoff. *(DONE)*
- Missing: **map view**, **"tonight" live layer**, **reservation depth** (Phase 3 B2B),
  **collections/guides** ("Best terraces in Naco").
- **Metric:** rankings created per user per month (the core habit).

---

## 4. Product roadmap — pillars & sequencing

Legend: ✅ done · 🔜 next (v3) · 🟡 mid (v4–5) · 🔭 long / moat (v6+)

### Pillar 1 — Ranking & Taste (the core object)
- ✅ Pairwise 0–10, sentiment buckets, tags, favorite dish, vibe notes, want-to-try
- ✅ Taste Profile, streaks, match %
- 🔜 **Re-rank / reorder** existing list by hand; **"why" prompts** that improve recs
- 🟡 **Taste graph recs** (collaborative filtering on the match graph, not just
  friend-average); **"you'll probably rate this 8.9"** predicted scores
- 🟡 **Occasions** (date night / business / solo) as a ranking dimension

### Pillar 2 — Content & Identity (the Instagram leap) — *the differentiator*
- ✅ Film-photo covers, avatars (portraits TODO), profiles, editorial look
- 🔜 **Per-visit photos** (your own shots on a ranking, not just the cover)
- 🔜 **Stories** — 24h "where I'm eating tonight" (drives the Tonight tab too)
- 🟡 **Short video / "reels"** of dishes and rooms — the format that actually spreads
- 🟡 **Creator / ambassador accounts** + verified local tastemakers
- 🟡 **Collections / Guides** — curated lists ("48h in Zona Colonial") that are
  followable and shareable; the SEO + creator surface
- 🔭 **Explore** — a public discovery surface beyond your graph (trending nationally,
  by cuisine, by creator) — this is what turns a utility into a time-sink

### Pillar 3 — Social Graph & Messaging
- ✅ Follow/followers, feed, cheers, activity, block/report/moderation
- 🔜 **Push notifications** (the single biggest retention lever we don't have)
- 🔜 **Friend-finding** (contacts + Instagram) surfaced continuously, not just onboarding
- 🟡 **DMs + "send this spot"** (private sharing is how food recs actually travel)
- 🟡 **Group plans / polls** ("pick the spot") — Phase 2 in the original brief
- 🟡 **Comments** on rankings (careful: moderation cost)

### Pillar 4 — Local & Nightlife
- ✅ Restaurant profiles, friends-who-ranked, reserve-by-WhatsApp handoff, similar spots
- 🔜 **Map view** (been / want-to-try / friends' picks) — Beli has it, we don't
- 🟡 **"Tonight"** live layer — who's out, what's busy, resets 6 AM (the original vision)
- 🔭 **Reservations B2B** — the real infrastructure play + first-mover gap in DR
- 🔭 **Events / tastings + ticketing** (first real monetization + UGC engine)

### Pillar 5 — Trust, Safety, Scale
- ✅ Report/block/eject, EULA, account deletion, ban gate
- 🟡 **Moderation queue tooling** + automated first-pass (scales with UGC/photos/video)
- 🟡 **Rate limiting, abuse prevention, spam detection** on follows/cheers

---

## 5. The UI/UX system (fixing "the placement and sizes are off")

The current problem isn't the palette or font — those are right. It's that the app
lacks a **system**: spacing is ad hoc, the type scale has too few steps, one card
format repeats, and there's no defined motion or navigation grammar. We fix that with
a real design system, then every screen inherits it.

### 5.1 Spatial system
- **8pt grid** already in tokens; enforce it — no magic numbers in components.
- Define **section rhythm**: screen padding, header block, content gap, rail gap as
  named tokens so every screen breathes identically.
- **Safe-area + top-bar aware** layout constants (done for TopBar; formalize).

### 5.2 Type scale (expand from 6 → ~9 steps)
Editorial needs contrast *and* density. Add steps so a feed can be dense while heroes
stay grand: `display / title / headline / subhead / body / callout / label / caption /
micro`. Restaurant name in a rail ≠ restaurant name in a hero — today they fight.

### 5.3 Component library (formalize what exists + fill gaps)
Buttons (primary/secondary/ghost/danger/pill/icon), Chips, Cards (hero/compact/rail),
Avatar + stack, Score badge, Stat tile, Rail, Sheet/Modal, Toast, Skeleton, Empty
state, Segmented control, Tab bar, Top bar. Each documented with the tokens it uses.
A `/kitchen-sink` dev route rendering all of them so regressions are visible.

### 5.4 Navigation grammar
- Bottom tabs = **destinations** (Discover, Rankings, Tonight, Profile).
- Top bar = **utilities** (search, activity, leaderboard).
- Full-screen routes = **focused flows** (rank, restaurant, user, share). *(pattern
  established)*
- Add: a proper **modal/sheet layer** for quick actions (share, report, reserve) instead
  of inline expansion.

### 5.5 Motion language
- One spring easing token *(DONE)*. Formalize: press (scale .96), enter (fade+rise),
  screen transitions, celebration stamp, cheers pop, count-ups. Everything respects
  `prefers-reduced-motion`. Motion should feel like *iOS*, not like CSS.

### 5.6 The "moments" (what people screenshot)
Placement finish, streak milestones, match reveals, share cards, "you're #X in the
city." These are the emotional peaks — they get the most design investment.

### 5.7 States, a11y, i18n
Every list: loading skeleton, empty, error, offline. Contrast/tap-target audit. And
**i18n from now** (ES default, EN toggle) — required for worldwide and cheap to add
early, expensive to retrofit.

---

## 6. Engineering architecture to actually scale worldwide

Today: single Bun/Hono API + one Postgres on Railway, Vite/Capacitor client, images
from `/public`. Great for a demo/one city. Here's the path to millions across cities
without rewrites — sequenced so we only build each piece when a metric demands it.

### 6.1 Media pipeline *(needed the moment users upload photos/video)*
- Cloudinary (already env-wired) for images; **direct-to-storage signed uploads** so
  the API never proxies bytes; automatic transforms/`f_auto,q_auto`.
- Video: Mux or Cloudinary video; HLS; thumbnail extraction. This is the biggest new
  infra when Pillar 2 video ships.

### 6.2 Feed at scale
- Today: read-time fanout (query friends' rankings). Fine to ~thousands of follows.
- At scale: **hybrid fanout** — precompute feeds for normal users, read-time for
  celebrities (the classic Twitter split). Add a `feed_entries` table + a worker.
- **Cursor pagination** already in place ✅. Add caching (Redis) for hot feeds.

### 6.3 Search & discovery
- Today: Postgres `ILIKE`. Fine for 35 spots, dies at national scale.
- **Postgres FTS** next; **dedicated search** (Typesense/Meilisearch/OpenSearch) when
  Explore + multi-city land. Geo search (PostGIS) for map + "near me".

### 6.4 Notifications
- **APNs/FCM via Capacitor Push**; a notifications service + `notifications` table;
  batching + quiet hours; the activity feed becomes the in-app mirror. *(This is the
  #1 retention gap and should be early v3.)*

### 6.5 Multi-city & i18n
- `cities` as a first-class entity (neighborhoods belong to a city); feeds, leaderboards,
  trending all scoped by city. Content i18n (ES/EN → more). Currency/locale for reserve.

### 6.6 Reliability & ops
- Move off single-instance: managed Postgres w/ replicas, connection pooling ✅ (already
  centralized), read replicas for feed reads. Observability (Sentry + structured logs +
  metrics). Rate limiting at the edge. Backups + migration discipline (already using
  Drizzle migrations ✅).

### 6.7 Moderation at scale
- Automated first-pass (image/text classifiers) feeding the human queue we have the
  primitives for; audit trail (already soft-delete + ban) ✅.

---

## 7. The city-launch playbook (how we actually grow, Beli-style)

Beli grew campus-by-campus. We grow **neighborhood-by-neighborhood, city-by-city**:
1. **Seed the map** — pre-load the city's real spots with photos + geo (no empty map).
2. **Recruit ~20 tastemakers** — local food accounts; give them creator profiles and
   pre-built guides so day-one feels alive (our seed generator is the demo version of
   this).
3. **One dense friend cluster**, not scattered testers (cold-start is the #1 risk —
   already the guiding constraint).
4. **Share loop turns them into acquisition** — their Top-5 cards hit local IG.
5. **Measure k-factor + D30 per city; only then spend.**
6. Repeat: Santo Domingo → Santiago → Punta Cana → San Juan → Miami (DR diaspora) →
   LatAm metros.

---

## 8. Monetization (later, but design for it now)

- **Free forever** for the social/ranking core (network effects > early revenue).
- **Reservations B2B** — restaurant dashboards, the real DR infrastructure gap. *(Phase 3)*
- **Promoted spots / claim-your-restaurant** — native, tasteful, clearly labeled.
- **Events & tastings + ticketing** — real-world exception lets us use external
  payment; digital unlocks must use Apple IAP (already flagged in APPSTORE.md).
- **Mesa Pro** (maybe) — advanced taste analytics, unlimited guides. Low priority.

Design implication: keep `isDemo`/ownership clean and restaurants as first-class so a
B2B side can attach later without a migration.

---

## 9. Metrics that matter

- **North star:** weekly *active rankers* (people who ranked ≥1 spot this week) — it
  compounds content, recs, and the social loop at once.
- **Acquisition:** k-factor (invites × conversion). **Activation:** % following ≥5 &
  ranked ≥3 in week 1. **Retention:** D7/D30 by city cohort. **Engagement:** sessions/wk,
  feed dwell, cheers/user. **Loop health:** share-cards generated → tap-throughs → signups.

---

## 10. Sequenced build plan (what to actually do next)

**v2 — Beli parity + chrome + 10x data.** ✅ DONE (this session): 0–10 scores,
sentiment, match %, leaderboard, streaks, taste profile, tags/dish, recs + trending
rails, top bar + bell + activity, dense mock world.

**v3 — "Make the loops real"** (highest ROI, ~2–3 milestones)
1. **Push notifications** (retention) + notification settings.
2. **Public deep-link previews** for share cards/profiles (the share loop currently
   dead-ends) + real invite links.
3. **Map view** (been/want/friends) — closes the last obvious Beli gap.
4. **Per-visit photo upload** on rankings (first real user content).
5. **Portrait avatars** (regen the failed batch) + avatar everywhere.
6. **Design-system formalization** (§5) + `/kitchen-sink` + i18n scaffolding.

**v4 — "The content leap"** (the Instagram differentiator)
Stories → short video → collections/guides → Explore. Media pipeline (§6.1), search
upgrade (§6.3), feed fanout (§6.2).

**v5 — "Local depth"**
Tonight live layer, group plans, DMs/send-a-spot, multi-city (§6.5).

**v6+ — "Moat & money"**
Reservations B2B, events/ticketing, creator program, taste-graph recs.

Each vX stays browser-verifiable and shippable, same discipline as M0–M5.

---

## 11. Risks & honest tradeoffs

- **Scope vs. the founding brief.** `CLAUDE.md` says "essential complexity only." This
  roadmap is deliberately expansionary; we should gate each pillar on a metric, not
  build ahead of demand. The v3 list is the disciplined core; v4+ is real but earn-it.
- **Content moderation cost** rises steeply with photos/video/comments. Automated
  first-pass is not optional at scale.
- **The "next Instagram" bar is content + habit, not features.** If we only reach Beli
  parity we've built a good regional Beli, not a worldwide network. The content leap
  (Pillar 2 / v4) is the actual bet — everything before it is table stakes.
- **Native + submission is still unbuilt** (Xcode, TestFlight — see `SUBMISSION.md`).
  No worldwide anything until it's on the App Store, seeded, in one real cluster.
- **Cost.** Media + push + search + multi-region is real money; sequence it behind
  traction, not ahead of it.
