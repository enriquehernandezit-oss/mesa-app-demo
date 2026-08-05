# Mesa — Submission steps (what's left, and what each needs)

Phase 1 is functionally complete and verified in the browser. The remaining work
is **accounts, keys, and the native build** — things that can't be done from the
dev environment. This is the ordered list.

## 1. Credentials & keys (unblock features that are env-gated)

Each of these is wired and turns on the moment its env vars exist — no code
change. Set them in the relevant `.env` (see each app's `.env.example`).

| What | Where it turns on | Env vars |
|------|-------------------|----------|
| **Sign in with Apple** (required, 4.8) | `apps/api/.env` | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_ID` |
| **Instagram login** (4.5) | `apps/api/.env` | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` (+ endpoints if Meta assigns) |
| **Phone OTP (real SMS)** | `apps/api/.env` | `SMS_PROVIDER_API_KEY` (swap the dev console sender in `auth.ts`) |
| **MapBox map** | `apps/app/.env` | `VITE_MAPBOX_TOKEN` (public `pk.` token) |
| **Cloudinary photos** | `apps/app/.env` | `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` |

Without these the app still runs: phone works via a dev console code, and the map
/ cover image show a branded fallback.

## 2. Accounts to create (yours, needs your details)

- **Apple Developer Program** — $99/yr. Required for Sign in with Apple and any
  TestFlight/App Store build. Enroll at developer.apple.com.
- **Meta app** — for Instagram Login (Instagram Basic Display is retired; use the
  Instagram Login flow Meta assigns). Configure OAuth redirect to the API.
- **Railway** — deploy `apps/api` + Postgres (M1 was proven on local Postgres).
- **Cloudinary** + **MapBox** accounts for the keys above.

## 3. Content to finalize (you / counsel)

- **Privacy Policy + Terms + EULA copy** — in-app drafts live at `/privacy`,
  `/terms`, `/eula` (`apps/app/src/screens/legal/LegalPage.tsx`). Replace the
  DRAFT copy with counsel-approved text, or point them at hosted URLs.
- **Real restaurant WhatsApp numbers** — seed uses demo numbers
  (`+1809555XXXX`, flagged `isDemo`). Replace with real numbers for launch.
- **App Privacy nutrition label** — in App Store Connect, declare: account info
  (identity), contacts (matched server-side, never stored), usage. No cross-app
  tracking, so no ATT prompt in Phase 1.

## 4. Native build → TestFlight (needs a Mac with Xcode)

Prereqs: **Xcode.app** (full install, not just Command Line Tools) + CocoaPods.

```bash
cd apps/app
bun run cap:add:ios          # generates apps/app/ios/
# paste the Info.plist purpose strings from docs/NATIVE.md
bun run cap:sync             # vite build + copy web assets
bunx cap open ios            # open in Xcode, set team + bundle id, archive
```

- Enable **Sign in with Apple** capability on the App ID.
- Archive → upload to **TestFlight**. CI option: a **GitHub Actions macOS runner**
  or **Codemagic** (Ionic Appflow is winding down — see `docs/NATIVE.md`).
- Seed the beta with **one dense real friend cluster**, not scattered testers
  (cold-start is the #1 risk).

## 5. Tag the beta

Once a TestFlight build is green:

```bash
git tag v0.1.0-beta
git push --tags
```

## Definition of done (Phase 1) — status

Sign in → onboarded with a starting ranking + friends → rank via pairwise with
vibe notes → follow people → a full feed of friends' rankings → view a restaurant
→ save it → request a table via WhatsApp handoff. All in the fixed Mesa brand,
with pooling + no-N+1 + caching from commit #1, and the App Store guardrails
(Apple sign-in, UGC report/block/remove, in-app account deletion, privacy strings
+ label) in place. **Remaining: the account/keys/native steps above.**
