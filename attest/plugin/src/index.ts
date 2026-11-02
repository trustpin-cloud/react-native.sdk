import { ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins';

import { withTrustPinAttestAndroid } from './android';
import { withTrustPinAttestIos } from './ios';
import { resolveProps, TrustPinAttestPluginProps } from './types';

const pkg = require('../../package.json');

/**
 * Wires TrustPin app attestation into an Expo app at prebuild time: adds the
 * attestation keys to the configuration files the `@trustpin/react-native`
 * plugin writes, adds the App Attest entitlement on iOS, and calls the native
 * init helper right after the pinning one on both platforms.
 *
 * Expo Go cannot run this — attestation is native code. Use a development build.
 */
const withTrustPinAttest: ConfigPlugin<TrustPinAttestPluginProps | undefined> = (config, props) => {
  const resolved = resolveProps(props);
  return withTrustPinAttestAndroid(withTrustPinAttestIos(config, resolved), resolved);
};

export default createRunOncePlugin(withTrustPinAttest, pkg.name, pkg.version);
export type { TrustPinAttestPluginProps };
