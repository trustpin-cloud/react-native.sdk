import NativeTrustPinReactNative from './NativeTrustPinReactNative';
import type { Spec, ValidationEventPayload, LogEventPayload } from './NativeTrustPinReactNative';
import { TrustPinError, TrustPinErrorCodes, NOT_INITIALIZED_MESSAGE } from './errors';
import type { TrustPinErrorCode } from './errors';

/** Log verbosity accepted by {@link TrustPin.setLogLevel}. */
export type TrustPinLogLevel = 'none' | 'error' | 'info' | 'debug';

/**
 * A definitive pin-validation verdict: domain + code + timestamp only — the
 * presented certificate never crosses into JS.
 */
export interface TrustPinValidationEvent {
  domain: string;
  /** Stable error code of the failure verdict, or `null` for a success event. */
  code: string | null;
  timestampMs: number;
}

/** One native TrustPin log message. */
export interface TrustPinLogEvent {
  level: Exclude<TrustPinLogLevel, 'none'>;
  message: string;
  timestampMs: number;
}

export interface TrustPinEventSubscription {
  remove(): void;
}

const LOG_LEVELS: readonly TrustPinLogLevel[] = ['none', 'error', 'info', 'debug'];

/**
 * Tracks whether each event stream has already replayed its buffered startup
 * notifications to a JS listener.
 */
const earlyEventsFlushed = { validation: false, log: false };

function native(): Spec {
  if (NativeTrustPinReactNative == null) {
    throw new TrustPinError(TrustPinErrorCodes.INVALID_PROJECT_CONFIG, NOT_INITIALIZED_MESSAGE);
  }
  return NativeTrustPinReactNative;
}

function rejectWith<T>(code: TrustPinErrorCode, message: string): Promise<T> {
  return Promise.reject(new TrustPinError(code, message));
}

/**
 * Timeout convention: `undefined` or a non-positive/non-finite value defers to
 * the native SDK's default.
 */
function normalizeTimeout(timeoutMs: number | undefined): number | undefined {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : undefined;
}

function subscribe(
  stream: 'validation' | 'log',
  attach: (native: Spec) => { remove(): void },
): TrustPinEventSubscription {
  const module = native();
  const subscription = attach(module);
  // Replay this stream's buffered events only after its listener is attached,
  // so startup notifications reach the first subscriber instead of being lost.
  if (!earlyEventsFlushed[stream]) {
    earlyEventsFlushed[stream] = true;
    if (stream === 'validation') {
      module.flushEarlyValidationEvents();
    } else {
      module.flushEarlyLogEvents();
    }
  }
  return subscription;
}

export const TrustPin = {
  /**
   * Fail-closed readiness gate: resolves once the signed pinning configuration
   * has been fetched, verified, and activated. `timeoutMs` undefined → native
   * default (the native SDK clamps to its supported range, currently 10–120s).
   * Rejects with `FETCH_CERTIFICATE_TIMEOUT` when the bound is exceeded.
   */
  awaitConfiguration(timeoutMs?: number): Promise<void> {
    let module: Spec;
    try {
      module = native();
    } catch (e) {
      return Promise.reject(e);
    }
    return module.awaitConfiguration(normalizeTimeout(timeoutMs));
  },

  /** Whether a validated configuration is currently loaded. */
  isConfigurationLoaded(): Promise<boolean> {
    let module: Spec;
    try {
      module = native();
    } catch (e) {
      return Promise.reject(e);
    }
    return module.isConfigurationLoaded();
  },

  /**
   * Manually validates the TLS certificate of `host:port` against the pinning
   * configuration (validated natively; certificate material stays native).
   * Resolves on success; rejects with a stable code otherwise.
   */
  validateConnection(host: string, port: number = 443, timeoutMs?: number): Promise<void> {
    if (typeof host !== 'string' || host.trim().length === 0) {
      return rejectWith(
        TrustPinErrorCodes.INVALID_ARGUMENTS,
        'validateConnection: host must be a non-empty string.',
      );
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return rejectWith(
        TrustPinErrorCodes.INVALID_ARGUMENTS,
        `validateConnection: port must be an integer in [1, 65535], got ${port}.`,
      );
    }
    let module: Spec;
    try {
      module = native();
    } catch (e) {
      return Promise.reject(e);
    }
    return module.validateConnection(host.trim(), port, normalizeTimeout(timeoutMs));
  },

  /**
   * Sets native log verbosity. Full startup coverage requires the native init
   * helper's log-level parameter; this call adjusts verbosity at runtime.
   */
  setLogLevel(level: TrustPinLogLevel): Promise<void> {
    if (!LOG_LEVELS.includes(level)) {
      return rejectWith(
        TrustPinErrorCodes.INVALID_ARGUMENTS,
        `setLogLevel: level must be one of ${LOG_LEVELS.join(', ')}; got ${String(level)}.`,
      );
    }
    let module: Spec;
    try {
      module = native();
    } catch (e) {
      return Promise.reject(e);
    }
    return module.setLogLevel(level);
  },

  /**
   * Subscribes to definitive validation verdicts. Events buffered from before
   * JS was alive are replayed to the first subscriber. Throws
   * TrustPinError(INVALID_PROJECT_CONFIG) if the native module is missing.
   */
  onValidationEvent(
    listener: (event: TrustPinValidationEvent) => void,
  ): TrustPinEventSubscription {
    return subscribe('validation', module =>
      module.onValidationEvent((payload: ValidationEventPayload) => {
        listener({
          domain: payload.domain,
          code: payload.code ?? null,
          timestampMs: payload.timestampMs,
        });
      }),
    );
  },

  /**
   * Subscribes to native TrustPin log messages (already filtered by the
   * configured log level). Buffered early messages replay to the first
   * subscriber.
   */
  onLogEvent(listener: (event: TrustPinLogEvent) => void): TrustPinEventSubscription {
    return subscribe('log', module =>
      module.onLogEvent((payload: LogEventPayload) => {
        listener({
          level: (payload.level === 'error' || payload.level === 'debug'
            ? payload.level
            : 'info') as TrustPinLogEvent['level'],
          message: payload.message,
          timestampMs: payload.timestampMs,
        });
      }),
    );
  },
};

export { TrustPinError, TrustPinErrorCodes };
export type { TrustPinErrorCode };
export default TrustPin;
