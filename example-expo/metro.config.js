const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const packageRoot = path.resolve(__dirname, '..');

/**
 * The example consumes the library from source (`file:..`), so Metro has to
 * watch the parent directory. The parent keeps its own node_modules for
 * typechecking and tests; forcing react and react-native to resolve from the
 * example prevents a second copy from being bundled.
 */
const config = getDefaultConfig(__dirname);

config.watchFolders = [packageRoot];
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};
config.resolver.blockList = [
  new RegExp(`${path.join(packageRoot, 'node_modules', 'react-native')}/.*`),
  new RegExp(`${path.join(packageRoot, 'node_modules', 'react')}/.*`),
];

module.exports = config;
