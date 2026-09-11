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

  // Sentry's config plugin uploads source maps at build time, which needs
  // SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN. Added only when the org and
  // project are present, so a build without Sentry credentials still succeeds —
  // JS errors are still captured either way (see src/lib/errors.ts); the plugin
  // is what turns a minified native stack trace into a readable one.
  if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
    config.plugins = [
      ...(config.plugins ?? []),
      [
        '@sentry/react-native/expo',
        { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT },
      ],
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
