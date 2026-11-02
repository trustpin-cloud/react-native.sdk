import { ConfigPlugin, IOSConfig, withAppDelegate, withEntitlementsPlist } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

import { withDangerousModAfterOthers } from './afterDangerous';
import { TrustPinAttestPluginError, TrustPinAttestPluginProps, writesKeys } from './types';

export const PLIST_FILE_NAME = 'TrustPin-Info.plist';
export const APP_ATTEST_ENTITLEMENT = 'com.apple.developer.devicecheck.appattest-environment';

/**
 * Adds `AttestVerifierURL` and `AttestedHosts` to the plist the pinning plugin
 * wrote. Keys already present are left as they are.
 */
export function addAttestKeys(plist: string, props: TrustPinAttestPluginProps): string {
  if (!plist.includes('</dict>')) {
    throw new TrustPinAttestPluginError(`${PLIST_FILE_NAME} has no top-level <dict>.`);
  }
  const entries: string[] = [];
  if (!plist.includes('<key>AttestVerifierURL</key>')) {
    entries.push(`\t<key>AttestVerifierURL</key>\n\t<string>${escapeXml(props.verifierUrl!)}</string>`);
  }
  if (!plist.includes('<key>AttestedHosts</key>')) {
    const hosts = props.attestedHosts!.map(host => `\t\t<string>${escapeXml(host)}</string>`).join('\n');
    entries.push(`\t<key>AttestedHosts</key>\n\t<array>\n${hosts}\n\t</array>`);
  }
  if (entries.length === 0) return plist;
  const index = plist.lastIndexOf('</dict>');
  return `${plist.slice(0, index)}${entries.join('\n')}\n${plist.slice(index)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inserts the native init call right after the pinning one, or as the first
 * statement of `didFinishLaunchingWithOptions` while the pinning plugin hasn't
 * run yet (it then puts its own call first). Idempotent.
 */
export function addStartCall(contents: string, logLevel?: string): string {
  if (contents.includes('TrustPinReactNativeAttest.start(')) {
    return contents;
  }
  const call = logLevel
    ? `TrustPinReactNativeAttest.start(logLevel: .${logLevel})`
    : 'TrustPinReactNativeAttest.start()';
  const line = `    // App attestation: tokens for the attested hosts, from native code.\n    ${call}\n`;

  const withImport = contents.includes('import TrustPinReactNativeAttest')
    ? contents
    : contents.replace(/(^import [^\n]+\n)(?![\s\S]*^import )/m, `$1import TrustPinReactNativeAttest\n`);

  const afterPinning = /(^[ \t]*TrustPinReactNative\.start\([^\n]*\)\n)/m;
  if (afterPinning.test(withImport)) {
    return withImport.replace(afterPinning, `$1${line}`);
  }
  const launchSignature = /(func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\) -> Bool \{\n)/;
  if (!launchSignature.test(withImport)) {
    throw new TrustPinAttestPluginError(
      'could not find application(_:didFinishLaunchingWithOptions:) in AppDelegate.swift. ' +
        `Add "${call}" after TrustPinReactNative.start() manually.`,
    );
  }
  return withImport.replace(launchSignature, `$1${line}\n`);
}

const withAttestKeys: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) =>
  withDangerousModAfterOthers('ios', async modConfig => {
    if (!writesKeys(props)) return;
    const projectRoot = modConfig.modRequest.projectRoot;
    const appName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const file = path.join(modConfig.modRequest.platformProjectRoot, appName, PLIST_FILE_NAME);
    if (!fs.existsSync(file)) {
      throw new TrustPinAttestPluginError(
        `${file} not found. List the @trustpin/react-native config plugin too: it writes this file.`,
      );
    }
    fs.writeFileSync(file, addAttestKeys(fs.readFileSync(file, 'utf8'), props));
  })(config);

const withAppAttestEntitlement: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) =>
  withEntitlementsPlist(config, modConfig => {
    modConfig.modResults[APP_ATTEST_ENTITLEMENT] = props.appAttestEnvironment ?? 'production';
    return modConfig;
  });

const withInitCall: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) =>
  withAppDelegate(config, modConfig => {
    if (modConfig.modResults.language !== 'swift') {
      throw new TrustPinAttestPluginError(
        `expected a Swift AppDelegate, found "${modConfig.modResults.language}". ` +
          'Add [TrustPinReactNativeAttest startWithLogLevelName:nil debugToken:nil] manually.',
      );
    }
    modConfig.modResults.contents = addStartCall(modConfig.modResults.contents, props.logLevel);
    return modConfig;
  });

export const withTrustPinAttestIos: ConfigPlugin<TrustPinAttestPluginProps> = (config, props) => {
  let next = withAttestKeys(config, props);
  next = withAppAttestEntitlement(next, props);
  return withInitCall(next, props);
};
