/**
 * Stable cross-platform error codes. Native rejections carry one of these as
 * the rejection `code`; JS-side deterministic rejections (missing native init,
 * argument validation) use the same codes via TrustPinError.
 */
export const TrustPinErrorCodes = {
  INVALID_PROJECT_CONFIG: 'INVALID_PROJECT_CONFIG',
  ERROR_FETCHING_PINNING_INFO: 'ERROR_FETCHING_PINNING_INFO',
  CONFIGURATION_VALIDATION_FAILED: 'CONFIGURATION_VALIDATION_FAILED',
  CONFIG_INTEGRITY_FAILED: 'CONFIG_INTEGRITY_FAILED',
  INVALID_SERVER_CERT: 'INVALID_SERVER_CERT',
  PINS_MISMATCH: 'PINS_MISMATCH',
  ALL_PINS_EXPIRED: 'ALL_PINS_EXPIRED',
  DOMAIN_NOT_REGISTERED: 'DOMAIN_NOT_REGISTERED',
  FETCH_CERTIFICATE_TIMEOUT: 'FETCH_CERTIFICATE_TIMEOUT',
  ALREADY_INITIALIZED: 'ALREADY_INITIALIZED',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  CANCELLED: 'CANCELLED',
  // Android-only (surface as-is; iOS never emits them):
  SETUP_IN_PROGRESS: 'SETUP_IN_PROGRESS',
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',
  SSL_CONTEXT_SETUP_FAILED: 'SSL_CONTEXT_SETUP_FAILED',
  UNSUPPORTED_DEVICE: 'UNSUPPORTED_DEVICE',
  // Per-method fallbacks for unclassified native errors:
  AWAIT_CONFIGURATION_ERROR: 'AWAIT_CONFIGURATION_ERROR',
  VALIDATE_CONNECTION_ERROR: 'VALIDATE_CONNECTION_ERROR',
  SET_LOG_LEVEL_ERROR: 'SET_LOG_LEVEL_ERROR',
} as const;

export type TrustPinErrorCode = keyof typeof TrustPinErrorCodes;

/**
 * Error used for rejections raised in the JS layer (missing native init,
 * argument validation). Carries the same `code` shape as native rejections,
 * so `error.code` works uniformly regardless of which side rejected.
 */
export class TrustPinError extends Error {
  readonly code: TrustPinErrorCode;

  constructor(code: TrustPinErrorCode, message: string) {
    super(message);
    this.name = 'TrustPinError';
    this.code = code;
  }
}

/**
 * The message must name the missing native init step.
 */
export const NOT_INITIALIZED_MESSAGE =
  'TrustPin native module is unavailable. The native SDK was never initialized: ' +
  'call TrustPinReactNative.start(...) in ' +
  'AppDelegate.application(_:didFinishLaunchingWithOptions:) on iOS and as the ' +
  'first statement of Application.onCreate() (before loadReactNative) on ' +
  'Android, then rebuild the app (pod install / gradle sync). ' +
  'With Expo, add the @trustpin/react-native config plugin and run prebuild.';
