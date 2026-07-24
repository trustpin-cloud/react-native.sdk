// Expo resolves `@trustpin/react-native` as a config plugin through this file.
// The plugin runs in Node during prebuild, so it ships as a separate CommonJS
// build that never imports react-native.
module.exports = require('./plugin/build');
