# Mesa — TestFlight & App Store submission

What is left to get Mesa in front of external testers, in order. This replaces
the Capacitor-era version of this file: the app is Expo / React Native
(`apps/mobile`), built with **EAS**, and the API is already live on Railway.
Anything marked **founder** needs an account, a key or a legal decision that
can't be done from the dev environment.

## Where it stands

|           |                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| API       | live on Railway, `/health` 200, migrations run on deploy (`railway.json` `preDeployCommand`)               |
| Auth      | email+password, Sign in with Apple (configured on prod — the server answers as a live provider), phone OTP |
| 1.2 (UGC) | report + block + moderator queue + EULA acceptance, all shipped                                            |
| 5.1.1     | in-app account deletion, hard delete with cascade (`apps/api/src/routes/me.ts`)                            |
| Builds    | `development` and `preview` profiles have built; **`production` has never run**                            |
| Checks    | tsc, biome and tests green across mobile / api / db                                                        |

## 1. Founder: accounts and keys

| What                             | Why                                                                                 | How                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **App Store Connect app record** | TestFlight needs it; it issues the `ascAppId`                                       | appstoreconnect.apple.com → Apps → + → bundle id `com.mesasocial.app`         |
| **Sentry DSN**                   | crash reports from testers; without it `lib/errors.ts` no-ops                       | `eas env:create production --name EXPO_PUBLIC_SENTRY_DSN --value <dsn>`       |
| **PostHog key**                  | product analytics; without it `lib/analytics.ts` no-ops                             | same, `EXPO_PUBLIC_POSTHOG_KEY` (+ `EXPO_PUBLIC_POSTHOG_HOST` if self-hosted) |
| **Sentry org/project**           | readable native stack traces (source maps)                                          | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` on the production env     |
| **Domain** (deferred)            | universal links + a support address; `APP_LINK_DOMAIN` turns on `associatedDomains` | buy, then set the env var and host `apple-app-site-association`               |

Set secrets with a shell that does not echo them:

```bash
cd apps/mobile && read -s "DSN?Sentry DSN: " && bunx eas-cli@latest env:create production --name EXPO_PUBLIC_SENTRY_DSN --value "$DSN" --visibility sensitive
```

Also delete the stale `RNMAPBOX_DOWNLOAD_TOKEN` variable (wrong name, superseded
by `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, which is the one the podspec reads).

## 2. Founder: production data hygiene

- **Delete the demo account** (`demo@mesa.test`). Its password has been typed in
  plain text; it must not exist once outsiders have a build.
  `apps/api/src/delete-user.ts` (dry-run first).
- **Invented catalog data**: the seed gives real Santo Domingo restaurants fake
  phone numbers (`+1809555…`) and guessed homepages. Clear them on prod before
  strangers start calling: `apps/api/src/clean-catalog-contacts.ts --dry-run`.
- **Mock events** are fictional events at real venues. Fine while the testers are
  friends; get the venue's OK before anyone outside that circle installs.

## 3. Build

```bash
cd apps/mobile && bunx eas-cli@latest build --profile production --platform ios
```

`production` is the only profile with `autoIncrement`, and `appVersionSource:
"remote"` means EAS owns the build number. First run will ask for signing: let
EAS manage the distribution certificate and provisioning profile, and make sure
the App ID has **Sign in with Apple** and **Push Notifications** enabled.

Then:

```bash
bunx eas-cli@latest submit --profile production --platform ios --latest
```

Fill `eas.json`'s `submit.production` with `appleId`, `ascAppId` and
`appleTeamId` once the App Store Connect record exists, so this stops prompting.

## 4. App Store Connect, before external testing

External TestFlight goes through **Beta App Review** (lighter than full review,
but it is a review).

- **Privacy Policy URL**: `https://<api-domain>/legal/privacy` (served by the API).
- **Terms / EULA URL**: `/legal/terms`, `/legal/eula`.
- **App Privacy questionnaire**: account info (identity), contacts (matched, not
  stored), photos, coarse location, usage + diagnostics. No tracking across apps,
  no IDFA → no ATT prompt.
- **Beta App Review info**: a contact email (yours is fine, it is not shown to
  users), plus a **fresh reviewer account** — create one in the app, do not reuse
  the demo account.
- **What to test** notes: name the flows (rank a spot, an event RSVP, save,
  comment), and say the catalog is real Santo Domingo places with sample activity.
- **Export compliance**: already answered by `ITSAppUsesNonExemptEncryption: false`.

## 5. After the first green build

- Add **`expo-updates`** so JS-only fixes reach testers without a new build.
- Seed the beta with **one dense friend cluster**, not scattered testers —
  cold-start is the product risk, not the build.
- Watch Sentry for the first crash-free-session number before widening.

## Definition of done

A build on TestFlight that a stranger can install, sign in to with Apple or
email, rank a place, see a friend's ranking, and delete their account from
inside the app — with the legal pages reachable in-app and on the web.
