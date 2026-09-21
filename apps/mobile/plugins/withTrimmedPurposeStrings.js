const { withInfoPlist } = require('@expo/config-plugins')

// Expo's iOS prebuild template seeds Info.plist with a purpose string for every
// permission it knows about — Face ID, microphone, motion, always-on location —
// each reading the stock "Allow $(PRODUCT_NAME) to access your …". Mesa asks for
// none of those four. Shipping them means App Review reads a promise the app
// never keeps, and a reviewer reasonably asks why a restaurant app wants the
// microphone. `ios/` is gitignored and regenerated on every prebuild, so hand
// editing Info.plist does not survive; this strips them at build time instead.
//
// The four Mesa DOES use — camera, photo library, contacts, when-in-use
// location — keep the real Spanish sentences set in app.json / the expo-location
// and expo-image-picker plugin options. Never add a key here that the app asks
// for at runtime: a missing purpose string is an instant crash on first prompt.
const UNUSED = [
  'NSFaceIDUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSMotionUsageDescription',
  'NSLocationAlwaysUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  // Expo Dev Launcher's own string ("Allow Expo Dev Launcher to find local
  // devices") — dev-client plumbing that has no business in a store build.
  'NSLocalNetworkUsageDescription',
]

module.exports = (config) =>
  withInfoPlist(config, (cfg) => {
    for (const key of UNUSED) delete cfg.modResults[key]
    return cfg
  })
