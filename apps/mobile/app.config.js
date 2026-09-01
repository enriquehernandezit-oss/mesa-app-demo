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
  return config
}
