import { ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins';

import { withTrustPinAndroid } from './android';
import { withTrustPinIos } from './ios';
import { resolveProps, TrustPinPluginProps } from './types';

const pkg = require('../../package.json');

/**
 * Wires TrustPin certificate pinning into an Expo app at prebuild time:
 * writes the native credential files, calls the native init helper before
 * React Native starts on both platforms, and pins the Android toolchain
 * requirements of the native SDK.
 *
 * Expo Go cannot run this — pinning is native code. Use a development build.
 */
const withTrustPin: ConfigPlugin<TrustPinPluginProps | undefined> = (config, props) => {
  const resolved = resolveProps(props);
  return withTrustPinAndroid(withTrustPinIos(config, resolved), resolved);
};

export default createRunOncePlugin(withTrustPin, pkg.name, pkg.version);
export type { TrustPinPluginProps };
