// Standard Expo Metro config + NativeWind. apps/mobile is a standalone project
// (see bunfig.toml) with its own flat node_modules, so no monorepo watchFolders
// or extra resolver paths are needed.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

module.exports = withNativeWind(config, { input: './src/global.css' })
