/**
 * Props accepted by the `@trustpin/react-native` config plugin.
 *
 * These values identify the app's TrustPin configuration and are used by the
 * native runtime to verify signed configuration material. Keep them out of
 * public repositories.
 */
export interface TrustPinPluginProps {
  organizationId?: string;
  projectId?: string;
  /** Base64 public key used to verify the signed pinning configuration. */
  publicKey?: string;
  /** `strict` (default, production) rejects unregistered domains. */
  mode?: 'strict' | 'permissive';
  /**
   * Optional HTTPS endpoint for a self-hosted signed configuration. It must
   * point at a public host: the native SDK rejects loopback and private
   * addresses.
   */
  configurationUrl?: string;
  /** Verbosity passed to the native init helper, before setup runs. */
  logLevel?: 'none' | 'error' | 'info' | 'debug';
  /**
   * Path, relative to the project root, of a signed configuration downloaded
   * from the TrustPin dashboard. The plugin copies it into both native
   * bundles and points the generated config files at it, so the SDK can fall
   * back to it when no online source and no previously fetched configuration
   * is available, typically the app's very first start during an outage.
   *
   * Use it only in apps protected by runtime application self-protection
   * (RASP) that guards bundled resources against modification, and regenerate
   * the file in CI on every release so it never goes stale.
   */
  embeddedConfigurationFile?: string;
  ios?: {
    /** Path to an existing TrustPin-Info.plist, relative to the project root. */
    configFile?: string;
  };
  android?: {
    /** Path to an existing trustpin.json, relative to the project root. */
    configFile?: string;
    /**
     * Writes the `cloud.trustpin.android.allowNonOemImages` meta-data, which
     * lets release builds run on community or custom OS builds on real
     * devices. It does **not** cover emulators: release builds there fail with
     * UNSUPPORTED_DEVICE regardless, so use debug-built variants for
     * development, CI and emulator QA.
     */
    allowNonOemImages?: boolean;
  };
}

export const LOG_LEVELS = ['none', 'error', 'info', 'debug'] as const;
export const MODES = ['strict', 'permissive'] as const;

/** Android floor imposed by the TrustPin Kotlin SDK. */
export const MIN_SDK_VERSION = 25;

/**
 * The TrustPin Kotlin SDK is published with Kotlin 2.3.0 binary metadata.
 * React Native's Gradle plugin still pins 2.1.20, which cannot read it, and an
 * app's `ext.kotlinVersion` does not override that — the Kotlin plugin version
 * has to be pinned on the buildscript classpath.
 */
export const REQUIRED_KOTLIN_VERSION = '2.3.0';

export class TrustPinPluginError extends Error {
  constructor(message: string) {
    super(`@trustpin/react-native config plugin: ${message}`);
    this.name = 'TrustPinPluginError';
  }
}

/**
 * Validates props and decides, per platform, whether credentials are generated
 * from inline props or taken from a user-supplied file. Mixing both for the
 * same platform is rejected rather than silently preferring one.
 */
export function resolveProps(props: TrustPinPluginProps | undefined): TrustPinPluginProps {
  const resolved = props ?? {};
  const inlineKeys = (['organizationId', 'projectId', 'publicKey'] as const).filter(
    key => resolved[key] != null && resolved[key] !== '',
  );

  for (const platform of ['ios', 'android'] as const) {
    const configFile = resolved[platform]?.configFile;
    if (configFile && inlineKeys.length > 0) {
      throw new TrustPinPluginError(
        `${platform}.configFile is set together with inline credentials ` +
          `(${inlineKeys.join(', ')}). Use one or the other: the file would ` +
          `be overwritten by the generated one.`,
      );
    }
    if (!configFile && inlineKeys.length === 0) {
      throw new TrustPinPluginError(
        `no credentials for ${platform}. Provide organizationId, projectId and ` +
          `publicKey, or point ${platform}.configFile at an existing config file.`,
      );
    }
  }

  if (inlineKeys.length > 0 && inlineKeys.length < 3) {
    const missing = (['organizationId', 'projectId', 'publicKey'] as const).filter(
      key => !inlineKeys.includes(key),
    );
    throw new TrustPinPluginError(`missing required prop(s): ${missing.join(', ')}.`);
  }

  if (resolved.mode && !MODES.includes(resolved.mode)) {
    throw new TrustPinPluginError(
      `mode must be one of ${MODES.join(', ')}; got "${resolved.mode}".`,
    );
  }

  if (resolved.logLevel && !LOG_LEVELS.includes(resolved.logLevel)) {
    throw new TrustPinPluginError(
      `logLevel must be one of ${LOG_LEVELS.join(', ')}; got "${resolved.logLevel}".`,
    );
  }

  if (resolved.embeddedConfigurationFile) {
    for (const platform of ['ios', 'android'] as const) {
      if (resolved[platform]?.configFile) {
        throw new TrustPinPluginError(
          `embeddedConfigurationFile is set together with ${platform}.configFile. ` +
            'The plugin can only add the embedded-configuration key to a config ' +
            'file it generates; declare it in your own file instead ' +
            '(EmbeddedConfigurationFile / embedded_configuration_asset) and ship ' +
            'the payload with the app yourself.',
        );
      }
    }
  }

  if (resolved.configurationUrl && !resolved.configurationUrl.startsWith('https://')) {
    throw new TrustPinPluginError(
      `configurationUrl must be an https URL; got "${resolved.configurationUrl}".`,
    );
  }

  return resolved;
}

export function usesInlineCredentials(props: TrustPinPluginProps): boolean {
  return props.organizationId != null && props.organizationId !== '';
}
