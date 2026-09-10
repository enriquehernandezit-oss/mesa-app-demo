// NativeWind (jsxImportSource) + Reanimated. babel-preset-expo ~57 auto-
// registers react-native-worklets/plugin (last, as required) — an explicit
// entry here double-registers it.
module.exports = (api) => {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  }
}
