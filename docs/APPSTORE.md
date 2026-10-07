# Mesa — App Store Compliance

Mesa ships to iOS as an **Expo / React Native app** (`apps/mobile`) — see
`docs/FEATURES.md` for what's built. A social app with user content and social
login triggers several hard requirements regardless of the client stack.
Treat this as a build constraint, not a submission-day checklist — the starred
items are architectural and are built during Phase 1, not bolted on at the end.

## ★ Architectural — build these into Phase 1

### 4.8 — Sign in with Apple is required (build in M1/M2)

Because Mesa offers a third-party login (**Google**), Apple requires an equivalent
privacy-focused login option. Sign in with Apple qualifies. It is offered beside
Google with equal prominence, both wired in Better Auth. (Instagram is not a login
method: it is only an optional @handle shown on a profile.)

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

### 4.2 — Minimum functionality

Mesa is a native app (React Native), not a wrapped website, and uses real native
capability: contact matching, push notifications, native share, Mapbox maps,
the camera and photo picker.

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

Google sign-in uses Google's official native SDK and token verification. Mesa does
not log in with Instagram and does not scrape it: the friends import reads the
member's own Instagram data export, picked from the phone and parsed on it, and
only the handles are matched.

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

Status as of the end of Phase 1 build (M5). ✅ = built & verified in-app; ⬜ = a
config/account action that happens at submission (see `docs/SUBMISSION.md`).

- [x] Sign in with Apple present next to Google — auth screen, equal prominence (env-gated, turns on with the provider credentials)
- [x] Report content + block user + remove/eject working — verified end to end (M3)
- [x] EULA accepted at signup — required checkbox in onboarding; recorded server-side
- [x] In-app account deletion (cascading) — Settings → Delete account (below Sign out) → DELETE /me, cascade verified (M5)
- [x] Privacy policy + terms URLs live — real copy, written against what the app actually does, in the app (`/legal/privacy`, `/legal/terms`, `/legal/eula`) and hosted publicly by the API at the same paths (`<API origin>/legal/…`, no auth). Canonical text: `apps/api/src/lib/legalCopy.ts`, mirrored in `apps/mobile/src/app/legal/[doc].tsx`. Still wants a lawyer's read before the public release
- [ ] App Privacy nutrition label filled in App Store Connect — declare: account info, contacts (matched, not stored), usage
- [x] All `Info.plist` purpose strings written — as the Expo plugin options in `apps/mobile/app.json` (location, photos, camera, contacts); each is a real sentence naming the why
- [x] App demonstrably more than a WebView — it is a native app: contacts, push, Mapbox maps, camera/photo, share sheet satisfy 4.2
- [x] No Instagram login and no scraping — the handle is display text; the friends import reads the member's own export on the phone
- [x] TestFlight build live (since 2026-09-23) — seeding it with a dense friend cluster is the open part (see SUBMISSION.md)

See **`docs/SUBMISSION.md`** for the exact remaining steps and what each needs.
