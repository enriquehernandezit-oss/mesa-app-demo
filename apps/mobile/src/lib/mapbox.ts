// Whether the real Mapbox map can render — split out from components/MesaMap.tsx
// on purpose: that file's top-level `import ... from '@rnmapbox/maps'` touches
// the native module the instant the FILE is loaded, before any runtime check
// gets a chance to gate it. A binary built without the native module linked
// (an accidental Expo Go run, a build missing the CocoaPods step) would crash
// on that import alone. Callers (map.tsx, place-map.tsx) import HAS_MAP_TOKEN
// from here — a plain env read, no native code — and only require('MesaMap')
// once they already know it's safe to.
export const HAS_MAP_TOKEN = Boolean(process.env.EXPO_PUBLIC_MAPBOX_TOKEN)
