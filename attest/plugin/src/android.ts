import { ConfigPlugin, withMainApplication } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

import { withDangerousModAfterOthers } from './afterDangerous';
import { TrustPinAttestPluginError, TrustPinAttestPluginProps, writesKeys } from './types';

export const ASSET_FILE_NAME = 'trustpin.json';

/**
 * Adds `attest_verifier_url`, `attested_hosts` and, when set,
 * `google_cloud_project_number` to the asset the pinning plugin wrote. Keys
 * already present are left as they are.
 */
export function addAttestKeys(json: string, props: TrustPinAttestPluginProps): string {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new TrustPinAttestPluginError(`${ASSET_FILE_NAME} is not valid JSON.`);
  }
  config.attest_verifier_url ??= props.verifierUrl;
  config.attested_hosts ??= props.attestedHosts;
  if (props.googleCloudProjectNumber != null) {
    config.google_cloud_project_number ??= String(props.googleCloudProjectNumber);
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Inserts the native init call right after the pinning one, or as the first
 * statement of `onCreate()` while the pinning plugin hasn't run yet (it then
 * puts its own call first). Idempotent.
 */
export function addStartCall(contents: string, logLevel?: string): string {
  if (contents.includes('TrustPinReactNativeAttest.start(')) {
    return contents;
  }
  const call = logLevel
    ? `TrustPinReactNativeAttest.start(this, "${logLevel}", null)`
    : 'TrustPinReactNativeAttest.start(this)';
  const line = `    // App attestation: tokens for the attested hosts, from native code.\n    ${call}\n`;

  const withImport = contents.includes('import cloud.trustpin.reactnative.attest.TrustPinReactNativeAttest')
    ? contents
    : contents.replace(
        /(^import [^\n]+\n)(?![\s\S]*^import )/m,
        `$1import cloud.trustpin.reactnative.attest.TrustPinReactNativeAttest\n`,
      );

  const afterPinning = /(^[ \t]*TrustPinReactNative\.start\([^\n]*\)\n)/m;
  if (afterPinning.test(withImport)) {
    return withImport.replace(afterPinning, `$1${line}`);
  }
  const onCreate = /(override fun onCreate\(\) \{\n)/;
  if (!onCreate.test(withImport)) {
    throw new TrustPinAttestPluginError(
      'could not find onCreate() in MainApplication. ' +
        `Add "${call}" after TrustPinReactNative.start(this) manually.`,
    );
  }
  return withImport.replace(onCreate, `$1${line}\n`);
}

const withAttestKeys: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) =>
  withDangerousModAfterOthers('android', async modConfig => {
    if (!writesKeys(props)) return;
    const file = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/assets', ASSET_FILE_NAME);
    if (!fs.existsSync(file)) {
      throw new TrustPinAttestPluginError(
        `${file} not found. List the @trustpin/react-native config plugin too: it writes this file.`,
      );
    }
    fs.writeFileSync(file, addAttestKeys(fs.readFileSync(file, 'utf8'), props));
  })(config);

const withInitCall: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) =>
  withMainApplication(config, modConfig => {
    if (modConfig.modResults.language !== 'kt') {
      throw new TrustPinAttestPluginError(
        `expected a Kotlin MainApplication, found "${modConfig.modResults.language}".`,
      );
    }
    modConfig.modResults.contents = addStartCall(modConfig.modResults.contents, props.logLevel);
    return modConfig;
  });

export const withTrustPinAttestAndroid: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) =>
  withInitCall(withAttestKeys(config, props), props);
