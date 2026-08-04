# Mesa — Native (Capacitor) setup

The app is a Vite/React SPA wrapped with Capacitor. Through M2–M4 it is verified
in the browser (`bun run --filter @mesa/app dev`). The native iOS/Android
projects are generated later, once the platform toolchains are installed — they
are **not** committed (see `.gitignore`).

## Generating the native projects

Prerequisites:

- **iOS:** Xcode.app (full install, not just Command Line Tools) + CocoaPods.
- **Android:** Android Studio + SDK.

Then, from `apps/app`:

```bash
bun run cap:add:ios       # generates apps/app/ios/
bun run cap:add:android   # generates apps/app/android/
bun run cap:sync          # vite build + copy web assets into the shells
```

Open the iOS project in Xcode with `bunx cap open ios`.

## Info.plist purpose strings (App Store 5.1)

Every sensitive API needs a human-sentence purpose string, and the permission is
requested **just-in-time** (never at launch — the code already does this). After
`cap add ios`, add these to `apps/app/ios/App/App/Info.plist`:

| Key | Value |
|-----|-------|
| `NSContactsUsageDescription` | Mesa matches your contacts to people you already know here, so your feed starts with friends. Your contacts are never posted or shared. |
| `NSCameraUsageDescription` | Take a photo to add to a place you're ranking or to your profile. |
| `NSPhotoLibraryUsageDescription` | Choose a photo from your library for a place you're ranking or your profile. |
| `NSLocationWhenInUseUsageDescription` | Mesa uses your location to show nearby spots and place map pins. (MapBox, added in M5.) |

Camera/photo/location strings are staged now so they're ready when M5 wires
Cloudinary uploads and the MapBox map; contacts is live in M2 onboarding.

## Sign in with Apple (App Store 4.8)

Because Instagram login is offered, Sign in with Apple must appear alongside it
(the auth screen already does, at equal prominence). Enable the **Sign in with
Apple** capability on the App ID in the Apple Developer portal, and set the
server env vars (`APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`,
`APPLE_APP_BUNDLE_ID`) — see `apps/api/.env.example`.

## CI note (M5)

Ionic Appflow is winding down (no new signups since Feb 2025; access ends Dec
2027) and Microsoft App Center shut down in March 2025. For TestFlight builds use
a **GitHub Actions macOS runner** or **Codemagic** instead — this supersedes the
"Ionic Appflow" mention in `BUILD_PLAN.md`/`CLAUDE.md`.
