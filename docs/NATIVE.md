# Mesa — Native (Expo) setup

The app is an **Expo / React Native** project at `apps/mobile`, iOS-first. It
replaced the Vite/Capacitor client; there is no web app any more (the only web
surface is the API's server-rendered `/p/*` share pages).

## Why `apps/mobile` is not a workspace member

It is deliberately **standalone** — excluded from the root `workspaces` array,
with its own `bunfig.toml` setting `linker = "hoisted"`. Metro and Babel cannot
resolve transitively-required plugins (e.g. `babel-preset-expo` →
`@babel/plugin-transform-react-jsx`) under Bun's default isolated store, so the
app needs a flat `node_modules`. Install from inside the directory:

```bash
cd apps/mobile && bun install
```

Because it can't import workspace packages, it keeps its own copy of the API
response types in `src/lib/types.ts` — keep that in sync when the Drizzle schema
changes.

## Running it

```bash
cd apps/mobile
bun run start          # Metro; open in a dev client
bun run ios            # build + run on the iOS simulator (needs Xcode + CocoaPods)
```

Expo Go is **not** enough: `@rnmapbox/maps`, `expo-apple-authentication` and
`expo-glass-effect` are native modules, so a **dev client** (or an EAS build) is
required.

## iOS-native surfaces (the A-series pass)

Mesa draws one line: **content is Mesa, chrome is iOS** (see CLAUDE.md's Design
section). In practice that means these are real system components, not styled
`View`s, and only prove out on a device:

| Surface | Built on |
| --- | --- |
| Tab bar | `expo-router/unstable-native-tabs` + a floating `expo-glass-effect` action button. **Unstable API** — `(tabs)/_layout.tsx` keeps the previous custom bar behind a `NATIVE_TABS` flag; flip it to `false` if a device report is bad. |
| Navigation bars | native-stack `headerLargeTitle` + `headerBlurEffect`, with Mesa's serif via `headerTitleStyle`. Utility screens only; content screens stay immersive. |
| Search (Explore) | `headerSearchBarOptions` — which is why Explore has its own nested Stack. |
| Sheets, alerts, confirms | `ActionSheetIOS` through `lib/actionSheet.ts`. Every call is told the **resolved** theme explicitly. |
| Compose flows | `presentation: 'modal'` on `/rank` and `/dish`; drag-to-dismiss runs the same `beforeRemove` guards as the back gesture. |
| Forms | `textContentType` pairs turn on iCloud Keychain; `components/ui/Field.tsx` centralizes the theme-aware keyboard. |

Anything glass calls `isLiquidGlassAvailable()` and falls back to an opaque
surface, so pre-iOS-26 devices lose the material, never the control.

Verification that works without a Mac toolchain — used throughout the migration:

```bash
bunx tsc --noEmit                      # strict types
bunx expo export --platform ios        # proves the Metro bundle builds
cd ../.. && bun run lint               # biome, repo-wide
```

## Configuration

`app.json` holds the static config; **`app.config.js`** layers on the two things
that must come from the environment:

- `RNMAPBOX_DOWNLOAD_TOKEN` — the MapBox **SDK download token** (`sk.…`), read by
  the `@rnmapbox/maps` config plugin at prebuild so CocoaPods can fetch the native
  SDK. Build-time only; never shipped in the bundle.
- `APP_LINK_DOMAIN` — the universal-link domain, which becomes
  `ios.associatedDomains: ["applinks:<domain>"]` so password-reset and
  verify-email links open the app instead of a browser.

Runtime config is `EXPO_PUBLIC_*` in `.env` (see `.env.example`): the API URL, the
**public** MapBox token (`pk.…`), and the Cloudinary cloud name.

## Permission strings (App Store 5.1)

All requested **just-in-time**, never at launch, with purpose strings set through
the config plugins in `app.json`:

| Capability | Plugin | Asked when |
| --- | --- | --- |
| Location | `expo-location` | tapping "Cerca" / "Ubícame en el mapa" |
| Photos | `expo-image-picker` | attaching a dish photo or avatar |
| Camera | `expo-image-picker` | taking a dish photo |
| Contacts | `expo-contacts` | tapping "Buscar amigos en tus contactos" |

## iOS delivery

**EAS Build → TestFlight → App Store.** Needs the Apple Developer account (with
the Sign in with Apple capability enabled on `com.mesa.app`) and both MapBox
tokens above. The associated-domains entitlement must also be registered for
`APP_LINK_DOMAIN`, and that domain must serve an `apple-app-site-association`
file — the API can serve it alongside `/p/*`.
