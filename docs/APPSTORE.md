# Mesa — App Store Compliance

Mesa ships to iOS as a **Vite/React app wrapped with Capacitor**. That is
allowed, but Capacitor apps get extra scrutiny under guideline 4.2, and a social
app with user content and social login triggers several hard requirements. Treat
this as a build constraint, not a submission-day checklist — the starred items
are architectural and are built during Phase 1, not bolted on at the end.

## ★ Architectural — build these into Phase 1

### 4.8 — Sign in with Apple is required (build in M1/M2)
Because Mesa offers **Instagram login**, Apple requires an equivalent
privacy-focused login option. Sign in with Apple qualifies. It must be offered
wherever Instagram login is offered, with equal prominence. Wire it in Better
Auth alongside Instagram from the first auth commit — retrofitting a second
identity provider later is painful.

### 1.2 — User-generated content controls (build in M3)
Vibe notes (and later social posts) are UGC. Apple requires, at minimum:
- A **EULA/terms** the user agrees to (an Apple-standard EULA is acceptable).
- A way to **report** objectionable content.
- A way to **block** abusive users.
- The ability to **remove** content and **eject** users.
Ship the `reports` + `user_blocks` tables and the report/block actions together
with the notes feature. Without these, a UGC app is rejected.

### 5.1.1(v) — In-app account deletion (build in M5)
Any app that lets users create an account must let them **delete** it from
inside the app (not just deactivate, not "email us"). Deletion must cascade
across their data. Put it in profile settings.

## Submission-day requirements (verify in M5)

### 4.2 — Minimum functionality (WebView apps)
A Capacitor app must not read as "just a website." Mesa clears this via real
native capability: contact import, push notifications, native share, MapBox
maps, camera/photo picker. Keep at least a few of these genuinely native so the
app is clearly more than a wrapped web page.

### 5.1 — Privacy
- **Privacy policy URL** + **terms URL**, reachable in-app and on the store page.
- **App Privacy "nutrition label"** in App Store Connect: declare exactly what
  you collect (account info, contacts, usage) and how it's used.
- **Purpose strings** in `Info.plist` for every sensitive API, e.g.
  `NSContactsUsageDescription`, `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`
  (MapBox). Each must be a real human sentence explaining the why.
- **Just-in-time permission prompts** — request a permission at the moment the
  feature is used, never at launch.

### 4.5 — Third-party login / API terms
Instagram/Facebook login must comply with Meta's platform terms and use their
official OAuth. No scraping of Instagram data — use the sanctioned graph/login
scopes only. (This also matches the app's own privacy posture.)

### 3.1.1 — Payments (relevant in Phase 2, not now)
When event ticketing arrives: **physical/real-world event tickets** can use an
external payment processor (real-world experience exception). Anything that is a
**digital** good or unlocks in-app features must use Apple In-App Purchase. Don't
route digital unlocks through Stripe. Flag this when Phase 2 ticketing starts.

### Push notifications
- Ask for push permission with context (after onboarding, not on first launch).
- No purely promotional pushes without a documented opt-in.

### App Tracking Transparency (ATT)
If any analytics/ads SDK tracks users across other apps/sites, you must show the
ATT prompt. Phase 1 avoids cross-app tracking, so ATT is likely N/A now — revisit
if an ad/attribution SDK is ever added.

## Quick pre-submission checklist
- [ ] Sign in with Apple present next to Instagram
- [ ] Report content + block user + remove/eject working
- [ ] EULA accepted at signup
- [ ] In-app account deletion (cascading)
- [ ] Privacy policy + terms URLs live
- [ ] App Privacy nutrition label filled in App Store Connect
- [ ] All `Info.plist` purpose strings written, permissions prompted just-in-time
- [ ] App demonstrably more than a WebView (native plugins active)
- [ ] Official Meta OAuth, no scraping
- [ ] TestFlight build green, seeded with a dense friend cluster
