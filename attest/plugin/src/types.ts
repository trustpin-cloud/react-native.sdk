/**
 * Props accepted by the `@trustpin/react-native-attest` config plugin. List it
 * with the `@trustpin/react-native` plugin, which writes the configuration
 * files this one adds the attestation keys to.
 */
export interface TrustPinAttestPluginProps {
  /**
   * The base URL of your TrustPin verifier: `https://` on a host name, without
   * credentials, query or fragment. Leave it out, with `attestedHosts`, when
   * the pinning plugin's `configFile`s already carry the attestation keys.
   */
  verifierUrl?: string;
  /**
   * The hosts that receive the `TrustPin-Attestation` header: exact names, or
   * `*.example.com` for exactly one label.
   */
  attestedHosts?: string[];
  /**
   * Android only: the number of the Google Cloud project linked to the app in
   * Play Console, when the policy uses Play Integrity.
   */
  googleCloudProjectNumber?: string;
  /**
   * iOS App Attest environment of the entitlement: `development` for builds
   * run from Xcode or a dev client, `production` (the default) for TestFlight
   * and the App Store.
   */
  appAttestEnvironment?: 'development' | 'production';
  /** Verbosity passed to the native init helper. */
  logLevel?: 'none' | 'error' | 'warning' | 'info' | 'debug';
}

export const LOG_LEVELS = ['none', 'error', 'warning', 'info', 'debug'] as const;
export const APP_ATTEST_ENVIRONMENTS = ['development', 'production'] as const;

export class TrustPinAttestPluginError extends Error {
  constructor(message: string) {
    super(`@trustpin/react-native-attest config plugin: ${message}`);
    this.name = 'TrustPinAttestPluginError';
  }
}

/** Validates the props; the native SDK validates the values themselves at setup. */
export function resolveProps(props: TrustPinAttestPluginProps | undefined): TrustPinAttestPluginProps {
  const resolved = props ?? {};
  const hasUrl = resolved.verifierUrl != null && resolved.verifierUrl !== '';
  const hasHosts = resolved.attestedHosts != null;
  if (hasUrl !== hasHosts) {
    throw new TrustPinAttestPluginError(
      'set verifierUrl and attestedHosts together, or neither (when your configuration files already carry them).',
    );
  }
  if (hasUrl && !resolved.verifierUrl!.startsWith('https://')) {
    throw new TrustPinAttestPluginError('verifierUrl must be an https:// URL.');
  }
  if (hasHosts && (!Array.isArray(resolved.attestedHosts) || resolved.attestedHosts.length === 0)) {
    throw new TrustPinAttestPluginError('attestedHosts must be a non-empty array of host names.');
  }
  if (
    resolved.googleCloudProjectNumber != null &&
    !/^[0-9]+$/.test(String(resolved.googleCloudProjectNumber))
  ) {
    throw new TrustPinAttestPluginError('googleCloudProjectNumber must be a string of digits.');
  }
  if (resolved.logLevel != null && !LOG_LEVELS.includes(resolved.logLevel)) {
    throw new TrustPinAttestPluginError(`logLevel must be one of ${LOG_LEVELS.join(', ')}.`);
  }
  if (
    resolved.appAttestEnvironment != null &&
    !APP_ATTEST_ENVIRONMENTS.includes(resolved.appAttestEnvironment)
  ) {
    throw new TrustPinAttestPluginError('appAttestEnvironment must be development or production.');
  }
  return resolved;
}

/** Whether the plugin writes the attestation keys into the configuration files. */
export function writesKeys(props: TrustPinAttestPluginProps): boolean {
  return props.verifierUrl != null && props.verifierUrl !== '';
}
