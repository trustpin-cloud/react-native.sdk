const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const packageRoot = path.resolve(__dirname, '..');

/**
 * The example app consumes the library from source (`file:..`), so Metro has to
 * watch the parent directory. The parent keeps its own node_modules for
 * typechecking and tests; forcing react and react-native to resolve from the
 * example prevents a second copy from being bundled.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [packageRoot],
  resolver: {
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
    blockList: [
      new RegExp(`${path.join(packageRoot, 'node_modules', 'react-native')}/.*`),
      new RegExp(`${path.join(packageRoot, 'node_modules', 'react')}/.*`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
