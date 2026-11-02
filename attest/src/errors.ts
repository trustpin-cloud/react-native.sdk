/**
 * Stable error codes of the attestation module. Native rejections carry one
 * of these as the rejection `code`; new codes can appear in a minor release,
 * so handle unknown ones.
 */
export const TrustPinAttestErrorCodes = {
  /** A configuration value was rejected, or the configuration file is missing. */
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  /** Setup ran twice. */
  ALREADY_INITIALIZED: 'ALREADY_INITIALIZED',
  /** Called before the native init helper set the module up. */
  NOT_SET_UP: 'NOT_SET_UP',
  /** App Attest is unsupported on this device (iOS). */
  UNSUPPORTED_DEVICE: 'UNSUPPORTED_DEVICE',
  /** The device can't produce the evidence the policy requires. */
  EVIDENCE_UNAVAILABLE: 'EVIDENCE_UNAVAILABLE',
  /** The policy requires a token binding and none is set yet. */
  BINDING_REQUIRED: 'BINDING_REQUIRED',
  /** The verifier refused; see `reasons`. */
  ATTESTATION_FAILED: 'ATTESTATION_FAILED',
  /** The verifier couldn't be reached, including when strict pinning refuses its host. */
  VERIFIER_UNAVAILABLE: 'VERIFIER_UNAVAILABLE',
  /** The verifier is too old for this SDK: update it. */
  VERIFIER_INCOMPATIBLE: 'VERIFIER_INCOMPATIBLE',
  /** `assertionHeaders` got a digest that isn't 32 bytes. */
  INVALID_DIGEST: 'INVALID_DIGEST',
  /** An argument was rejected before it reached the native module. */
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  /** The operation was cancelled. */
  CANCELLED: 'CANCELLED',
  /** Any other native failure. */
  ATTEST_ERROR: 'ATTEST_ERROR',
} as const;

export type TrustPinAttestErrorCode = keyof typeof TrustPinAttestErrorCodes;

/**
 * The error of a rejected call, of a failed state and of failure events.
 * `code` is one of {@link TrustPinAttestErrorCodes} or a newer one.
 */
export class TrustPinAttestError extends Error {
  readonly code: string;
  /** For `ATTESTATION_FAILED`: the verifier's reason codes. Empty otherwise. */
  readonly reasons: readonly string[];

  constructor(code: string, message: string, reasons: readonly string[] = []) {
    super(message);
    this.name = 'TrustPinAttestError';
    this.code = code;
    this.reasons = reasons;
  }
}

/** The message must name the missing native init step. */
export const NOT_INITIALIZED_MESSAGE =
  'TrustPin attestation native module is unavailable. Call ' +
  'TrustPinReactNativeAttest.start(...) right after TrustPinReactNative.start(...) ' +
  'in AppDelegate.application(_:didFinishLaunchingWithOptions:) on iOS and in ' +
  'Application.onCreate() on Android, then rebuild the app (pod install / gradle sync). ' +
  'With Expo, add the @trustpin/react-native-attest config plugin and run prebuild.';

/** Converts a native rejection (or anything thrown) into a TrustPinAttestError. */
export function toAttestError(error: unknown): TrustPinAttestError {
  if (error instanceof TrustPinAttestError) return error;
  const candidate = error as { code?: unknown; message?: unknown; userInfo?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : TrustPinAttestErrorCodes.ATTEST_ERROR;
  const message = typeof candidate?.message === 'string' ? candidate.message : String(error);
  const info = candidate?.userInfo as { reasons?: unknown } | null | undefined;
  const reasons = Array.isArray(info?.reasons)
    ? info.reasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  return new TrustPinAttestError(code, message, reasons);
}
