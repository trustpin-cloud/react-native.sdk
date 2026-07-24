import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withProjectBuildGradle,
} from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

import {
  MIN_SDK_VERSION,
  REQUIRED_KOTLIN_VERSION,
  TrustPinPluginError,
  TrustPinPluginProps,
  usesInlineCredentials,
} from './types';

export const ASSET_FILE_NAME = 'trustpin.json';
export const ALLOW_NON_OEM_IMAGES_KEY = 'cloud.trustpin.android.allowNonOemImages';

/** Builds the asset file the native `fromAssets` loader reads. */
export function buildAssetJson(props: TrustPinPluginProps): string {
  const config: Record<string, string> = {
    organization_id: props.organizationId!,
    project_id: props.projectId!,
    public_key: props.publicKey!,
  };
  if (props.mode) {
    config.mode = props.mode;
  }
  if (props.configurationUrl) {
    config.configuration_url = props.configurationUrl;
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Inserts the native startup call during Android app bootstrap, before the JS
 * runtime comes online. This is idempotent across prebuilds.
 */
export function addStartCall(contents: string, logLevel?: string): string {
  if (contents.includes('TrustPinReactNative.start(')) {
    return contents;
  }

  const call = logLevel
    ? `TrustPinReactNative.start(this, "${logLevel}")`
    : 'TrustPinReactNative.start(this)';

  const withImport = contents.includes('import cloud.trustpin.reactnative.TrustPinReactNative')
    ? contents
    : contents.replace(
        /(^import [^\n]+\n)(?![\s\S]*^import )/m,
        `$1import cloud.trustpin.reactnative.TrustPinReactNative\n`,
      );

  const onCreate = /(override fun onCreate\(\) \{\n)/;
  if (!onCreate.test(withImport)) {
    throw new TrustPinPluginError(
      'could not find onCreate() in MainApplication. ' +
        `Add "${call}" as its first statement, before loadReactNative(this).`,
    );
  }

  return withImport.replace(
    onCreate,
    `$1    // Native startup hook for TrustPin.\n` +
      `    ${call}\n\n`,
  );
}

/**
 * Pins the Kotlin toolchain and the Android floor in the root build.gradle.
 *
 * Both are requirements of the native SDK rather than preferences: the Kotlin
 * SDK ships 2.3.0 metadata that React Native's default 2.1.20 toolchain cannot
 * read, and the SDK's own floor is minSdk 25.
 */
export function patchProjectBuildGradle(contents: string): string {
  let next = contents;

  if (/minSdkVersion\s*=\s*(\d+)/.test(next)) {
    // Bare React Native declares the floor in the buildscript ext block.
    next = next.replace(/minSdkVersion\s*=\s*(\d+)/, (match, value) => {
      const current = Number(value);
      if (current >= MIN_SDK_VERSION) {
        return match;
      }
      console.warn(
        `@trustpin/react-native: raising minSdkVersion from ${current} to ` +
          `${MIN_SDK_VERSION}, the floor required by the TrustPin Kotlin SDK.`,
      );
      return `minSdkVersion = ${MIN_SDK_VERSION}`;
    });
  } else {
    // Expo's template has no ext block: the expo-root-project plugin fills in
    // defaults, but only for properties that are not already set. Declaring
    // the floor before that plugin applies is therefore what takes effect.
    const anchor = /^apply plugin: ["']expo-root-project["']/m;
    if (!anchor.test(next)) {
      throw new TrustPinPluginError(
        `could not raise minSdkVersion to ${MIN_SDK_VERSION} in android/build.gradle: ` +
          'no ext.minSdkVersion and no expo-root-project plugin to anchor to. ' +
          'Set minSdkVersion manually.',
      );
    }
    console.warn(
      `@trustpin/react-native: pinning minSdkVersion to ${MIN_SDK_VERSION}, ` +
        'the floor required by the TrustPin Kotlin SDK.',
    );
    next = next.replace(
      anchor,
      `ext {\n` +
        `    // Required by the TrustPin Kotlin SDK. Declared before\n` +
        `    // expo-root-project, whose defaults only apply to unset values.\n` +
        `    minSdkVersion = ${MIN_SDK_VERSION}\n` +
        `    // Must match the pinned Kotlin plugin below: Expo derives its KSP\n` +
        `    // version from this value, and a mismatch breaks annotation processing.\n` +
        `    kotlinVersion = "${REQUIRED_KOTLIN_VERSION}"\n` +
        `}\n\n$&`,
    );
  }

  next = next.replace(/kotlinVersion\s*=\s*["'][^"']+["']/, `kotlinVersion = "${REQUIRED_KOTLIN_VERSION}"`);

  // The version-less classpath resolves to React Native's pinned Kotlin plugin,
  // which cannot read the native SDK's metadata; ext.kotlinVersion does not
  // override it, so the version has to be on the classpath itself.
  if (/classpath\(["']org\.jetbrains\.kotlin:kotlin-gradle-plugin["']\)/.test(next)) {
    next = next.replace(
      /classpath\(["']org\.jetbrains\.kotlin:kotlin-gradle-plugin["']\)/,
      `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${REQUIRED_KOTLIN_VERSION}")`,
    );
  } else {
    next = next.replace(
      /classpath\(["']org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^"']+["']\)/,
      `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${REQUIRED_KOTLIN_VERSION}")`,
    );
  }

  return next;
}

const withTrustPinAsset: ConfigPlugin<TrustPinPluginProps> = (config, props) =>
  withDangerousMod(config, [
    'android',
    async modConfig => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const assetsDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/assets',
      );

      const contents = usesInlineCredentials(props)
        ? buildAssetJson(props)
        : readUserConfigFile(projectRoot, props.android!.configFile!);

      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, ASSET_FILE_NAME), contents);
      return modConfig;
    },
  ]);

function readUserConfigFile(projectRoot: string, configFile: string): string {
  const source = path.resolve(projectRoot, configFile);
  if (!fs.existsSync(source)) {
    throw new TrustPinPluginError(`configFile not found: ${source}`);
  }
  return fs.readFileSync(source, 'utf8');
}

const withInitCall: ConfigPlugin<TrustPinPluginProps> = (config, props) =>
  withMainApplication(config, modConfig => {
    if (modConfig.modResults.language !== 'kt') {
      throw new TrustPinPluginError(
        `expected a Kotlin MainApplication, found "${modConfig.modResults.language}".`,
      );
    }
    modConfig.modResults.contents = addStartCall(modConfig.modResults.contents, props.logLevel);
    return modConfig;
  });

const withToolchainPins: ConfigPlugin = config =>
  withProjectBuildGradle(config, modConfig => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new TrustPinPluginError(
        'expected a Groovy android/build.gradle; pin Kotlin ' +
          `${REQUIRED_KOTLIN_VERSION} and minSdk ${MIN_SDK_VERSION} manually.`,
      );
    }
    modConfig.modResults.contents = patchProjectBuildGradle(modConfig.modResults.contents);
    return modConfig;
  });

const withAllowNonOemImages: ConfigPlugin<TrustPinPluginProps> = (config, props) =>
  withAndroidManifest(config, modConfig => {
    if (!props.android?.allowNonOemImages) {
      return modConfig;
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      ALLOW_NON_OEM_IMAGES_KEY,
      'true',
    );
    return modConfig;
  });

export const withTrustPinAndroid: ConfigPlugin<TrustPinPluginProps> = (config, props) => {
  let next = withTrustPinAsset(config, props);
  next = withInitCall(next, props);
  next = withToolchainPins(next);
  return withAllowNonOemImages(next, props);
};
