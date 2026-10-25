// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs SQLite as WebAssembly in a worker.
config.resolver.assetExts.push('wasm');

// The web player (@rntp/player) optionally loads shaka-player for HLS streams.
// Nova only plays local files, so resolve it to an empty module instead of
// installing a large dependency that would never run.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'shaka-player') return { type: 'empty' };
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// expo-sqlite on web needs SharedArrayBuffer, which browsers only allow on
// cross-origin-isolated pages.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
