// Dynamic config layered over app.json: everything static stays in app.json; the
// one build-time secret — the @rnmapbox/maps SDK download token — is injected from
// the environment so it never lives in a committed file. The founder/EAS sets
// RNMAPBOX_MAPS_DOWNLOAD_TOKEN (a sk.… secret token) at build time; CocoaPods reads
// it directly from ENV during pod install (rnmapbox-maps.podspec) — it is NOT the
// public runtime token (EXPO_PUBLIC_MAPBOX_TOKEN, a pk.… token). No plugin option
// needed: the older `RNMapboxMapsDownloadToken` plugin option is deprecated as of
// the current @rnmapbox/maps version (console warning in withMapbox.js) in favor of
// this env var, read straight from ENV by the podspec — passing the deprecated
// option here was silently producing an empty/stale value and causing CocoaPods'
// Mapbox download to fail with a 401.
const appJson = require('./app.json')

module.exports = () => {
  const config = { ...appJson.expo }

  // Strip the boilerplate purpose strings Expo's prebuild template adds for
  // permissions Mesa never asks for (see the plugin's own header).
  config.plugins = [...(config.plugins ?? []), './plugins/withTrimmedPurposeStrings']

  // PostHog's config plugin links the @posthog/react-native-plugin native
  // module (native crash capture) and wires up source-map upload for
  // readable stack traces. Added only when EXPO_PUBLIC_POSTHOG_KEY is set —
  // the same variable that gates the client itself (src/lib/analytics.ts) —
  // so a build without a PostHog key still succeeds with the plugin simply
  // absent, same graceful-dark posture as everything else keyed off it.
  if (process.env.EXPO_PUBLIC_POSTHOG_KEY) {
    config.plugins = [...(config.plugins ?? []), 'posthog-react-native/expo']
  }

  // Google Sign-In (M10) needs its iOS URL scheme registered in Info.plist so
  // the OAuth redirect can return to the app. That scheme is always the iOS
  // client id with its ".apps.googleusercontent.com" suffix swapped for a
  // "com.googleusercontent.apps." prefix (Google's fixed, documented
  // REVERSED_CLIENT_ID format) — derived here so there's one source of truth
  // (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) instead of two env vars that could
  // drift out of sync. Added only when the client id is set, same graceful-
  // dark posture as the PostHog plugin above: no key, no plugin, and the
  // Google button in AuthFlow.tsx doesn't render either.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  if (iosClientId) {
    // Google's client id is a bare identifier, never a URL — a stray
    // "http://" pasted in front of it (easy to do copying from a browser bar)
    // still satisfies a plain endsWith(".apps.googleusercontent.com") check,
    // so it slipped through here silently once and produced a broken URL
    // scheme plus a cryptic 400 from Google at sign-in time instead of a
    // build-time error. Validate the *whole* shape now, not just the suffix.
    if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(iosClientId)) {
      throw new Error(
        `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID doesn't look like a Google iOS client id ` +
          `(expected "<digits>-<hash>.apps.googleusercontent.com", got "${iosClientId}"). ` +
          `Copy it again from Google Cloud Console -> Credentials -> the iOS client.`,
      )
    }
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`
    config.plugins = [
      ...(config.plugins ?? []),
      ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    ]
  }

  // Universal links so the password-reset / verify-email emails open the app
  // instead of a browser. The domain is where APP_ORIGINS points and where the
  // apple-app-site-association file is hosted (the API can serve it beside /p/*);
  // set APP_LINK_DOMAIN (e.g. mesa.app) at build — the mesa:// scheme still works
  // regardless. Founder step: register the domain's associated-domains entitlement.
  if (process.env.APP_LINK_DOMAIN) {
    config.ios = {
      ...config.ios,
      associatedDomains: [`applinks:${process.env.APP_LINK_DOMAIN}`],
    }
  }
  return config
}
