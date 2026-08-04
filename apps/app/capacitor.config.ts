import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the same Vite build as the iOS/Android app. The native
// projects (ios/, android/) are generated with `bun run cap:add:ios` /
// `cap:add:android` once the platform toolchains are installed (Xcode / Android
// Studio) — see docs/NATIVE.md. Until then the app runs in the browser via Vite,
// which is how M2–M4 are verified.
const config: CapacitorConfig = {
  appId: 'com.mesa.app',
  appName: 'Mesa',
  // Vite's production output. `cap sync` copies this into the native shells.
  webDir: 'dist',
  ios: {
    // Cream text on oxblood — no white flash before the web layer paints.
    backgroundColor: '#210104',
  },
  android: {
    backgroundColor: '#210104',
  },
}

export default config
