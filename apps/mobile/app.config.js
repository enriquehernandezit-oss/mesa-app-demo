// Dynamic config layered over app.json: everything static stays in app.json; the
// one build-time secret — the @rnmapbox/maps SDK download token — is injected from
// the environment so it never lives in a committed file. The founder/EAS sets
// RNMAPBOX_DOWNLOAD_TOKEN (a sk.… secret token) at build time; it's read only by
// the config plugin during prebuild (CocoaPods needs it to fetch the Mapbox SDK)
// and is NOT the public runtime token (EXPO_PUBLIC_MAPBOX_TOKEN, a pk.… token).
const appJson = require('./app.json')

module.exports = () => {
  const config = { ...appJson.expo }
  config.plugins = (config.plugins ?? []).map((p) =>
    p === '@rnmapbox/maps'
      ? ['@rnmapbox/maps', { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_DOWNLOAD_TOKEN ?? '' }]
      : p,
  )

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
