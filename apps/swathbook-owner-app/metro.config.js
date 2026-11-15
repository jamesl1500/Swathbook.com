// Metro config: Expo's defaults (which already watch the pnpm workspace), plus
// one rule for the shared @swathbook/mobile package.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, '../../packages/mobile') + path.sep;
const appRoot = path.join(__dirname, 'package.json');

// The shared package's own imports (react, react-native, expo-*, …) resolve
// from this app, so the bundle never holds two copies of React.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  const fromShared = context.originModulePath.startsWith(shared);
  return context.resolveRequest(bare && fromShared ? { ...context, originModulePath: appRoot } : context, moduleName, platform);
};

module.exports = config;
